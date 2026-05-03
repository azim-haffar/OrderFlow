import { useState, useMemo, useEffect } from 'react';
import StatusBadge from './StatusBadge';

function getAvailability(qty) {
  if (qty === 0) return 'out_of_stock';
  if (qty <= 20) return 'low_stock';
  return 'in_stock';
}

const availLabel = {
  in_stock:     'In Stock',
  low_stock:    'Low Stock',
  out_of_stock: 'Out of Stock',
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function OrderForm({ products, placing, onSubmit, preSelectedId, recentOrders }) {
  const [tab, setTab]           = useState('new');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity]   = useState(1);

  useEffect(() => {
    if (preSelectedId != null) {
      setProductId(String(preSelectedId));
      setQuantity(1);
      setTab('new');
    }
  }, [preSelectedId]);

  const selected     = useMemo(() => products.find(p => p.id === Number(productId)), [products, productId]);
  const outOfStock   = selected && selected.stockQuantity === 0;
  const exceedsStock = selected && quantity > selected.stockQuantity;
  const unitPrice    = selected ? Number(selected.price) : 0;
  const total        = (unitPrice * quantity).toFixed(2);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!productId || outOfStock || exceedsStock) return;
    onSubmit({ productId: Number(productId), quantity });
    setQuantity(1);
  };

  return (
    <div className="order-form-section">
      {/* Header + tabs */}
      <div className="order-form-header">
        <span className="order-form-title">Place Order</span>
        <div className="order-tabs">
          <button
            type="button"
            className={`order-tab${tab === 'new' ? ' order-tab--active' : ''}`}
            onClick={() => setTab('new')}
          >
            New Order
          </button>
          <button
            type="button"
            className={`order-tab${tab === 'history' ? ' order-tab--active' : ''}`}
            onClick={() => setTab('history')}
          >
            History
          </button>
        </div>
      </div>

      {tab === 'history' ? (
        /* ── History tab ── */
        <div className="order-history-list">
          {!recentOrders?.length ? (
            <div className="history-empty">No orders placed yet.</div>
          ) : (
            recentOrders.slice(0, 10).map(o => (
              <div key={o.id} className="history-item">
                <div className="history-item-left">
                  <span className="history-id">#{o.id}</span>
                  <span className="history-product">{o.items?.[0]?.productName ?? '—'}</span>
                </div>
                <div className="history-item-right">
                  <StatusBadge status={o.status} />
                  <span className="history-total">€{Number(o.totalAmount).toFixed(2)}</span>
                  <span className="history-time">{formatTime(o.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── New Order tab ── */
        <form onSubmit={handleSubmit}>
          {/* Product selection */}
          {!productId && (
            <div className="product-select-hint">Select a product below</div>
          )}
          <div className="product-select-list">
            {products.map(p => {
              const avail      = getAvailability(p.stockQuantity);
              const isSelected = p.id === Number(productId);
              const isOOS      = p.stockQuantity === 0;
              return (
                <div
                  key={p.id}
                  className={`product-select-item${isSelected ? ' product-select-item--selected' : ''}${isOOS ? ' product-select-item--oos' : ''}`}
                  onClick={() => { if (!isOOS) { setProductId(String(p.id)); setQuantity(1); } }}
                >
                  <div className="psi-left">
                    <span className="psi-name">{p.name}</span>
                    <span className="psi-price">€{Number(p.price).toFixed(2)}</span>
                  </div>
                  <span className={`avail-badge avail-badge--${avail}`}>{availLabel[avail]}</span>
                </div>
              );
            })}
          </div>
          {products.length > 3 && (
            <div className="product-list-scroll-hint">scroll for more ↓</div>
          )}

          {/* Quantity */}
          <div className="qty-row">
            <div className="qty-label">Quantity</div>
            <div className="qty-control">
              <button
                type="button"
                className="qty-btn"
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                disabled={quantity <= 1}
              >−</button>
              <span className="qty-num">{quantity}</span>
              <button
                type="button"
                className="qty-btn"
                onClick={() => setQuantity(q => selected ? Math.min(selected.stockQuantity, q + 1) : q + 1)}
                disabled={!selected || quantity >= selected.stockQuantity}
              >+</button>
            </div>
            {exceedsStock && (
              <div className="qty-error">Exceeds available stock ({selected.stockQuantity})</div>
            )}
          </div>

          {/* Summary */}
          <div className="order-summary">
            <div className="summary-row">
              <span className="summary-label">Product</span>
              <span className="summary-value">{selected?.name ?? '—'}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Unit price</span>
              <span className="summary-value">€{unitPrice.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Quantity</span>
              <span className="summary-value">{quantity}</span>
            </div>
            <div className="summary-separator" />
            <div className="summary-row summary-row--total">
              <span className="summary-label">Total</span>
              <span className="summary-value">€{total}</span>
            </div>
          </div>

          {/* CTA */}
          <div className="place-order-wrap">
            <button
              type="submit"
              className="btn-place-order"
              disabled={placing || !productId || outOfStock || exceedsStock}
            >
              {placing ? 'Processing…' : !productId ? 'Select a product' : 'Place Order →'}
            </button>
          </div>
          <div className="processing-note">~2s processing via Kafka</div>
        </form>
      )}
    </div>
  );
}
