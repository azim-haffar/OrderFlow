import { useState, useEffect, useCallback } from 'react';
import { getProducts } from '../api/client';

export function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getProducts();
      setProducts(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateStock = useCallback((productId, delta) => {
    setProducts(prev =>
      prev.map(p => p.id === productId ? { ...p, stockQuantity: p.stockQuantity + delta } : p)
    );
  }, []);

  return { products, loading, error, refresh, updateStock };
}
