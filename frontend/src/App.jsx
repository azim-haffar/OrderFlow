import { useState, useCallback, useEffect } from 'react';
import LeftSidebar from './components/LeftSidebar';
import TopBar from './components/TopBar';
import MetricsBar from './components/MetricsBar';
import ProductTable from './components/ProductTable';
import RecentOrdersTable from './components/RecentOrdersTable';
import OrderForm from './components/OrderForm';
import EventFeed from './components/EventFeed';
import ProductsView from './components/ProductsView';
import OrdersView from './components/OrdersView';
import EventStreamView from './components/EventStreamView';
import { useProducts } from './hooks/useProducts';
import { useOrders } from './hooks/useOrders';
import { getOrders } from './api/client';
import './styles/main.css';

function initDarkMode() {
  const stored = localStorage.getItem('darkMode');
  if (stored !== null) return stored === 'true';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

let eventCounter = 0;
function makeEvent(order, message, extra = {}) {
  return { id: ++eventCounter, timestamp: new Date().toISOString(), status: order.status, message, ...extra };
}

export default function App() {
  const { products, loading: productsLoading, updateStock } = useProducts();
  const { placing, error: orderError, submitOrder } = useOrders();
  const [events, setEvents]             = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [customerId] = useState(() => crypto.randomUUID());
  const [flashProductIds, setFlashProductIds] = useState(new Set());
  const [activeView, setActiveView] = useState('overview');
  const [darkMode, setDarkMode]     = useState(initDarkMode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    getOrders().then(setRecentOrders).catch(() => {});
  }, []);

  const addEvent = useCallback((order, message, extra) => {
    setEvents(prev => [...prev, makeEvent(order, message, extra)]);
  }, []);

  const flashProduct = useCallback((productId) => {
    setFlashProductIds(prev => new Set([...prev, productId]));
    setTimeout(() => {
      setFlashProductIds(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }, 1200);
  }, []);

  const handleSubmit = useCallback((body) => {
    const orderBody = { ...body, customerId };
    submitOrder(
      orderBody,
      (placed) => {
        const item = placed.items?.[0];
        addEvent(placed, `Order #${placed.id} placed`, {
          orderId: placed.id,
          productName: item?.productName,
          quantity: item?.quantity,
        });
        setRecentOrders(prev => [placed, ...prev].slice(0, 10));
      },
      (resolved) => {
        const item = resolved.items?.[0];
        if (resolved.status === 'CONFIRMED') {
          addEvent(resolved, `Order #${resolved.id} confirmed`, {
            orderId: resolved.id,
            productName: item?.productName,
            quantity: item?.quantity,
          });
          if (item) {
            updateStock(item.productId, -item.quantity);
            flashProduct(item.productId);
          }
        } else if (resolved.status === 'CANCELLED') {
          addEvent(resolved, `Order #${resolved.id} cancelled`, {
            orderId: resolved.id,
            productName: item?.productName,
            quantity: item?.quantity,
          });
        }
        setRecentOrders(prev => prev.map(o => o.id === resolved.id ? resolved : o));
      }
    );
  }, [submitOrder, addEvent, updateStock, customerId, flashProduct]);

  const isOverview = activeView === 'overview';

  return (
    <div className="app">
      <LeftSidebar activeView={activeView} onViewChange={setActiveView} />

      <div className="main-wrapper">
        <TopBar activePage={activeView} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />

        <div className="content-body">
          {/* ── Main content area ── */}
          <div className={`center-content${isOverview ? '' : ' center-content--full'}`}>
            {activeView === 'overview' && (
              <div className="view-enter">
                {orderError && <div className="alert">{orderError}</div>}

                <MetricsBar orders={recentOrders} />

                <div className="section-header">
                  <div className="section-header-left">
                    <span className="section-title">Products</span>
                    <span className="section-badge">{products.length} items</span>
                  </div>
                  <button className="btn-ghost" onClick={() => window.location.reload()}>
                    Refresh
                  </button>
                </div>
                <div className="data-table-card">
                  <ProductTable
                    products={products}
                    loading={productsLoading}
                    selectedProductId={selectedProductId}
                    onSelect={setSelectedProductId}
                    flashProductIds={flashProductIds}
                  />
                </div>

                <div className="section-header" style={{ marginTop: '24px' }}>
                  <div className="section-header-left">
                    <span className="section-title">Recent Orders</span>
                    <span className="section-badge">{recentOrders.length} orders</span>
                  </div>
                  <button className="section-link" type="button" onClick={() => setActiveView('orders')}>
                    View All
                  </button>
                </div>
                <div className="data-table-card">
                  <RecentOrdersTable orders={recentOrders} />
                </div>

                <footer className="main-footer">
                  Built with{' '}
                  <span className="footer-tech">Spring Boot 3</span> ·{' '}
                  <span className="footer-tech">Kafka KRaft</span> ·{' '}
                  <span className="footer-tech">PostgreSQL</span> ·{' '}
                  <span className="footer-tech">Redis</span> ·{' '}
                  <span className="footer-tech">React</span>
                </footer>
              </div>
            )}

            {activeView === 'products' && (
              <ProductsView
                products={products}
                loading={productsLoading}
                onSubmit={handleSubmit}
                placing={placing}
              />
            )}

            {activeView === 'orders' && <OrdersView />}

            {activeView === 'event-stream' && <EventStreamView events={events} />}
          </div>

          {/* ── Right sidebar (overview only) ── */}
          {isOverview && (
            <aside className="right-sidebar">
              <OrderForm
                products={products}
                placing={placing}
                onSubmit={handleSubmit}
                preSelectedId={selectedProductId}
                recentOrders={recentOrders}
              />
              <EventFeed events={events} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
