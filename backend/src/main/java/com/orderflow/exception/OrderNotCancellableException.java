package com.orderflow.exception;

import com.orderflow.entity.Order;

public class OrderNotCancellableException extends RuntimeException {

    public OrderNotCancellableException(Long orderId, Order.Status currentStatus) {
        super("Order " + orderId + " cannot be cancelled: status is " + currentStatus);
    }
}
