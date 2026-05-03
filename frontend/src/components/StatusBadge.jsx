const config = {
  CONFIRMED: { cls: 'status-badge--confirmed', label: 'Confirmed' },
  CANCELLED: { cls: 'status-badge--cancelled', label: 'Cancelled' },
  PLACED:    { cls: 'status-badge--placed',    label: 'Placed'    },
};

export default function StatusBadge({ status }) {
  const c = config[status] ?? { cls: '', label: status };
  return <span className={`status-badge ${c.cls}`}>{c.label}</span>;
}
