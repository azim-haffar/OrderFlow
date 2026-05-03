package com.orderflow.consumer;

import com.orderflow.config.KafkaConfig;
import com.orderflow.event.OrderPlacedEvent;
import com.orderflow.service.InventoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class OrderEventConsumer {

    private final InventoryService inventoryService;

    @KafkaListener(
            topics = KafkaConfig.ORDER_EVENTS_TOPIC,
            groupId = "orderflow-group",
            containerFactory = "orderPlacedListenerContainerFactory"
    )
    public void handleOrderPlaced(OrderPlacedEvent event) {
        log.info("Received OrderPlacedEvent for order {}", event.orderId());
        try {
            inventoryService.processOrderPlaced(event);
        } catch (Exception ex) {
            log.error("Error processing OrderPlacedEvent for order {}: {}", event.orderId(), ex.getMessage(), ex);
        }
    }
}
