export default function SystemStatusBar() {
  return (
    <div className="system-status-bar">
      <div className="sys-item">
        <span className="sys-dot" />
        Kafka KRaft · order-events · 3 partitions
      </div>
      <div className="sys-item">
        <span className="sys-dot" />
        Redis · TTL 60s · inventory cache
      </div>
      <div className="sys-item">
        <span className="sys-dot" />
        PostgreSQL · SELECT FOR UPDATE · pessimistic locking
      </div>
      <div className="sys-item">
        <span className="sys-dot" />
        Testcontainers · integration tests passing
      </div>
    </div>
  );
}
