package com.orderflow.outbox;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orderflow.config.KafkaConfig;
import com.orderflow.entity.OutboxEvent;
import com.orderflow.event.OrderPlacedEvent;
import com.orderflow.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Component
@RequiredArgsConstructor
@Slf4j
public class OutboxPoller {

    private final OutboxEventRepository outboxEventRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Scheduled(fixedDelay = 1000)
    public void pollAndPublish() {
        List<OutboxEvent> pending = outboxEventRepository
                .findTop20ByStatusOrderByCreatedAtAsc("PENDING");

        for (OutboxEvent event : pending) {
            try {
                OrderPlacedEvent orderEvent = objectMapper.readValue(
                        event.getPayload(), OrderPlacedEvent.class);

                kafkaTemplate
                        .send(KafkaConfig.ORDER_EVENTS_TOPIC, event.getAggregateId(), orderEvent)
                        .get(5, TimeUnit.SECONDS);

                outboxEventRepository.markPublished(event.getId(), OffsetDateTime.now());

                log.info("Outbox: published event {} for order {}",
                        event.getId(), event.getAggregateId());

            } catch (Exception ex) {
                log.error("Outbox: failed to publish event {} for order {}: {}",
                        event.getId(), event.getAggregateId(), ex.getMessage());
            }
        }
    }
}
