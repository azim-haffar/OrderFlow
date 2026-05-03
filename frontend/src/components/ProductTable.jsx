const MAX_STOCK = 100;

function getAvailability(qty) {
  if (qty === 0)   return 'out_of_stock';
  if (qty <= 20)   return 'low_stock';
  return 'in_stock';
}

const availLabel = {
  in_stock:     'In Stock',
  low_stock:    'Low Stock',
  out_of_stock: 'Out of Stock',
};

function SkeletonRow() {
  return (
    <tr>
      <td><div className="skeleton skeleton--text" /></td>
      <td><div className="skeleton skeleton--short" /></td>
      <td><div className="skeleton skeleton--bar" /></td>
      <td><div className="skeleton skeleton--badge" /></td>
      <td><div className="skeleton skeleton--short" /></td>
    </tr>
  );
}

export default function ProductTable({ products, loading, selectedProductId, onSelect, flashProductIds }) {
  if (loading) {
    return (
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th><th>Price</th><th>Stock</th><th>Availability</th><th style={{ textAlign: 'right' }}>Reserved</th>
          </tr>
        </thead>
        <tbody>
          <SkeletonRow /><SkeletonRow /><SkeletonRow />
        </tbody>
      </table>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Price</th>
          <th>Stock</th>
          <th>Availability</th>
          <th style={{ textAlign: 'right' }}>Reserved</th>
        </tr>
      </thead>
      <tbody>
        {products.map(p => {
          const avail      = getAvailability(p.stockQuantity);
          const pct        = Math.min((p.stockQuantity / MAX_STOCK) * 100, 100);
          const isSelected = p.id === selectedProductId;
          const isFlashing = flashProductIds?.has(p.id);

          let cls = 'data-row';
          if (isSelected) cls += ' data-row--selected';
          if (isFlashing) cls += ' data-row--flash';

          return (
            <tr
              key={p.id}
              className={cls}
              onClick={() => onSelect(p.id === selectedProductId ? null : p.id)}
            >
              <td>
                <span className="cell-name">{p.name}</span>
                <span className="cell-sku">{p.sku}</span>
              </td>
              <td>
                <span className="cell-price">€{Number(p.price).toFixed(2)}</span>
              </td>
              <td>
                <div className="stock-wrap">
                  <div className="stock-bar-track">
                    <div
                      className={`stock-bar-fill stock-bar-fill--${avail}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="cell-stock-num">{p.stockQuantity}</span>
                </div>
              </td>
              <td>
                <span className={`avail-badge avail-badge--${avail}`}>{availLabel[avail]}</span>
              </td>
              <td>
                <span className="cell-reserved">0</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
