# Architecture and tradeoffs

## Transaction boundaries

`OrderService.placeOrder` saves an order and an `OutboxEvent` in one PostgreSQL transaction. `OutboxPoller` publishes pending events to Kafka and marks them published after the send completes. A crash between sending and marking can replay an event, so consumers must tolerate duplicates.

`InventoryService.processOrderPlaced` obtains a pessimistic order lock, checks that the order is still `PLACED`, and then obtains the product lock. It either deducts stock and confirms the order or cancels it without changing stock. Cancellation takes the order lock too. All order transitions therefore use the order-before-product lock order.

Terminal states are ignored on redelivery. This guard handles duplicates for this workflow; it is not a general-purpose event deduplication store.

## Read path

Product reads use Redis caching. Inventory updates evict the affected product. PostgreSQL remains the source of truth. Cache eviction is an external operation and is not atomic with the database commit; stronger cache consistency would need a separate invalidation strategy.

## Test strategy

Service unit tests cover duplicate events and terminal-state handling. Spring integration tests use PostgreSQL, Kafka, and Redis containers to verify the real order-to-inventory path and insufficient stock. These tests require Docker.

`OrderReliabilityIntegrationTest` adds separate-transaction redelivery, concurrent
duplicates, both cancellation race winners, Kafka recovery after a rolled-back
inventory transaction, and outbox replay after acknowledgement but before marking
published. Race tests hold a transaction open and observe the competing transaction
waiting in PostgreSQL. Recovery tests use spies to inject boundary failures while
database transactions and message delivery use real containers.

Processing failures propagate to Spring Kafka's error handler. Auto-commit is
disabled, and retryable listener failures use a one-second unlimited retry policy.
The stock/status transaction commits before the listener returns. A replay after
database commit is safe because the order is already terminal. A permanent listener
failure can block its partition; deserialization recovery and durable dead-letter
handling remain outside this implementation. See [demo and interview notes](demo.md).
The retry configuration follows the [Spring Kafka error-handling documentation](https://docs.spring.io/spring-kafka/docs/3.1.0-SNAPSHOT/reference/html/#default-eh).

## Known limits

The outbox poller assumes one publisher instance and waits for each Kafka send. Multi-instance coordination, dead-letter recovery, authentication, observability, and load testing are not implemented here. No throughput or latency benchmark is claimed.

## Screens

![Order overview](screenshots/overview.png)
![Order list](screenshots/orders.png)
![Event log](screenshots/events.png)
