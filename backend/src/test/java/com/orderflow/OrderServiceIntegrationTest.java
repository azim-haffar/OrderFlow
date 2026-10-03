package com.orderflow;

import com.orderflow.dto.OrderResponse;
import com.orderflow.dto.PlaceOrderRequest;
import com.orderflow.entity.Order;
import com.orderflow.event.OrderPlacedEvent;
import com.orderflow.service.InventoryService;
import com.orderflow.repository.OrderRepository;
import com.orderflow.repository.ProductRepository;
import com.orderflow.service.OrderService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Duration;
import java.math.BigDecimal;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@SpringBootTest
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OrderServiceIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .withDatabaseName("orderflow")
            .withUsername("orderflow")
            .withPassword("orderflow");

    @Container
    static KafkaContainer kafka = new KafkaContainer(
            DockerImageName.parse("confluentinc/cp-kafka:7.5.0"));

    @Container
    @SuppressWarnings("resource")
    static GenericContainer<?> redis = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
            .withExposedPorts(6379);

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379).toString());
    }

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private InventoryService inventoryService;

    @Test
    void concurrentDuplicateEventsDeductStockOnlyOnce() throws Exception {
        long productId = 2L;
        int initialStock = productRepository.findById(productId).orElseThrow().getStockQuantity();
        Order order = new Order();
        order.setCustomerId("duplicate-delivery-test");
        order.setTotalAmount(BigDecimal.TEN);
        Order saved = orderRepository.saveAndFlush(order);
        OrderPlacedEvent event = new OrderPlacedEvent(saved.getId(), productId, 2,
                BigDecimal.TEN, saved.getCustomerId(), saved.getCreatedAt());
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                start.await();
                inventoryService.processOrderPlaced(event);
                return null;
            });
            var second = executor.submit(() -> {
                start.await();
                inventoryService.processOrderPlaced(event);
                return null;
            });
            start.countDown();
            first.get(30, TimeUnit.SECONDS);
            second.get(30, TimeUnit.SECONDS);
        }
        assertThat(productRepository.findById(productId).orElseThrow().getStockQuantity())
                .isEqualTo(initialStock - 2);
        assertThat(orderRepository.findById(saved.getId()).orElseThrow().getStatus())
                .isEqualTo(Order.Status.CONFIRMED);
    }

    @Test
    void placeOrder_shouldBeConfirmedAndStockDecremented() {
        // Product ID 1 is "Mechanical Keyboard Pro" with 50 stock (seeded by Flyway)
        long productId = 1L;
        int initialStock = productRepository.findById(productId)
                .orElseThrow().getStockQuantity();

        PlaceOrderRequest request = new PlaceOrderRequest(productId, 2, "customer-test-1");
        OrderResponse placed = orderService.placeOrder(request);

        assertThat(placed.status()).isEqualTo("PLACED");
        assertThat(placed.id()).isNotNull();

        // Wait for Kafka consumer to process and set status to CONFIRMED
        await()
                .atMost(Duration.ofSeconds(30))
                .pollInterval(Duration.ofMillis(500))
                .untilAsserted(() -> {
                    Order order = orderRepository.findById(placed.id()).orElseThrow();
                    assertThat(order.getStatus()).isEqualTo(Order.Status.CONFIRMED);
                });

        // Assert stock was decremented
        int finalStock = productRepository.findById(productId).orElseThrow().getStockQuantity();
        assertThat(finalStock).isEqualTo(initialStock - 2);
    }

    @Test
    void placeOrder_shouldBeCancelledWhenInsufficientStock() {
        // Product 4 (USB-C Hub) has 100 stock — place order for more than available
        long productId = 4L;
        int currentStock = productRepository.findById(productId)
                .orElseThrow().getStockQuantity();

        PlaceOrderRequest request = new PlaceOrderRequest(productId, currentStock + 999, "customer-test-2");
        OrderResponse placed = orderService.placeOrder(request);

        assertThat(placed.status()).isEqualTo("PLACED");

        await()
                .atMost(Duration.ofSeconds(30))
                .pollInterval(Duration.ofMillis(500))
                .untilAsserted(() -> {
                    Order order = orderRepository.findById(placed.id()).orElseThrow();
                    assertThat(order.getStatus()).isEqualTo(Order.Status.CANCELLED);
                });

        // Stock must not have changed
        int stockAfter = productRepository.findById(productId).orElseThrow().getStockQuantity();
        assertThat(stockAfter).isEqualTo(currentStock);
    }
}
