import { useState, useEffect, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import { getOrders } from '../api/client';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const STATUS_FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'CONFIRMED', label: 'Confirmed' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: 'PLACED',    label: 'Pending' },
];

export default function OrdersView() {
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    getOrders()
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return orders;
    return orders.filter(o => o.status === statusFilter);
  }, [orders, statusFilter]);

  const totalRevenue = useMemo(() =>
    orders
      .filter(o => o.status === 'CONFIRMED')
      .reduce((sum, o) => sum + Number(o.totalAmount), 0),
    [orders]
  );

  return (
    <div className="view-enter" style={{ padding: '24px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="section-header" style={{ marginBottom: '16px' }}>
        <div className="section-header-left">
          <span className="section-title">Orders</span>
          <span className="section-badge">{filtered.length} orders</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="orders-stat-row">
        <div className="orders-stat-card">
          <span className="orders-stat-label">Total Orders</span>
          <span className="orders-stat-value">{orders.length}</span>
        </div>
        <div className="orders-stat-card orders-stat-card--revenue">
          <span className="orders-stat-label">Confirmed Revenue</span>
          <span className="orders-stat-value">€{totalRevenue.toFixed(2)}</span>
        </div>
      </div>

      {/* Filter pills */}
      <div className="filter-pills" style={{ marginBottom: '12px' }}>
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            className={`filter-pill${statusFilter === f.id ? ' filter-pill--active' : ''}`}
            onClick={() => setStatusFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="data-table-card" style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Status</th><th style={{ textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {[1,2,3].map(i => (
                <tr key={i}>
                  {[...Array(7)].map((_, j) => <td key={j}><div className="skeleton skeleton--text" /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">{orders.length === 0 ? 'No orders yet' : 'No orders match'}</div>
            <div className="empty-state-desc">
              {orders.length === 0
                ? 'Place your first order from Overview.'
                : 'Try a different status filter.'}
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => {
                const item      = o.items?.[0];
                const unitPrice = item && o.items.length === 1
                  ? (Number(o.totalAmount) / item.quantity).toFixed(2)
                  : '—';
                return (
                  <tr key={o.id} className="data-row">
                    <td><span className="cell-order-id">#{o.id}</span></td>
                    <td><span className="cell-name">{item?.productName ?? '—'}</span></td>
                    <td><span className="cell-stock-num">{item?.quantity ?? '—'}</span></td>
                    <td><span className="cell-price">€{unitPrice}</span></td>
                    <td><span className="cell-price">€{Number(o.totalAmount).toFixed(2)}</span></td>
                    <td><StatusBadge status={o.status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="cell-time">{formatTime(o.createdAt)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
