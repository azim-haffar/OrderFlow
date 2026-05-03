import { useEffect, useRef } from 'react';

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

export default function EventFeed({ events }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div className="event-feed">
      <div className="event-feed-header">
        <span className="event-feed-title">Event Stream</span>
        <div className="event-feed-live">
          <span className="live-dot" />
          <span className="live-label">LIVE</span>
        </div>
      </div>

      <div className="event-feed-body">
        {events.length === 0 ? (
          <div className="event-empty">
            <div className="event-empty-line1">
              <span>&gt; Awaiting events on topic order-events...</span>
              <span className="event-empty-cursor">&#x2587;</span>
            </div>
            <div className="event-empty-line2">Orders will appear here in real-time</div>
          </div>
        ) : (
          events.map(ev => (
            <div key={ev.id} className="event-item">
              <div className="event-item-top">
                <span className="event-timestamp">{formatTime(ev.timestamp)}</span>
                <span className={`event-type-badge ${TYPE_CLS[ev.status] ?? ''}`}>
                  {TYPE_LABEL[ev.status] ?? ev.status}
                </span>
                {ev.orderId != null && (
                  <span className="event-order-id">#{ev.orderId}</span>
                )}
              </div>
              {(ev.productName || ev.message) && (
                <div className="event-item-bottom">
                  <span className="event-product">{ev.productName ?? ev.message}</span>
                  {ev.quantity != null && (
                    <span className="event-qty">×{ev.quantity}</span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
