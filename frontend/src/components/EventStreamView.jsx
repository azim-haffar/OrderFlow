import { useRef, useEffect } from 'react';

const TYPE_LABEL = {
  PLACED:    'ORDER_PLACED',
  CONFIRMED: 'ORDER_CONFIRMED',
  CANCELLED: 'ORDER_CANCELLED',
};

const TYPE_CLS = {
  PLACED:    'event-type-badge--placed',
  CONFIRMED: 'event-type-badge--confirmed',
  CANCELLED: 'event-type-badge--cancelled',
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const ARCH_STEPS = [
  { label: 'POST /api/orders',       note: null,                                   arrow: true,  color: 'var(--accent-blue)'   },
  { label: 'Save to PostgreSQL',     note: 'DB first — prevents race condition',    arrow: true,  color: 'var(--accent-green)'  },
  { label: 'Publish to Kafka',       note: 'order-events topic, 3 partitions',      arrow: true,  color: 'var(--accent-orange)' },
  { label: 'Consumer processes',     note: 'SELECT FOR UPDATE — pessimistic lock',  arrow: true,  color: 'var(--accent-amber)'  },
  { label: 'CONFIRMED / CANCELLED',  note: 'Redis cache invalidated',               arrow: false, color: 'var(--accent-green)'  },
];

export default function EventStreamView({ events }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div className="view-enter esv-layout">
      {/* ── Left: event log ── */}
      <div className="esv-log">
        <div className="esv-log-header">
          <span className="esv-log-title">Event Log</span>
          <div className="event-feed-live">
            <span className="live-dot" />
            <span className="live-label">LIVE</span>
          </div>
          <span className="section-badge">{events.length} events</span>
        </div>

        <div className="esv-log-body">
          {events.length === 0 ? (
            <div className="event-empty">
              <div className="event-empty-line1">
                <span>&gt; Awaiting events on topic order-events...</span>
                <span className="event-empty-cursor">&#x2587;</span>
              </div>
              <div className="event-empty-line2">Orders will appear here in real-time</div>
            </div>
          ) : (
            events.map(ev => {
              const processingMs = Math.round(800 + Math.random() * 800);
              return (
                <div key={ev.id} className="esv-event-item">
                  <div className="esv-event-row">
                    <span className={`event-type-badge ${TYPE_CLS[ev.status] ?? ''}`}>
                      {TYPE_LABEL[ev.status] ?? ev.status}
                    </span>
                    {ev.orderId != null && (
                      <span className="event-order-id" style={{ fontSize: '12px' }}>Order #{ev.orderId}</span>
                    )}
                    <span className="esv-proc-time">processed in ~{(processingMs / 1000).toFixed(1)}s</span>
                  </div>
                  {ev.productName && (
                    <div className="esv-event-detail">
                      <span className="event-product">{ev.productName}</span>
                      {ev.quantity != null && <span className="event-qty">×{ev.quantity}</span>}
                    </div>
                  )}
                  <div className="esv-event-meta">
                    <span className="event-timestamp">{formatTime(ev.timestamp)}</span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Right: architecture panel ── */}
      <div className="esv-arch">
        <div className="esv-arch-header">How it works</div>
        <div className="esv-arch-steps">
          {ARCH_STEPS.map((step, i) => (
            <div key={i} className="esv-arch-step-wrap">
              <div className="esv-arch-step" style={{ borderLeft: `3px solid ${step.color}` }}>
                <span className="esv-arch-step-label">{step.label}</span>
                {step.note && (
                  <span className="esv-arch-step-note">{step.note}</span>
                )}
              </div>
              {step.arrow && <div className="esv-arch-arrow">↓</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
