import { useEffect, useRef, useState } from 'react';

function useCountUp(target, duration = 600) {
  const [value, setValue] = useState(0);
  const rafRef  = useRef(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const from = fromRef.current;
    if (from === target) return;

    const startTime = performance.now();
    const tick = (now) => {
      const t      = Math.min((now - startTime) / duration, 1);
      const eased  = 1 - (1 - t) * (1 - t);
      const current = Math.round(from + (target - from) * eased);
      setValue(current);
      fromRef.current = current;
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setValue(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

function MetricCard({ label, value, variant, subtext }) {
  const displayed = useCountUp(value);

  return (
    <div className={`metric-card metric-card--${variant}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{displayed}</span>
      <span className="metric-subtext">{subtext}</span>
    </div>
  );
}

export default function MetricsBar({ orders }) {
  const total     = orders.length;
  const confirmed = orders.filter(o => o.status === 'CONFIRMED').length;
  const cancelled = orders.filter(o => o.status === 'CANCELLED').length;
  const pending   = orders.filter(o => o.status === 'PLACED').length;

  const successPct = total > 0 ? Math.round((confirmed / total) * 100) : 0;
  const cancelPct  = total > 0 ? Math.round((cancelled / total) * 100) : 0;

  return (
    <div className="metrics-row">
      <MetricCard label="Total Orders" value={total}     variant="total"     subtext="this session" />
      <MetricCard label="Confirmed"    value={confirmed} variant="confirmed" subtext={`${successPct}% success rate`} />
      <MetricCard label="Cancelled"    value={cancelled} variant="cancelled" subtext={`${cancelPct}% of total`} />
      <MetricCard label="Pending"      value={pending}   variant="pending"   subtext="in-flight" />
    </div>
  );
}
