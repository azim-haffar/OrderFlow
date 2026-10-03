package com.orderflow;

import com.orderflow.entity.Order;
import com.orderflow.entity.Product;
import com.orderflow.event.OrderPlacedEvent;
import com.orderflow.repository.OrderRepository;
import com.orderflow.repository.ProductRepository;
import com.orderflow.service.InventoryService;
import com.orderflow.service.ProductService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class InventoryServiceTest {
    private final OrderRepository orders = mock(OrderRepository.class);
    private final ProductRepository products = mock(ProductRepository.class);
    private final ProductService cache = mock(ProductService.class);
    private final InventoryService service = new InventoryService(products, orders, cache);
    private final Order order = new Order();
    private final Product product = new Product();
    private final OrderPlacedEvent event = new OrderPlacedEvent(1L, 2L, 3,
            BigDecimal.TEN, "test-customer", null);

    @BeforeEach
    void setup() {
        order.setStatus(Order.Status.PLACED);
        product.setId(2L);
        product.setStockQuantity(10);
        when(orders.findByIdWithLock(1L)).thenReturn(Optional.of(order));
        when(products.findByIdWithLock(2L)).thenReturn(Optional.of(product));
    }

    @Test
    void repeatedDeliveryDoesNotDeductStockTwice() {
        service.processOrderPlaced(event);
        service.processOrderPlaced(event);
        assertThat(product.getStockQuantity()).isEqualTo(7);
        assertThat(order.getStatus()).isEqualTo(Order.Status.CONFIRMED);
        verify(products, times(1)).save(product);
        verify(cache, times(1)).evictProductCache(2L);
    }

    @Test
    void cancelledOrderDoesNotReserveInventory() {
        order.setStatus(Order.Status.CANCELLED);
        service.processOrderPlaced(event);
        assertThat(product.getStockQuantity()).isEqualTo(10);
        assertThat(order.getStatus()).isEqualTo(Order.Status.CANCELLED);
        verifyNoInteractions(products, cache);
    }

    @Test
    void missingProductCancelsWithoutThrowingAndRollingBack() {
        when(products.findByIdWithLock(2L)).thenReturn(Optional.empty());
        service.processOrderPlaced(event);
        assertThat(order.getStatus()).isEqualTo(Order.Status.CANCELLED);
        verify(orders).save(order);
        verifyNoInteractions(cache);
    }

    @Test
    void insufficientStockDoesNotChangeInventory() {
        product.setStockQuantity(2);
        service.processOrderPlaced(event);
        assertThat(order.getStatus()).isEqualTo(Order.Status.CANCELLED);
        assertThat(product.getStockQuantity()).isEqualTo(2);
        verify(products, never()).save(any());
    }
}
