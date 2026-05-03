import StatusBadge from './StatusBadge';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function RecentOrdersTable({ orders }) {
  if (!orders.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No orders yet</div>
        <div className="empty-state-desc">
          Place an order to observe the full Kafka lifecycle:<br />
          PLACED → CONFIRMED / CANCELLED
        </div>
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Order ID</th>
          <th>Product</th>
          <th>Qty</th>
          <th>Total</th>
          <th>Status</th>
          <th style={{ textAlign: 'right' }}>Time</th>
        </tr>
      </thead>
      <tbody>
        {orders.slice(0, 10).map(o => (
          <tr key={o.id}>
            <td><span className="cell-order-id">#{o.id}</span></td>
            <td><span className="cell-name">{o.items?.[0]?.productName ?? '—'}</span></td>
            <td><span className="cell-stock-num">{o.items?.[0]?.quantity ?? '—'}</span></td>
            <td><span className="cell-price">€{Number(o.totalAmount).toFixed(2)}</span></td>
            <td><StatusBadge status={o.status} /></td>
            <td style={{ textAlign: 'right' }}>
              <span className="cell-time">{formatTime(o.createdAt)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
