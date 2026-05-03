import { useState, useMemo, useCallback } from 'react';

const MAX_STOCK = 100;

function getAvailability(qty) {
  if (qty === 0) return 'out_of_stock';
  if (qty <= 20) return 'low_stock';
  return 'in_stock';
}

/* ── Category icon config ────────────────────────────────────────── */
const CATEGORIES = {
  monitor:  { bg: '#1a1a2e', stroke: '#6b7fe8' },
  keyboard: { bg: '#1a2e1a', stroke: '#6be87f' },
  chair:    { bg: '#2e1a1a', stroke: '#e86b6b' },
  hub:      { bg: '#2e2a1a', stroke: '#e8c46b' },
  headset:  { bg: '#1a2a2e', stroke: '#6be8d4' },
  default:  { bg: '#1e1e1e', stroke: '#888888' },
};

function getCategory(name) {
  const n = (name ?? '').toLowerCase();
  if (n.includes('monitor'))  return 'monitor';
  if (n.includes('keyboard')) return 'keyboard';
  if (n.includes('chair'))    return 'chair';
  if (n.includes('hub') || n.includes('usb')) return 'hub';
  if (n.includes('headset') || n.includes('headphone')) return 'headset';
  return 'default';
}

const ICONS = {
  monitor: (stroke) => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  ),
  keyboard: (stroke) => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12"/>
    </svg>
  ),
  chair: (stroke) => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 20v-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6"/>
      <path d="M6 20h12M9 20v-9M15 20v-9M9 11V7a3 3 0 0 1 6 0v4"/>
    </svg>
  ),
  hub: (stroke) => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  ),
  headset: (stroke) => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/>
      <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
    </svg>
  ),
  default: (stroke) => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>
    </svg>
  ),
};

function ProductIcon({ name }) {
  const cat  = getCategory(name);
  const conf = CATEGORIES[cat];
  return ICONS[cat](conf.stroke);
}

/* ── Skeleton card ──────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="product-card">
      <div className="card-image-area">
        <div style={{ width: '100%', height: '100%', background: 'var(--bg-elevated)' }} />
      </div>
      <div className="card-info">
        <div className="skeleton skeleton--short" style={{ marginBottom: 4, width: 60 }} />
        <div className="skeleton skeleton--text"  style={{ marginBottom: 4 }} />
        <div className="skeleton skeleton--short" style={{ marginBottom: 8 }} />
        <div className="skeleton skeleton--short" style={{ width: 70 }} />
      </div>
    </div>
  );
}

/* ── Filter pills ───────────────────────────────────────────────── */
const FILTERS = [
  { id: 'all',          label: 'All' },
  { id: 'in_stock',     label: 'In Stock' },
  { id: 'low_stock',    label: 'Low Stock' },
  { id: 'out_of_stock', label: 'Out of Stock' },
];

/* ── Main component ─────────────────────────────────────────────── */
export default function ProductsView({ products, loading, onSubmit, placing }) {
  const [search, setSearch]           = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [wishlisted, setWishlisted]   = useState(new Set());
  const [selectedCard, setSelectedCard] = useState(null);
  const [quantities, setQuantities]   = useState({});
  const [successCards, setSuccessCards] = useState(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      const matchesSearch  = !q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q);
      const avail          = getAvailability(p.stockQuantity);
      const matchesFilter  = stockFilter === 'all' || avail === stockFilter;
      return matchesSearch && matchesFilter;
    });
  }, [products, search, stockFilter]);

  const getQty = (id) => quantities[id] ?? 1;

  const setQty = useCallback((id, qty) => {
    setQuantities(prev => ({ ...prev, [id]: qty }));
  }, []);

  const toggleWishlist = useCallback((e, id) => {
    e.stopPropagation();
    setWishlisted(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleCardClick = useCallback((id, isOOS) => {
    if (isOOS) return;
    setSelectedCard(prev => (prev === id ? null : id));
  }, []);

  const handleAddToOrder = useCallback((e, id) => {
    e.stopPropagation();
    onSubmit({ productId: id, quantity: getQty(id) });
    setSuccessCards(prev => new Set([...prev, id]));
    setSelectedCard(null);
    setTimeout(() => {
      setSuccessCards(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, 2000);
  }, [onSubmit, quantities]);

  return (
    <div className="view-enter products-view-root">

      {/* ── Header ── */}
      <div className="products-view-header">
        <div className="products-view-header-top">
          <span className="section-title">Products</span>
          <span className="section-badge">{filtered.length}{filtered.length !== products.length ? ` of ${products.length}` : ''}</span>
        </div>
        <div className="products-view-toolbar">
          <input
            className="search-input products-search"
            type="text"
            placeholder="Search products by name or SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="filter-pills pv-filter-pills">
            {FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                className={`pv-pill${stockFilter === f.id ? ' pv-pill--active' : ''}`}
                onClick={() => setStockFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="product-grid-scroll">
        {loading ? (
          <div className="product-grid">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ margin: '80px auto' }}>
            <div className="empty-state-title">No products match</div>
            <div className="empty-state-desc">Try a different search term or filter.</div>
          </div>
        ) : (
          <div className="product-grid">
            {filtered.map(p => {
              const avail      = getAvailability(p.stockQuantity);
              const pct        = Math.min((p.stockQuantity / MAX_STOCK) * 100, 100);
              const isOOS      = p.stockQuantity === 0;
              const isSelected = selectedCard === p.id;
              const isSuccess  = successCards.has(p.id);
              const isWished   = wishlisted.has(p.id);
              const qty        = getQty(p.id);
              const catBg      = CATEGORIES[getCategory(p.name)].bg;

              return (
                <div
                  key={p.id}
                  className={[
                    'product-card',
                    isSelected ? 'product-card--selected' : '',
                    isOOS      ? 'product-card--oos'      : '',
                    isSuccess  ? 'product-card--success'  : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleCardClick(p.id, isOOS)}
                >
                  {/* ── Image area ── */}
                  <div className="card-image-area">
                    <div className="card-image-placeholder" style={{ background: catBg }}>
                      <ProductIcon name={p.name} />
                      <span className="card-sku-label" style={{ color: CATEGORIES[getCategory(p.name)].stroke, opacity: 0.7 }}>{p.sku}</span>
                    </div>

                    {/* Stock bar */}
                    <div className="card-stock-bar-track">
                      <div
                        className={`card-stock-bar-fill card-stock-bar-fill--${avail}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Wishlist */}
                    <button
                      className={`wishlist-btn${isWished ? ' wishlist-btn--active' : ''}`}
                      onClick={e => toggleWishlist(e, p.id)}
                      aria-label="Wishlist"
                    >
                      {isWished ? '♥' : '♡'}
                    </button>

                    {/* Low/OOS badge */}
                    {avail !== 'in_stock' && (
                      <span className={`card-avail-badge card-avail-badge--${avail}`}>
                        {avail === 'low_stock' ? 'Low Stock' : 'Out of Stock'}
                      </span>
                    )}

                    {/* Selected check */}
                    {isSelected && <div className="card-check">✓</div>}

                    {/* Success overlay */}
                    {isSuccess && (
                      <div className="card-success-overlay">
                        <span className="card-success-icon">✓</span>
                        <span className="card-success-text">Order Placed</span>
                      </div>
                    )}
                  </div>

                  {/* ── Card info ── */}
                  <div className="card-info">
                    <p className="brand-name">OrderFlow</p>
                    <p className="product-name">{p.name}</p>
                    <p className="product-desc">{p.sku} · {p.stockQuantity} units left</p>
                    <p className="product-price">€{Number(p.price).toFixed(2)}</p>
                  </div>

                  {/* ── Mini order panel ── */}
                  {isSelected && !isOOS && (
                    <div className="card-order-panel" onClick={e => e.stopPropagation()}>
                      <div className="card-order-row">
                        <span className="card-order-label">Qty:</span>
                        <div className="card-order-qty">
                          <button
                            type="button"
                            className="card-qty-btn"
                            onClick={e => { e.stopPropagation(); setQty(p.id, Math.max(1, qty - 1)); }}
                            disabled={qty <= 1}
                          >−</button>
                          <span className="card-qty-num">{qty}</span>
                          <button
                            type="button"
                            className="card-qty-btn"
                            onClick={e => { e.stopPropagation(); setQty(p.id, Math.min(p.stockQuantity, qty + 1)); }}
                            disabled={qty >= p.stockQuantity}
                          >+</button>
                        </div>
                        <button
                          type="button"
                          className="card-add-btn"
                          onClick={e => handleAddToOrder(e, p.id)}
                          disabled={placing}
                        >
                          {placing ? '…' : 'Add to Order →'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
