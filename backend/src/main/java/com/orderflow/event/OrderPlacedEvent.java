package com.orderflow.event;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record OrderPlacedEvent(
        Long orderId,
        Long productId,
        Integer quantity,
        BigDecimal unitPrice,
        String customerId,
        OffsetDateTime placedAt
) {}
