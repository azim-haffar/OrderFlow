package com.orderflow.event;

import java.time.OffsetDateTime;

public record OrderStatusUpdatedEvent(
        Long orderId,
        String previousStatus,
        String newStatus,
        OffsetDateTime updatedAt,
        String reason
) {}
