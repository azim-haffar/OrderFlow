package com.orderflow.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orderflow.dto.OrderResponse;
import com.orderflow.dto.PlaceOrderRequest;
import com.orderflow.entity.Order;
import com.orderflow.entity.OrderItem;
import com.orderflow.entity.OutboxEvent;
import com.orderflow.entity.Product;
import com.orderflow.event.OrderPlacedEvent;
import com.orderflow.exception.OrderNotCancellableException;
import com.orderflow.exception.OrderNotFoundException;
import com.orderflow.exception.ProductNotFoundException;
import com.orderflow.repository.OrderRepository;
import com.orderflow.repository.OutboxEventRepository;
import com.orderflow.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public OrderResponse placeOrder(PlaceOrderRequest request) {
        Product product = productRepository.findById(request.productId())
                .orElseThrow(() -> new ProductNotFoundException(request.productId()));

        Order order = new Order();
        order.setCustomerId(request.customerId());
        order.setStatus(Order.Status.PLACED);

        OrderItem item = new OrderItem();
        item.setOrder(order);
        item.setProductId(product.getId());
        item.setProductName(product.getName());
        item.setQuantity(request.quantity());
        item.setUnitPrice(product.getPrice());

        BigDecimal total = product.getPrice().multiply(BigDecimal.valueOf(request.quantity()));
        order.setTotalAmount(total);
        order.getItems().add(item);

        Order saved = orderRepository.save(order);
        log.info("Order {} saved with status PLACED for customer {}", saved.getId(), request.customerId());

        OrderPlacedEvent event = new OrderPlacedEvent(
                saved.getId(),
                product.getId(),
                request.quantity(),
                product.getPrice(),
                request.customerId(),
                saved.getCreatedAt()
        );

        // Write the outbox event in the same transaction as the order.
        // The OutboxPoller publishes it to Kafka asynchronously, decoupling
        // the DB commit from the Kafka send.
        try {
            OutboxEvent outboxEvent = new OutboxEvent(
                    saved.getId().toString(),
                    OrderPlacedEvent.class.getSimpleName(),
                    objectMapper.writeValueAsString(event)
            );
            outboxEventRepository.save(outboxEvent);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to serialize OrderPlacedEvent for order " + saved.getId(), ex);
        }

        return OrderResponse.from(saved);
    }

    @Transactional
    public void cancelOrder(Long id) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new OrderNotFoundException(id));

        if (order.getStatus() != Order.Status.PLACED) {
            throw new OrderNotCancellableException(id, order.getStatus());
        }

        order.setStatus(Order.Status.CANCELLED);
        log.info("Order {} cancelled by client request", id);
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrder(Long id) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new OrderNotFoundException(id));
        return OrderResponse.from(order);
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> getRecentOrders() {
        return orderRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 20))
                .stream()
                .map(OrderResponse::from)
                .toList();
    }
}
