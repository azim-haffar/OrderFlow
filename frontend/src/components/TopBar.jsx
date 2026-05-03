const GearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="2.5"/>
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>
  </svg>
);

const PAGE_LABELS = {
  overview:      'Overview',
  products:      'Products',
  orders:        'Orders',
  'event-stream': 'Event Stream',
};

export default function TopBar({ activePage, darkMode, onToggleDark }) {
  return (
    <div className="top-bar">
      <span className="topbar-breadcrumb">{PAGE_LABELS[activePage] ?? 'Overview'}</span>
      <div className="topbar-right">
        <span className="topbar-pill topbar-pill--green">Kafka Connected</span>
        <span className="topbar-pill topbar-pill--blue">Redis Active</span>
        <button
          className="icon-btn"
          aria-label="Toggle dark mode"
          onClick={onToggleDark}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? '◑' : '☀'}
        </button>
        <button className="icon-btn" aria-label="Settings">
          <GearIcon />
        </button>
      </div>
    </div>
  );
}
