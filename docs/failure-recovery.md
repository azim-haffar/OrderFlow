# Kafka unavailability: durable acceptance, recovery, and safe replay

Verified locally on **6 October 2026**, against application revision `19ba720`.
The test audit and measured behavior are separate evidence:

- [Test report](evidence/2026-10-06-test-report.json): a fresh `mvn clean verify`
  passed 17 tests, with zero failures, errors, or skips. Four XML suites and all
  testcase names were matched to current test source. Report checksums and the
  build-log checksum are recorded; raw reports remain local generated artifacts.
- [Measurement data](evidence/2026-10-06-local-recovery.json): all 20 baseline
  samples, environment details, stock assertions, and the recovery observations.
  The backend source checksum binds this run to the measured implementation.

## Setup and measurement definitions

Windows 11 client using Python 3.14.8; Docker Desktop engine 29.8.1 reported
12 CPUs and 16,710,770,688 bytes of available memory. An isolated Compose project
ran the Spring Boot backend, PostgreSQL 15, Redis 7, and Kafka via Confluent
Platform 7.5.0. Only the backend was exposed, at `127.0.0.1:18080`. There were
no shared database volumes or infrastructure ports. Resources were not individually
capped; this is a local sample, not a controlled capacity benchmark.

Three warm-up orders were excluded, followed by **20 sequential orders** at
concurrency one. Each requested one unit of product 1. Acceptance time runs from
immediately before the POST until the response has been read and parsed.
Observed confirmation time uses the same start and ends when GET first reports
`CONFIRMED`, polling every 50 ms. It includes the scheduled outbox delay, Kafka,
database work, HTTP calls, and polling overhead.

| Local baseline, n = 20 | Median | Sample p95, nearest rank | Min–max |
| --- | --- | --- | --- |
| POST acceptance | 13.276 ms | 33.646 ms | 8.251–39.654 ms |
| Observed confirmation | 1,017.154 ms | 1,034.306 ms | 581.248–1,043.337 ms |

The baseline reduced stock from 47 to 27, exactly one unit per order. The roughly
one-second completion time is consistent with the configured one-second outbox
fixed delay. It is not a database-only latency measurement. With 20 observations,
the nearest-rank p95 is only the nineteenth sorted sample; it is not a stable
estimate of production tail latency. No requests-per-second or scalability claim
is inferred from this sequential run.

## Failure and recovery scenario

1. Pause only the isolated Kafka container. Keep PostgreSQL, Redis, and the
   application running. Submit three more orders, IDs 24–26.
2. Wait until the outbox publisher reports a failed publish. Read the orders via
   REST and the outbox/stock directly from PostgreSQL. All three orders remained
   `PLACED`, all three rows were `PENDING`, and stock remained 27. The order API
   accepted work despite broker unavailability because order and outbox persistence
   share a PostgreSQL transaction, without a synchronous Kafka send.
3. Request `docker compose unpause kafka`. The observed paused interval, from
   pause-command completion to the resume request, was **6,747.815 ms**. Start the
   recovery timer **before** the resume command, including its **383.183 ms** runtime.
4. Observe each order reach `CONFIRMED`; then independently wait for all three
   outbox rows to be marked `PUBLISHED`.

| Observation from resume request | Result |
| --- | --- |
| Order 24 confirmed | 388.647 ms |
| Order 25 confirmed | 393.438 ms |
| Order 26 confirmed | 397.235 ms |
| All three outbox rows observed PUBLISHED | 1,482.373 ms |
| Stock after recovery | 24: exactly three units deducted |
| Explicit replay of order 24 | Consumer logged terminal-order handling; stock stayed 24 |

These are client-observation times, not exact database commit timestamps. Order
confirmation and the published mark are distinct boundaries: a consumer can
finish before the publisher's retry updates its outbox row.

The local backend log captured this sequence (UTC; timestamps abbreviated here):

```text
00:48:56.313  Outbox: failed to publish event 24 for order 24: null
00:48:58.060  Order 24 confirmed. Product 1 stock reduced from 27 to 26
00:48:58.078  Order 25 confirmed. Product 1 stock reduced from 26 to 25
00:48:58.091  Order 26 confirmed. Product 1 stock reduced from 25 to 24
00:48:59.071  Outbox: published event 24 for order 24
00:48:59.073  Ignoring delivery for terminal order 24 (CONFIRMED)
00:49:01.681  Ignoring delivery for terminal order 24 (CONFIRMED)
```

The first terminal-order log occurred on publisher replay; the second followed
an explicit republish of the original payload. This illustrates why waiting five
seconds for a send is not proof that it never reached Kafka: an in-flight send can
complete later. At-least-once publication requires consumer idempotency. Processing
locks the order, checks `PLACED`, then locks the product; stock and terminal status
commit together. A subsequent delivery sees the terminal status and does no work.

The experiment made no application code changes. Only its Kafka container was
paused; its containers and network were removed after the checks, including on
failure. The normal application project and its data were not used.

## Reproduce

Python 3, Docker Desktop/Compose, and Java 21/Maven are required. From the checkout
root, run the fresh test audit in a Bash-compatible terminal (Ubuntu under WSL on
this Windows machine):

Capture the build log outside `backend/target`, which `mvn clean` removes:

```sh
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
set -euo pipefail
(cd backend && mvn clean verify -B -Dapi.version=1.44) | tee verification.log
python3 scripts/verify-test-report.py \
  --build-log verification.log --not-before "$started" \
  --output docs/evidence/test-report.json
```

The verifier rejects a failed build, missing suites/testcases, XML failures or
skips, totals inconsistent with the Maven log, and reports predating the supplied
start time. It currently supports this repository's plain `@Test` methods;
parameterized tests would require extending the source matcher.

Then run the runtime experiment from PowerShell or Bash:

```sh
python scripts/measure-recovery.py --output docs/evidence/local-recovery.json
```

The script builds a fresh stack, runs the baseline, pauses Kafka, verifies durable
pending state, resumes Kafka, checks recovery and replay, writes JSON and a local
ignored `.log`, and tears down its stack. It refuses to reuse an existing
`orderflow-evidence` project. If a process is forcibly killed, inspect that project
before manually resuming or removing it:

```sh
docker compose -p orderflow-evidence -f scripts/compose.evidence.yml ps -a
docker compose -p orderflow-evidence -f scripts/compose.evidence.yml unpause kafka
docker compose -p orderflow-evidence -f scripts/compose.evidence.yml down
```

## What this establishes, and what remains open

The observed invariant held for this run: broker unavailability preserved accepted
orders without changing stock; recovery completed all three orders; duplicate
delivery did not deduct stock again. Automated integration tests separately cover
concurrent duplicates, both cancellation race outcomes, transaction rollback/retry,
and the publish-before-mark window.

This was one brief process pause and a small sequential sample. It does not model
broker crashes, disk loss, network partitions, long outages, multi-instance outbox
publishers, simultaneous API load, or production SLOs. Image tags can resolve to
different patch releases later. The publisher failure log exposes only the
exception message, which was `null` here; better diagnostic logging remains open.
Permanent failures can block a consumer partition. Durable dead-letter handling,
authentication, stronger cache consistency, and load testing remain future work.

Defensible application wording: “Verified an event-driven Spring Boot order
backend with 17 automated tests, including duplicate delivery and cancellation
races; demonstrated durable acceptance and stock-safe recovery during a local
Kafka outage.” The small local timing sample belongs in the linked evidence,
with its workload and limits, rather than as a production performance claim.
