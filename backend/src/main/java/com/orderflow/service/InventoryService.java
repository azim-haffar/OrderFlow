package com.orderflow.service;

import com.orderflow.entity.Order;
import com.orderflow.entity.Product;
import com.orderflow.event.OrderPlacedEvent;
import com.orderflow.exception.OrderNotFoundException;
import com.orderflow.exception.ProductNotFoundException;
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
        Order order = orderRepository.findById(event.orderId())
                .orElseThrow(() -> new OrderNotFoundException(event.orderId()));

        Product product = productRepository.findByIdWithLock(event.productId())
                .orElseThrow(() -> {
                    log.error("Product {} not found during inventory check for order {}", event.productId(), event.orderId());
                    order.setStatus(Order.Status.CANCELLED);
                    orderRepository.save(order);
                    return new ProductNotFoundException(event.productId());
                });

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
