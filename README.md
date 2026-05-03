# OrderFlow

![CI](https://github.com/azim-haffar/orderflow/actions/workflows/ci.yml/badge.svg)

A production-grade, event-driven order processing system built with Spring Boot 3, Kafka KRaft, PostgreSQL, Redis, and React 18.

[English](#english) · [Deutsch](#deutsch)

---

## English

### What it is

OrderFlow is a full-stack demonstration of an event-driven microservice pattern: a React frontend places orders via REST, Spring Boot persists them to PostgreSQL and publishes events to Kafka, and an inventory consumer processes each event under a pessimistic database lock before resolving the order as CONFIRMED or CANCELLED. Redis caches the product catalogue with a 60-second TTL. The entire stack runs from a single `docker compose up --build`.

### Quick Start

Prerequisites: Docker Desktop, Docker Compose v2

```bash
git clone https://github.com/azim-haffar/orderflow.git
cd orderflow
docker compose up --build
```

| Service   | URL                        |
| --------- | -------------------------- |
| Frontend  | localhost:5173             |
| Backend   | localhost:8080             |
| Postgres  | localhost:5432 (orderflow) |
| Redis     | localhost:6379             |
| Kafka     | localhost:9092             |

### Architecture

```text
  React (Vite + nginx)
         |
         | HTTP/REST
         v
  Spring Boot 3
  +-----------------------+
  | ProductController     |  <---> Redis (60s TTL cache)
  | OrderController       |  ---> PostgreSQL (JPA + Flyway)
  |                       |  ---> Kafka topic: order-events
  +-----------------------+
         |
         | Kafka consumer
         v
  InventoryService
  (SELECT FOR UPDATE)
         |
         v
  PostgreSQL
  Order status: CONFIRMED / CANCELLED
```

Order lifecycle: POST /api/orders → DB save → Kafka publish → consumer acquires row lock → stock check → CONFIRMED / CANCELLED

Client cancellation: DELETE /api/orders/{id} → status guard (PLACED only) → CANCELLED (204) · already CONFIRMED/CANCELLED → 409

### Engineering Decisions

| Decision | Rationale |
| -------- | --------- |
| **DB save before Kafka publish** | Guarantees the row exists before the consumer processes the event. Publishing first risks a consumer reading an order ID that is not yet visible to other transactions. |
| **Pessimistic locking (SELECT FOR UPDATE)** | Eliminates oversell under concurrent load without retry storms. Optimistic locking collapses under high contention; pessimistic locking is the correct default for inventory. |
| **Direct CacheManager injection instead of @Cacheable** | Spring AOP cannot intercept self-invocation within the same bean, so @Cacheable on internal methods silently bypasses the cache. Direct injection removes the proxy dependency entirely. |
| **Kafka KRaft, no Zookeeper** | Reduces operational surface area. KRaft has been production-stable since Kafka 3.3 and removes an entire coordination layer from the deployment. |
| **Denormalized productName on OrderItem** | Preserves historical accuracy. A product rename must not silently rewrite what a customer ordered; the name is captured at order time. |
| **No @Data on JPA entities** | Lombok @Data generates equals/hashCode over all fields. On Hibernate-managed proxies this causes recursive loops and LazyInitializationException under association traversal. |
| **Testcontainers for integration tests** | Tests run against real PostgreSQL, Kafka, and Redis instances. No mocks means no mock/production divergence and no false-positive test suites. |
| **Transactional Outbox Pattern** | Direct Kafka publish inside a DB transaction creates a dual-write problem — if Kafka is down, the order is saved but the event is lost. The outbox table commits atomically with the order row; a poller retries until Kafka acknowledges. |
| **RFC 7807 ProblemDetail** | Gives API consumers a machine-readable, standardised error envelope. Raw HTTP status codes alone are insufficient for programmatic error handling. |
| **DELETE cancels PLACED orders only** | An order that has already reached CONFIRMED or CANCELLED has been processed by the inventory consumer; mutating it after the fact would create stock and audit inconsistencies. The status guard enforces this invariant and returns 409 for any other state. |

### API Reference

| Method | Path                  | Description                          | Body                                   |
| ------ | --------------------- | ------------------------------------ | -------------------------------------- |
| GET    | `/api/products`       | List all products with current stock | —                                      |
| GET    | `/api/products/{id}`  | Single product by ID                 | —                                      |
| POST   | `/api/orders`         | Place a new order                    | `{ productId, quantity, customerId }`  |
| GET    | `/api/orders/{id}`    | Poll order status                    | —                                      |
| GET    | `/api/orders`         | Last 20 orders                       | —                                      |
| DELETE | `/api/orders/{id}`    | Cancel order (PLACED status only)    | —                                      |

Error codes: `400` Validation failed · `404` Order or product not found · `409` Insufficient stock / order not cancellable

### Tech Stack

| Layer          | Technology                                |
| -------------- | ----------------------------------------- |
| Backend        | Java 21, Spring Boot 3.2, Spring Kafka    |
| ORM            | Spring Data JPA, Hibernate 6, Flyway      |
| Database       | PostgreSQL 15                             |
| Cache          | Redis 7, Spring Cache                     |
| Messaging      | Apache Kafka 7.5 (KRaft, no Zookeeper)    |
| Frontend       | React 18, Vite 5, plain CSS               |
| Testing        | JUnit 5, Testcontainers, Awaitility       |
| Infrastructure | Docker Compose, nginx                     |

### Running Tests

```bash
# Backend integration tests (requires Docker)
cd backend
mvn verify

# Frontend build validation
cd frontend
npm ci && npm run build
```

Tests spin up PostgreSQL 15, Kafka (Confluent 7.5), and Redis 7 automatically via Testcontainers. No manual setup required.

---

## Deutsch

### Was es ist

OrderFlow demonstriert ein event-getriebenes Microservice-Muster im Vollstack-Kontext: Ein React-Frontend sendet Bestellungen per REST, Spring Boot persistiert sie in PostgreSQL und publiziert Events nach Kafka. Ein Inventory-Consumer verarbeitet jeden Event unter pessimistischem Datenbank-Lock und setzt den Bestellstatus auf CONFIRMED oder CANCELLED. Redis cached den Produktkatalog mit 60 Sekunden TTL. Der gesamte Stack startet mit einem einzigen `docker compose up --build`.

### Schnellstart

Voraussetzungen: Docker Desktop, Docker Compose v2

```bash
git clone https://github.com/azim-haffar/orderflow.git
cd orderflow
docker compose up --build
```

| Service   | URL                        |
| --------- | -------------------------- |
| Frontend  | localhost:5173             |
| Backend   | localhost:8080             |
| Postgres  | localhost:5432 (orderflow) |
| Redis     | localhost:6379             |
| Kafka     | localhost:9092             |

### Engineering-Entscheidungen

| Entscheidung | Begründung |
| ------------ | ---------- |
| **DB-Save vor Kafka-Publish** | Stellt sicher, dass die Zeile existiert, bevor der Consumer das Event verarbeitet. Ein vorzeitiges Publish riskiert, dass der Consumer eine Order-ID liest, die in anderen Transaktionen noch nicht sichtbar ist. |
| **Pessimistisches Locking (SELECT FOR UPDATE)** | Verhindert Überverkäufe unter Concurrent Load ohne Retry-Stürme. Optimistic Locking versagt bei hoher Contention; pessimistisches Locking ist die korrekte Wahl für Bestandsverwaltung. |
| **Direkte CacheManager-Injektion statt @Cacheable** | Spring AOP kann Self-Invocation innerhalb derselben Bean nicht abfangen, weshalb @Cacheable an internen Methoden den Cache stillschweigend umgeht. Die direkte Injektion eliminiert die Proxy-Abhängigkeit vollständig. |
| **Kafka KRaft, kein Zookeeper** | Reduziert die operative Komplexität. KRaft ist seit Kafka 3.3 produktionsstabil und entfernt eine gesamte Koordinationsschicht aus dem Deployment. |
| **Denormalisierter productName in OrderItem** | Sichert historische Korrektheit. Eine spätere Produktumbenennung darf nicht stillschweigend umschreiben, was ein Kunde bestellt hat; der Name wird zum Bestellzeitpunkt fixiert. |
| **Keine @Data auf JPA-Entitäten** | Lomboks @Data generiert equals/hashCode über alle Felder. Auf Hibernate-Proxies führt das zu rekursiven Schleifen und LazyInitializationException beim Traversieren von Assoziationen. |
| **Testcontainers für Integrationstests** | Tests laufen gegen echte PostgreSQL-, Kafka- und Redis-Instanzen. Keine Mocks bedeutet keine Mock/Prod-Divergenz und keine falsch-positiven Testsuiten. |
| **RFC 7807 ProblemDetail** | Liefert API-Clients ein maschinell lesbares, standardisiertes Fehlerformat. Rohe HTTP-Statuscodes allein reichen für programmatische Fehlerbehandlung nicht aus. |
| **DELETE storniert nur Bestellungen im Status PLACED** | Eine Bestellung, die bereits CONFIRMED oder CANCELLED erreicht hat, wurde vom Inventory-Consumer verarbeitet. Eine nachträgliche Mutation würde Bestand und Audit-Log inkonsistent machen. Der Status-Guard erzwingt diese Invariante und gibt für jeden anderen Zustand 409 zurück. |

### Tests ausführen

```bash
# Backend Integrationstests (benötigt Docker)
cd backend
mvn verify

# Frontend Build-Validierung
cd frontend
npm ci && npm run build
```

Die Tests starten PostgreSQL 15, Kafka (Confluent 7.5) und Redis 7 automatisch via Testcontainers. Kein manuelles Setup erforderlich.

---

### Projektstruktur

```text
orderflow/
├── backend/            Java 21 / Spring Boot 3 application
│   ├── src/main/       Production source
│   └── src/test/       Testcontainers integration tests
├── frontend/           React 18 + Vite SPA
├── docker-compose.yml  Single command for all services
└── .github/workflows/  CI pipeline (GitHub Actions)
```

---

Built by Azim Haffar · azimx.dev · linkedin.com/in/azim-haffar
