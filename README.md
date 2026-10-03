# OrderFlow
### One order. One stock deduction. Even when the event arrives twice.

An event-driven order-processing project built with **Java 21, Spring Boot, Kafka, PostgreSQL, and Redis**, with a React dashboard.

[![CI](https://github.com/azim-haffar/OrderFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/azim-haffar/OrderFlow/actions/workflows/ci.yml)
[Architecture notes](docs/architecture.md) · [Test code](backend/src/test/java/com/orderflow) · [Portfolio](https://azimx.dev)

![OrderFlow dashboard](docs/screenshots/overview.png)

## The engineering problem

Saving an order and publishing a Kafka event cannot share a normal database transaction. A failed publish can lose work; a retry can deliver it twice. Concurrent orders can also oversell inventory.

| Decision | Implementation |
| --- | --- |
| Keep the order and event together | Transactional outbox saved alongside the order |
| Allow retries without repeated stock deductions | Lock the order, then process only `PLACED` orders |
| Serialize competing inventory changes | PostgreSQL pessimistic product lock |
| Resolve cancellation races | Cancellation takes the same order lock as inventory processing |
| Keep reads cached | Redis product cache with eviction after inventory changes |
| Exercise real dependencies | JUnit + Testcontainers for PostgreSQL, Kafka, and Redis |

```text
React → REST API → PostgreSQL (order + outbox)
                         ↓ scheduled publisher
                       Kafka → inventory transaction → CONFIRMED / CANCELLED
```

## Run locally

Native frontend development requires Node.js 22.12 or newer.

Native frontend development requires Node.js 22.12 or newer.

Requires Docker with Compose; ports 5173 and 8080 must be available.

```sh
git clone https://github.com/azim-haffar/OrderFlow.git
cd OrderFlow
docker compose up --build
```

Open the [dashboard](http://localhost:5173). The API is at `http://localhost:8080`.

```sh
curl -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{"productId":1,"quantity":2,"customerId":"demo-customer"}'
```

The response starts as `PLACED`. Inventory processing later confirms or cancels the order; insufficient stock is an asynchronous cancellation. Development database credentials are in Compose. The broker's advertised address is for containers on the Compose network.

## Verify

```sh
# Java 21 + Maven; Docker must be running for integration tests
cd backend
mvn verify -B

# In a separate terminal, from the repository root
cd frontend
npm ci
npm run build
```

CI runs the backend tests and frontend build. Regression coverage includes repeated delivery, cancellation before processing, missing products, and insufficient stock.

## Boundaries

This is a portfolio project with a single scheduled outbox publisher. Delivery is **at least once**, not exactly once. It has no authentication or production deployment hardening. Multi-instance outbox coordination, dead-letter handling, and measured load benchmarks remain future work. The dashboard screenshots demonstrate the UI; they are not performance evidence.
