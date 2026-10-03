package com.orderflow.service;

import com.orderflow.entity.Order;
import com.orderflow.entity.Product;
import com.orderflow.event.OrderPlacedEvent;
import com.orderflow.exception.OrderNotFoundException;
import com.orderflow.repository.OrderRepository;
import com.orderflow.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class InventoryService {

    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final ProductService productService;

    @Transactional
    public void processOrderPlaced(OrderPlacedEvent event) {
        Order order = orderRepository.findByIdWithLock(event.orderId())
                .orElseThrow(() -> new OrderNotFoundException(event.orderId()));

        // Kafka/outbox delivery is at least once. Lock the order before checking
        // its state so concurrent duplicates cannot deduct inventory twice.
        if (order.getStatus() != Order.Status.PLACED) {
            return;
        }

        Product product = productRepository.findByIdWithLock(event.productId()).orElse(null);
        if (product == null) {
            log.error("Product {} not found for order {}", event.productId(), event.orderId());
            order.setStatus(Order.Status.CANCELLED);
            orderRepository.save(order);
            return;
        }

        if (product.getStockQuantity() < event.quantity()) {
            log.warn("Insufficient stock for product {} (order {}): needed {}, have {}",
                    event.productId(), event.orderId(), event.quantity(), product.getStockQuantity());
            order.setStatus(Order.Status.CANCELLED);
            orderRepository.save(order);
            return;
        }

        product.setStockQuantity(product.getStockQuantity() - event.quantity());
        productRepository.save(product);

        order.setStatus(Order.Status.CONFIRMED);
        orderRepository.save(order);

        productService.evictProductCache(product.getId());

        log.info("Order {} confirmed. Product {} stock reduced from {} to {}",
                event.orderId(), product.getId(),
                product.getStockQuantity() + event.quantity(), product.getStockQuantity());
    }
}
