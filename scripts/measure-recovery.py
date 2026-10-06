"""Measure a quiet, isolated Compose stack using only Python's standard library.

Run from any directory: python scripts/measure-recovery.py --output <result.json>
Creates and removes only the orderflow-evidence Compose project's containers.
Refuses to reuse an existing experiment stack. No shared data volumes are used.
"""
import argparse
import hashlib
import json
import math
import platform
import statistics
import subprocess
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ['docker', 'compose', '-p', 'orderflow-evidence', '-f',
           str(ROOT / 'scripts/compose.evidence.yml')]
BASE = 'http://127.0.0.1:18080'


def command(args, *, input=None):
    result = subprocess.run(args, cwd=ROOT, input=input, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600)
    if result.returncode:
        raise RuntimeError(f'{args[:4]} failed: {result.stderr[-2000:]}')
    return result.stdout.strip()


def api(path, body=None):
    request = urllib.request.Request(BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def sql(statement):
    return command(COMPOSE + ['exec', '-T', 'postgres', 'psql', '-U', 'orderflow',
                              '-d', 'orderflow', '-At', '-c', statement])


def stock():
    return int(sql('SELECT stock_quantity FROM products WHERE id = 1'))


def wait_until(check, seconds=90, interval=0.05):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        result = check()
        if result:
            return result
        time.sleep(interval)
    raise TimeoutError('Condition did not become true')


def place(label):
    start = time.perf_counter()
    order = api('/api/orders', {'productId': 1, 'quantity': 1, 'customerId': label})
    return order, start, (time.perf_counter() - start) * 1000


def confirmed(order_id):
    status = api(f'/api/orders/{order_id}')['status']
    if status == 'CANCELLED':
        raise AssertionError(f'Unexpected cancellation: {order_id}')
    return status == 'CONFIRMED'


def summary(samples):
    values = sorted(samples)
    return {'count': len(values), 'min_ms': round(values[0], 3),
            'median_ms': round(statistics.median(values), 3),
            'p95_nearest_rank_ms': round(values[math.ceil(0.95 * len(values)) - 1], 3),
            'max_ms': round(values[-1], 3)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--samples', type=int, default=20)
    args = parser.parse_args()
    if not 1 <= args.samples <= 40:
        parser.error('--samples must be between 1 and 40')
    if command(COMPOSE + ['ps', '-aq']):
        raise RuntimeError('An evidence stack already exists; refusing to modify it')
    result = {'schema_version': 1, 'started_at_utc': datetime.now(timezone.utc).isoformat(),
              'revision': command(['git', 'rev-parse', 'HEAD']),
              'tracked_worktree_dirty': bool(command(['git', 'status', '--porcelain', '--untracked-files=no'])),
              'python': platform.python_version(), 'client_platform': platform.platform(),
              'docker': json.loads(command(['docker', 'info', '--format',
                  '{"server_version":"{{.ServerVersion}}","cpus":{{.NCPU}},"memory_bytes":{{.MemTotal}}}'])),
              'workload': {'product_id': 1, 'quantity': 1, 'concurrency': 1,
                           'warmup_orders': 3, 'measured_orders': args.samples,
                           'poll_interval_ms': 50}, 'baseline_samples': []}
    # Bind evidence to the measured application source, even with unrelated doc edits.
    source_files = sorted((ROOT / 'backend/src/main').rglob('*')) + [ROOT / 'backend/pom.xml']
    digest = hashlib.sha256()
    for file in source_files:
        if file.is_file():
            digest.update(file.relative_to(ROOT).as_posix().encode() + b'\0')
            digest.update(file.read_bytes())
    result['backend_source_sha256'] = digest.hexdigest()
    started = False
    try:
        started = True
        print('Building and starting isolated evidence stack...', flush=True)
        command(COMPOSE + ['up', '-d', '--build'])
        def ready():
            try:
                return bool(api('/api/products'))
            except (OSError, ValueError):
                return False
        wait_until(ready, interval=0.25)
        result['containers'] = [
            json.loads(line) for line in command(COMPOSE + ['ps', '--format', 'json']).splitlines()]
        # Keep only reproducibility details; omit container machine paths and labels.
        result['containers'] = [{key: row[key] for key in ('Service', 'Image', 'State')}
                                for row in result['containers']]
        initial_stock = stock()
        if initial_stock < args.samples + 6:
            raise AssertionError('Insufficient stock for the controlled workload')
        for index in range(3):
            order, _, _ = place(f'warmup-{index}')
            wait_until(lambda: confirmed(order['id']))
        print(f'Measuring {args.samples} sequential orders...', flush=True)
        before = stock()
        for index in range(args.samples):
            order, start, accept_ms = place(f'baseline-{index}')
            wait_until(lambda: confirmed(order['id']))
            result['baseline_samples'].append({'order_id': order['id'],
                'acceptance_ms': round(accept_ms, 3),
                'observed_confirmation_ms': round((time.perf_counter() - start) * 1000, 3)})
        after = stock()
        assert after == before - args.samples, (before, after)
        result['baseline'] = {
            'acceptance': summary([row['acceptance_ms'] for row in result['baseline_samples']]),
            'observed_confirmation': summary([row['observed_confirmation_ms'] for row in result['baseline_samples']]),
            'stock_before': before, 'stock_after': after}

        print('Pausing Kafka and accepting three orders...', flush=True)
        command(COMPOSE + ['pause', 'kafka'])
        paused_at = time.perf_counter()
        stalled = [place(f'outage-{index}')[0] for index in range(3)]
        def publish_failure_seen():
            return 'Outbox: failed to publish event' in command(COMPOSE + ['logs', '--no-color', 'backend'])
        wait_until(publish_failure_seen, seconds=40, interval=0.25)
        during = {'orders': [api(f"/api/orders/{row['id']}")['status'] for row in stalled],
                  'pending_rows': int(sql(f"SELECT count(*) FROM outbox_events WHERE aggregate_id IN ({','.join(repr(str(row['id'])) for row in stalled)}) AND status='PENDING'")),
                  'stock': stock()}
        assert during['orders'] == ['PLACED'] * 3 and during['pending_rows'] == 3
        assert during['stock'] == after
        resumed_at = time.perf_counter()
        command(COMPOSE + ['unpause', 'kafka'])
        resume_command_ms = (time.perf_counter() - resumed_at) * 1000
        recoveries = []
        outstanding = {row['id'] for row in stalled}
        def recovered():
            for order_id in list(outstanding):
                if confirmed(order_id):
                    recoveries.append({'order_id': order_id,
                        'observed_confirmation_after_resume_ms': round((time.perf_counter() - resumed_at) * 1000, 3)})
                    outstanding.remove(order_id)
            return not outstanding
        wait_until(recovered, interval=0.05)
        aggregates = ','.join(repr(str(row['id'])) for row in stalled)
        wait_until(lambda: int(sql(f"SELECT count(*) FROM outbox_events WHERE aggregate_id IN ({aggregates}) AND status='PUBLISHED'")) == 3,
                   interval=0.25)
        publication_ms = (time.perf_counter() - resumed_at) * 1000
        recovered_stock = stock()
        assert recovered_stock == after - 3
        # Publish an explicit replay and observe another terminal-order delivery
        # in the consumer log instead of relying only on a fixed negative wait.
        replay_id = stalled[0]['id']
        payload = sql(f"SELECT payload FROM outbox_events WHERE aggregate_id='{int(replay_id)}' ORDER BY id LIMIT 1")
        log_before = command(COMPOSE + ['logs', '--no-color', 'backend'])
        marker = f'Ignoring delivery for terminal order {replay_id} (CONFIRMED)'
        earlier_count = log_before.count(marker)
        command(COMPOSE + ['exec', '-T', 'kafka', 'kafka-console-producer', '--bootstrap-server',
                           'kafka:9092', '--topic', 'order-events', '--property', 'parse.key=true',
                           '--property', 'key.separator=|'], input=f'{replay_id}|{payload}\n')
        wait_until(lambda: command(COMPOSE + ['logs', '--no-color', 'backend']).count(marker) > earlier_count,
                   interval=0.25)
        final_stock = stock()
        assert final_stock == recovered_stock
        result['failure_recovery'] = {
            'injection': 'docker compose pause kafka; then unpause',
            'paused_ms': round((resumed_at - paused_at) * 1000, 3),
            'recovery_timer_start': 'immediately before requesting docker compose unpause',
            'resume_command_ms': round(resume_command_ms, 3),
            'outbox_publish_failure_observed': True, 'during_outage': during,
            'recovered_orders': sorted(recoveries, key=lambda row: row['order_id']),
            'all_rows_published_after_resume_ms': round(publication_ms, 3),
            'stock_after_recovery': recovered_stock, 'explicit_replay_order_id': replay_id,
            'explicit_replay_observed': True, 'stock_after_replay': final_stock}
        result['finished_at_utc'] = datetime.now(timezone.utc).isoformat()
        result['checks_passed'] = True
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        logs = args.output.with_suffix('.log')
        logs.write_text(command(COMPOSE + ['logs', '--no-color', 'backend']), encoding='utf-8')
        print(json.dumps({'baseline': result['baseline'], 'failure_recovery': result['failure_recovery']}, indent=2), flush=True)
    finally:
        if started:
            # Always resume before cleanup, including when an assertion fails.
            subprocess.run(COMPOSE + ['unpause', 'kafka'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            command(COMPOSE + ['down'])


if __name__ == '__main__':
    main()
