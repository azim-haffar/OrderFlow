package com.orderflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orderflow.config.KafkaConfig;
import com.orderflow.dto.PlaceOrderRequest;
import com.orderflow.entity.Order;
import com.orderflow.entity.OutboxEvent;
import com.orderflow.event.OrderPlacedEvent;
import com.orderflow.exception.OrderNotCancellableException;
import com.orderflow.outbox.OutboxPoller;
import com.orderflow.repository.OrderRepository;
import com.orderflow.repository.OutboxEventRepository;
import com.orderflow.repository.ProductRepository;
import com.orderflow.service.InventoryService;
import com.orderflow.service.OrderService;
import com.orderflow.service.ProductService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

// Real PostgreSQL transactions and locks; real Kafka and Redis. Spies inject
// failures only at the cache/publish-mark boundary, not into database behavior.
@SpringBootTest(properties = {"orderflow.scheduling.enabled=false",
        "spring.kafka.listener.auto-startup=false"})
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OrderReliabilityIntegrationTest {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15");
    @Container
    static KafkaContainer kafka = new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.5.0"));
    @Container
    static GenericContainer<?> redis = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
            .withExposedPorts(6379);

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
    }

    @Autowired OrderService orders;
    @Autowired InventoryService inventory;
    @Autowired OrderRepository orderRepository;
    @Autowired ProductRepository products;
    @SpyBean ProductService productService;
    @SpyBean OutboxEventRepository outbox;
    @Autowired ObjectMapper mapper;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    @Autowired KafkaListenerEndpointRegistry listeners;
    @Autowired KafkaTemplate<String, Object> producer;
    @Autowired OutboxPoller poller;

    @AfterEach
    void stopListeners() {
        CountDownLatch stopped = new CountDownLatch(1);
        listeners.stop(stopped::countDown);
        await().atMost(Duration.ofSeconds(15)).until(() -> stopped.getCount() == 0);
        reset(outbox);
        outbox.deleteAll();
    }

    private OrderPlacedEvent placed() throws Exception {
        var response = orders.placeOrder(new PlaceOrderRequest(1L, 2, "reliability-test"));
        OutboxEvent record = outbox.findTop20ByStatusOrderByCreatedAtAsc("PENDING").stream()
                .filter(row -> row.getAggregateId().equals(response.id().toString())).findFirst().orElseThrow();
        return mapper.readValue(record.getPayload(), OrderPlacedEvent.class);
    }

    private int stock() {
        return products.findById(1L).orElseThrow().getStockQuantity();
    }

    private Order.Status status(OrderPlacedEvent event) {
        return orderRepository.findById(event.orderId()).orElseThrow().getStatus();
    }

    @Test
    void repeatedDeliveryUsesDurableTerminalStatus() throws Exception {
        var event = placed();
        int before = stock();
        inventory.processOrderPlaced(event);
        inventory.processOrderPlaced(event); // separate transaction, fresh entity
        assertThat(stock()).isEqualTo(before - 2);
        assertThat(status(event)).isEqualTo(Order.Status.CONFIRMED);
    }

    @Test
    void deliveryAfterCancellationLeavesStockUntouched() throws Exception {
        var event = placed();
        int before = stock();
        orders.cancelOrder(event.orderId());
        inventory.processOrderPlaced(event);
        inventory.processOrderPlaced(event);
        assertThat(stock()).isEqualTo(before);
        assertThat(status(event)).isEqualTo(Order.Status.CANCELLED);
    }

    @Test
    void concurrentDuplicateWaitsForFirstTransaction() throws Exception {
        var event = placed();
        int before = stock();
        overlap(() -> inventory.processOrderPlaced(event), () -> inventory.processOrderPlaced(event));
        assertThat(stock()).isEqualTo(before - 2);
        assertThat(status(event)).isEqualTo(Order.Status.CONFIRMED);
    }

    @Test
    void cancellationWinsWhileProcessingWaitsOnOrderLock() throws Exception {
        var event = placed();
        int before = stock();
        overlap(() -> orders.cancelOrder(event.orderId()), () -> inventory.processOrderPlaced(event));
        assertThat(stock()).isEqualTo(before);
        assertThat(status(event)).isEqualTo(Order.Status.CANCELLED);
    }

    @Test
    void processingWinsAndWaitingCancellationReportsConflict() throws Exception {
        var event = placed();
        int before = stock();
        overlap(() -> inventory.processOrderPlaced(event),
                () -> assertThatThrownBy(() -> orders.cancelOrder(event.orderId()))
                        .isInstanceOf(OrderNotCancellableException.class));
        assertThat(stock()).isEqualTo(before - 2);
        assertThat(status(event)).isEqualTo(Order.Status.CONFIRMED);
    }

    // Hold the winner's transaction open, observe the loser waiting in PostgreSQL,
    // then commit. This proves overlap instead of relying on sleeps or thread timing.
    private void overlap(Runnable winner, Runnable loser) throws Exception {
        CountDownLatch changed = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
                winner.run();
                changed.countDown();
                try {
                    if (!commit.await(15, TimeUnit.SECONDS)) throw new AssertionError("Commit latch timed out");
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(ex);
                }
            }));
            assertThat(changed.await(15, TimeUnit.SECONDS)).isTrue();
            var second = executor.submit(loser);
            await().atMost(Duration.ofSeconds(10)).until(() -> jdbc.queryForObject(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
                            + "AND wait_event_type = 'Lock' AND query ILIKE '%orders%'", Integer.class) > 0);
            commit.countDown();
            first.get(15, TimeUnit.SECONDS);
            second.get(15, TimeUnit.SECONDS);
        } finally {
            commit.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(20, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void kafkaRetriesRolledBackTransactionAndDecrementsOnce() throws Exception {
        var event = placed();
        int before = stock();
        // Failure occurs after stock/status mutation but before transaction commit.
        doThrow(new IllegalStateException("injected transient cache failure"))
                .doCallRealMethod().when(productService).evictProductCache(event.productId());
        listeners.start();
        producer.send(KafkaConfig.ORDER_EVENTS_TOPIC, event.orderId().toString(), event).get(10, TimeUnit.SECONDS);
        await().atMost(Duration.ofSeconds(40)).untilAsserted(() -> {
            assertThat(status(event)).isEqualTo(Order.Status.CONFIRMED);
            assertThat(stock()).isEqualTo(before - 2);
            verify(productService, times(2)).evictProductCache(event.productId());
        });
    }

    @Test
    void outboxRepublishAfterAcknowledgementBeforeMarkIsSafe() throws Exception {
        var event = placed();
        int before = stock();
        OutboxEvent row = outbox.findTop20ByStatusOrderByCreatedAtAsc("PENDING").getFirst();
        // Broker ack succeeds, then marking PUBLISHED fails: real duplicate window.
        doThrow(new IllegalStateException("injected publish-mark failure"))
                .when(outbox).markPublished(eq(row.getId()), any());
        listeners.start();
        poller.pollAndPublish();
        assertThat(outbox.findById(row.getId()).orElseThrow().getStatus()).isEqualTo("PENDING");
        await().atMost(Duration.ofSeconds(30)).until(() -> status(event) == Order.Status.CONFIRMED);
        reset(outbox); // remove the injected failure; restore the real repository proxy
        poller.pollAndPublish();
        assertThat(outbox.findById(row.getId()).orElseThrow().getStatus()).isEqualTo("PUBLISHED");
        // A same-key barrier shows both earlier deliveries have been consumed.
        var barrier = placed();
        producer.send(KafkaConfig.ORDER_EVENTS_TOPIC, event.orderId().toString(), barrier).get(10, TimeUnit.SECONDS);
        await().atMost(Duration.ofSeconds(30)).until(() -> status(barrier) == Order.Status.CONFIRMED);
        assertThat(stock()).isEqualTo(before - 4);
        assertThat(status(event)).isEqualTo(Order.Status.CONFIRMED);
    }
}
