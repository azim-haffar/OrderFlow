import { useState, useCallback } from 'react';
import { placeOrder, getOrder } from '../api/client';

export function useOrders() {
  const [orders, setOrders] = useState([]);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState(null);

  const pollOrder = useCallback((orderId, onResolved) => {
    let attempts = 0;
    const MAX = 10;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const order = await getOrder(orderId);
        if (order.status === 'CONFIRMED' || order.status === 'CANCELLED') {
          clearInterval(interval);
          setOrders(prev => prev.map(o => o.id === orderId ? order : o));
          onResolved(order);
        } else if (attempts >= MAX) {
          clearInterval(interval);
          onResolved(order);
        }
      } catch {
        clearInterval(interval);
      }
    }, 1000);
  }, []);

  const submitOrder = useCallback(async (body, onPlaced, onResolved) => {
    setPlacing(true);
    setError(null);
    try {
      const placed = await placeOrder(body);
      setOrders(prev => [placed, ...prev]);
      onPlaced(placed);
      pollOrder(placed.id, onResolved);
    } catch (err) {
      setError(err.data?.detail || err.message);
    } finally {
      setPlacing(false);
    }
  }, [pollOrder]);

  return { orders, placing, error, submitOrder };
}
