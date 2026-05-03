const GridIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z"/>
  </svg>
);

const PackageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 7H4a1 1 0 00-1 1v10a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1zM4 4h16"/>
  </svg>
);

const ListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
  </svg>
);

const ActivityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>
);

const NAV_ITEMS = [
  { id: 'overview',      label: 'Overview',     Icon: GridIcon },
  { id: 'products',      label: 'Products',     Icon: PackageIcon },
  { id: 'orders',        label: 'Orders',       Icon: ListIcon },
  { id: 'event-stream',  label: 'Event Stream', Icon: ActivityIcon },
];

const STATUS_ITEMS = [
  { label: 'Kafka KRaft',    value: 'online'  },
  { label: 'Redis',          value: 'TTL 60s' },
  { label: 'PostgreSQL',     value: 'locked'  },
  { label: 'Testcontainers', value: 'passing' },
];

export default function LeftSidebar({ activeView, onViewChange }) {
  return (
    <aside className="left-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo-text">OrderFlow</span>
        <span className="sidebar-version">v1.0.0</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`nav-item${activeView === id ? ' nav-item--active' : ''}`}
            onClick={() => onViewChange(id)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      <div className="sidebar-status">
        <span className="sidebar-status-label">System</span>
        {STATUS_ITEMS.map(({ label, value }) => (
          <div key={label} className="status-row">
            <span className="status-dot-pulse" />
            <span className="status-row-label">{label}</span>
            <span className="status-row-value">{value}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
