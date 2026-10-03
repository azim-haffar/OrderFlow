# Reproducible local demo

Use Docker Desktop with Compose, and PowerShell. From the repository root:

```powershell
docker compose up -d --build
./scripts/demo.ps1
```

The script requires a quiet stack and product 1 with at least two units. It creates
two orders and consumes two units each run. It does not reset or delete data.
For a non-default development database user, pass `-PostgresUser <user>`.
The script reads stock directly from PostgreSQL to avoid Redis TTL affecting the
evidence. It publishes the original outbox payload again with the same order key,
waits for the consumer's terminal-order log, and checks stock remains unchanged.
It also checks HTTP 409 for cancelling a confirmed order and asynchronous
insufficient-stock cancellation. To exercise nginx's API proxy, pass
`-BaseUrl http://localhost:5173`.

Open http://localhost:5173 for the dashboard. API documentation is in the README.
The deterministic cancellation races and failure recovery are demonstrated by
the integration suite, rather than hoping a manual click lands during a race:

```sh
cd backend
mvn verify -B -Dapi.version=1.44
# Only the reliability scenarios:
mvn test -B -Dapi.version=1.44 -Dtest=OrderReliabilityIntegrationTest
```

Java 21, Maven and a running Docker engine are required. The API version override
allows the existing Testcontainers 1.19.7 Docker client to talk to newer Docker
engines; it is a test-process setting, not a global Docker change. On this Windows
machine Java and Maven are installed in Ubuntu under WSL; run those commands there
from the checkout's `backend` directory under `/mnt/c/`.

## 75–90 second walkthrough

| Time | Show | Explain |
| --- | --- | --- |
| 0–15s | Dashboard and lifecycle | “This is a local backend project for reliable asynchronous order processing. Orders begin as PLACED and inventory later confirms or cancels them.” |
| 15–30s | OrderService and outbox row | “Order and event commit in one PostgreSQL transaction. The publisher retries until Kafka acknowledges, but a crash before marking published can deliver the event twice.” |
| 30–45s | Demo output, original and replayed stock | “The consumer locks the order and accepts only PLACED. Stock and terminal status commit together, so redelivery sees the durable result and does no work.” |
| 45–60s | Race test names and order lock | “Cancellation uses the same lock. Whichever transaction wins decides: cancellation leaves stock unchanged, or processing confirms and cancellation receives 409. Tests observe a real database lock wait for both outcomes.” |
| 60–75s | Recovery test results | “Failures escape the listener so Kafka retries a rolled-back transaction. A second test reproduces the publish-before-mark window. Both paths must deduct stock only once.” |
| 75–90s | Limitations | “This is at-least-once delivery with idempotent processing for this lifecycle. Permanent errors can block a partition. Multi-instance outbox coordination, dead-letter recovery and stronger cache consistency remain future work; I have no measured throughput claim.” |

## Interview tradeoffs

- The order status doubles as the deduplication marker because each order has one
  inventory-processing transition. A system with multiple independent event types
  needs event IDs and a durable inbox or another deduplication scheme.
- Order-before-product locking serializes duplicate processing and cancellation;
  the product lock serializes competing orders. It adds database waiting under
  contention. Neither pessimistic nor optimistic locking is universally faster.
- Cancellation is first committed transition wins. There is no stock restoration
  for confirmed orders; that would be a separate compensation workflow.
- Database commit and Kafka offset commit are separate. A crash between them can
  replay the event; the database guard makes that replay safe for stock.
- Infinite retries preserve retryable work, but permanent failures hold up a
  partition. A production design needs alerting, durable dead-letter handling and
  an explicit replay policy. Deserialization failures are not covered here.
- Redis invalidation is outside PostgreSQL's transaction. Eviction before commit
  can permit a concurrent read to cache older stock until the two-minute list TTL
  or five-minute individual-product TTL expires.
  A cache failure currently rolls inventory back and is retried; an after-commit
  invalidation workflow would decouple cache availability from order completion.
