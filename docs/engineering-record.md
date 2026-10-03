# Engineering record — 3–4 October 2026

## Source inspected

The starting local commit was `eaf0199`; remote main was `d19c4bc`. Reliability
work was based on the newer main revision. Pre-existing local README and diagram
edits were preserved and excluded from the reliability commit.

The latest merged source already has the terminal-status guard and shared order
lock for duplicate processing/cancellation. The outstanding recovery defect was
the listener catching processing exceptions and returning normally after a
database rollback. Source inspection alone did not establish runtime correctness.

## Changes

- Propagate listener failures, disable Kafka auto-commit explicitly, and retry
  retryable failures every second without exhausting attempts.
- Retain the merged order-before-product lock and terminal-status policy; add a
  terminal-delivery log used by the demo.
- Add seven integration tests covering separate-transaction duplicates,
  concurrent duplicates, delivery after cancellation, both cancellation race
  winners, transaction rollback/retry through Kafka, and outbox replay after an
  acknowledged send whose published mark fails.
- Allow scheduling and listener startup to be disabled for deterministic test
  control. Defaults preserve normal application startup.
- Close integration-test application contexts after each class so they do not
  retain clients connected to containers that have stopped.
- Add Docker build exclusions, a checked demo script, and interview notes.

## Runtime evidence

Environment: Java 21 and Maven in Ubuntu under WSL, Docker Desktop with a Docker
29 engine. The first test run could not initialize containers with the old Docker
client API. `-Dapi.version=1.44` resolved this for the existing Testcontainers
1.19.7 dependency. One initial test had an invalid Mockito repository-spy setup;
it was corrected before the final full run.

| Check | Observed result | Local evidence |
| --- | --- | --- |
| `mvn verify -B -Dapi.version=1.44` | BUILD SUCCESS; 17 tests, 0 failures, 0 errors, 0 skipped | `backend/target/final-verification.log`, `backend/target/surefire-reports/` |
| Existing tests within that run | 4 unit tests, 3 order integration tests, 3 controller integration tests passed | Same reports |
| New reliability tests | All 7 passed with PostgreSQL 15, Kafka 7.5 and Redis 7 containers | `com.orderflow.OrderReliabilityIntegrationTest` report |
| Original listener control | Recovery test timed out: expected CONFIRMED, observed PLACED | `backend/target/recovery-before.log` and nested reports |
| Pre-fix inventory control | Both selected tests failed: repeated delivery reduced stock twice; delivery after cancellation also reduced stock | `backend/target/duplicate-before.log` and nested reports |
| Frontend | `npm ci` and `npm run build` passed | Observed command output; generated `frontend/dist/` |
| Final Compose build/start | Backend/frontend images built; all five services started; database, Redis and Kafka healthy | `backend/target/compose-verification.log` |
| Live demo | Order 1 CONFIRMED; stock 50 → 48; replay observed and stock stayed 48; cancellation HTTP 409; order 2 CANCELLED for insufficient stock | `backend/target/demo-direct.log` |
| HTTP checks | Dashboard `/` and nginx `/api/products` returned 200; direct backend API exercised by demo | Observed command output |

The before-change controls used isolated copies under `backend/target/`, with
the current test harness. The recovery control replaced only the listener with
its `d19c4bc` implementation. The inventory control replaced only InventoryService
with its `eaf0199` implementation. These are targeted regression controls, not
claims that an entire historical checkout was tested. Test failures were expected
in those controls. The normal source tree was not changed for those runs.

Logs, reports and generated builds are ignored local artifacts, not checked-in
evidence. Commands and test source reproduce the checks. The running local stack
is available at http://localhost:5173 and http://localhost:8080. Demo data remains
in its database; no volumes were deleted. Dashboard HTML and API paths were checked
over HTTP; a browser interaction or visual UI review was not performed.

## Remaining limitations

At-least-once delivery; terminal order status deduplicates this one processing
transition, not arbitrary event workflows. Permanent listener failures can block
a partition. No durable dead-letter/replay workflow or deserialization recovery
test. No multi-instance outbox coordination, authentication, production deployment
verification or measured load benchmark. Redis eviction is not atomic with the
database commit and can leave stale reads until the two-minute list TTL or
five-minute individual-product TTL expires. Recovery tests inject boundary
exceptions; they do not simulate an actual process crash or prolonged broker outage.

See [demo and walkthrough](demo.md) for commands and interview tradeoffs.
