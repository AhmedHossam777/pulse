# NestJS Microservice Transports — Redis vs TCP vs RabbitMQ vs the rest

This doc answers three things for the **Pulse** project (an `api-getway` HTTP gateway talking
to a `notifications` microservice):

1. What does the **Redis transport** actually do, compared to plain **TCP**?
2. Is Redis **better than RabbitMQ** (or the other transports)?
3. If you're building a **production** app, what should you pick — and why?

> TL;DR: In this repo, "Redis transport" means **Redis Pub/Sub** under the hood. It's great for
> dev and low-stakes events, but it is **fire-and-forget (at-most-once)** — if the consumer is
> down, the message is **lost**. For a production notifications system where losing a message
> matters, prefer **RabbitMQ** (reliable work queue) or **Kafka** (high-throughput / replayable
> event log). Plain TCP is the simplest but couples services directly and doesn't fan out.

---

## 1. What the Redis transport does instead of plain TCP

Both are NestJS "transporters" — the wire mechanism behind `@MessagePattern` / `@EventPattern`,
`client.send()` (request→response) and `client.emit()` (fire-and-forget). The difference is the
**topology**.

### TCP transport (NestJS default)

```
 api-getway  ───────────  direct TCP socket  ───────────►  notifications
 (client)                  (point-to-point)                 (TCP server)
```

- The microservice **is** a TCP server listening on a host:port.
- The client opens a **direct socket** to that exact address.
- No middleman. The client must **know where the service lives** (service discovery is your problem).
- Fan-out (one event → many consumers) and load-balancing across N instances are **not built in**.
- Fast and dead-simple, but **tightly coupled**: if the service moves/restarts, the client must reconnect to it specifically.

### Redis transport (what this project uses)

```
 api-getway  ──►  ┌─────────────────┐  ──►  notifications #1
 (publisher)      │   Redis broker  │  ──►  notifications #2
                  │   (Pub/Sub)     │  ──►  notifications #3
                  └─────────────────┘
```

- A **broker (Redis) sits in the middle**. Both sides connect to Redis — *not* to each other.
- The `host`/`port` in your NestJS config is the **address of Redis**, not of the microservice.
  (That's why both `apps/notifications/src/main.ts` and the gateway's `notification.module.ts`
  point at the same Redis.)
- **Decoupling**: the gateway never needs to know where the notifications service runs — only
  where Redis is. You can add/remove/restart consumer instances freely.
- **Fan-out**: `emit()` publishes to a channel; every subscriber on that channel receives it.
- **Request/response** (`send()`) works by publishing to a request channel and listening on a
  reply channel.

### The important caveat (production-critical)

NestJS's Redis transporter is built on **Redis Pub/Sub**, which is **at-most-once**:

- ❌ **No persistence** — messages are not stored. If **no subscriber is connected** at publish
  time, the message is **gone forever**.
- ❌ **No acknowledgements / retries / redelivery** — if a consumer crashes mid-processing, the
  message is not redelivered.
- ❌ **No dead-letter queue**, no backpressure, no replay.

So Redis transport buys you **decoupling + fan-out + low latency** over TCP, but it does **not**
make delivery reliable.

> ⚠️ Don't confuse this with **Redis Streams** or **BullMQ** (`@nestjs/bullmq`). Those *are*
> persistent/reliable Redis-based queues — but they are a **different mechanism** from the NestJS
> *microservice* Redis transporter, which is plain Pub/Sub. If someone says "Redis is reliable,"
> they usually mean Streams/BullMQ, not the transporter you're using here.

### TCP vs Redis at a glance

| Aspect | TCP | Redis (Pub/Sub transporter) |
|---|---|---|
| Topology | Direct client→service | Broker in the middle |
| Coupling | Tight (client knows service address) | Loose (both know only Redis) |
| Fan-out to many consumers | No (manual) | Yes (Pub/Sub) |
| Extra infra to run | None | A Redis server |
| Delivery guarantee | Best-effort over one socket | **At-most-once**, no persistence |
| Latency | Lowest | Very low (one extra hop) |
| Good for | Simple internal calls, monoliths-being-split | Decoupled events where loss is OK |

---

## 2. Is Redis better than RabbitMQ (or others)? — "It depends"

There is **no universally better transport** — it depends on the delivery guarantees and access
pattern you need. The honest comparison:

| Transport | Model | Delivery guarantee | Persistence / replay | Ordering | Throughput | Ops weight | Sweet spot |
|---|---|---|---|---|---|---|---|
| **TCP** | Point-to-point RPC | Best-effort | No | Per-connection | High | None | Simple internal service-to-service, splitting a monolith |
| **Redis (Pub/Sub)** | Pub/Sub broker | **At-most-once** | **No** | No | Very high | Low | Real-time ephemeral signals, dev/prototyping, fan-out where loss is tolerable |
| **RabbitMQ (AMQP)** | Queues + exchanges | **At-least-once** (ack/nack) | Durable queues | Per-queue | High | Medium | Reliable task/work queues, jobs that must not be lost, complex routing |
| **Kafka** | Distributed commit log | At-least-once (≈exactly-once w/ care) | **Yes — retains & replays** | Per-partition | **Very high** | High | Event streaming, event sourcing, audit logs, many independent consumers |
| **NATS (core)** | Pub/Sub | At-most-once | No | No | **Extremely high** | Low | Ultra-low-latency internal messaging |
| **NATS JetStream** | Streams | At-least-once | Yes | Yes | Very high | Medium | Lighter alternative to Kafka/Rabbit |
| **MQTT** | Pub/Sub (QoS 0/1/2) | Configurable per QoS | Optional | No | High | Low | IoT / constrained devices / unreliable networks |
| **gRPC** | RPC (HTTP/2 + protobuf) | Best-effort (sync call) | No | N/A | High | Low | Strongly-typed **synchronous** service-to-service APIs, streaming |

### How to read this

- **Redis vs RabbitMQ** is the core of your question. They optimize for different things:
  - **Redis Pub/Sub** = *speed + simplicity*, but **lose-able** messages.
  - **RabbitMQ** = *reliability* — durable queues, consumer **acknowledgements**, automatic
    **redelivery** on failure, **dead-letter queues**, and rich **routing** (direct/topic/fanout).
    The price is more moving parts and slightly higher latency.
- **RabbitMQ vs Kafka**: Rabbit is a **smart broker / work queue** (push to consumers, ack,
  per-message routing, good for "do this job once"). Kafka is a **dumb-but-durable log** (consumers
  pull and track their own offset, messages are **retained and replayable**, great when many
  systems need the same stream or you want to re-process history). Rule of thumb: **Rabbit for
  commands/tasks, Kafka for event streams/analytics**.
- **gRPC** is the odd one out: it's **synchronous RPC**, not async messaging. Pick it when you want
  a typed contract and an immediate response, not when you want to decouple via a queue.

So: **Redis is not "better" or "worse" than RabbitMQ — it's a different trade-off.** Redis wins on
latency/simplicity; RabbitMQ wins on reliability/routing.

---

## 3. For a production application — what's the best choice?

Start from the **delivery guarantee you need**, not from the technology.

### Decision guide

- **"I cannot afford to lose this message"** (payments, sending notifications, order processing)
  → **RabbitMQ** (or NATS JetStream / Redis Streams / Kafka). **Not** Redis Pub/Sub.
- **"Many independent services need the same event, and/or I want to replay history / audit"**
  → **Kafka** (or NATS JetStream).
- **"It's an ephemeral real-time signal; losing one is harmless"** (live presence, cache
  invalidation hints, dashboards, typing indicators)
  → **Redis Pub/Sub** is perfect and cheap.
- **"I just need one service to call another and get an answer, strongly typed"**
  → **gRPC** (or plain TCP for internal-only simplicity).
- **"IoT / mobile / flaky network / tiny devices"**
  → **MQTT**.

### Recommendation for *this* project (Pulse notifications)

Your flow is: gateway `emit(SEND)` → notifications service actually delivers the notification, plus
a `send(GET_STATUS)` request/response. A notification you silently drop is a real bug for users.

- **Best fit: RabbitMQ.** A "send this notification" message is a classic **work/task queue**:
  you want at-least-once delivery, an **ack only after** the email/SMS/push actually went out, and
  automatic **retry + dead-letter** when a provider is temporarily down. RabbitMQ gives you all of
  that with minimal code change (NestJS `Transport.RMQ`).
- **Choose Kafka instead** if notifications are part of a larger **event pipeline** — e.g. multiple
  consumers (notifier, analytics, audit log) all react to the same `NotificationRequested` event,
  or you need to **replay** a day's events after an outage. Higher operational cost, so only adopt
  it when you actually need the streaming/replay/throughput.
- **Keep Redis** as your **cache / rate-limiter / idempotency store / ephemeral pub-sub**, and for
  **local development** of the microservice transport (which is exactly what it's doing now — it's a
  great dev default). Just don't rely on its Pub/Sub for guaranteed delivery in prod.
- A pragmatic middle path if you want to stay on Redis infra: use **BullMQ** (`@nestjs/bullmq`) or
  **Redis Streams** for the reliable "send" queue, instead of the Pub/Sub transporter. You get
  acks/retries/persistence without standing up RabbitMQ.

#### Suggested production target

| Concern | Pick |
|---|---|
| Reliable "send notification" job | **RabbitMQ** (`Transport.RMQ`) — or BullMQ/Redis Streams if staying on Redis |
| Status request/response | gRPC or HTTP (sync) — or keep it on the same broker |
| Multiple consumers / replay / audit | **Kafka** |
| Cache, rate limiting, idempotency keys | **Redis** (keep it) |
| Local dev convenience | **Redis Pub/Sub** (what you have now) |

### Migration note (it's a small change in NestJS)

Because NestJS abstracts the transport, swapping is mostly config. For RabbitMQ:

```ts
// notifications/src/main.ts
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.RMQ,
  options: {
    urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
    queue: 'notifications',
    queueOptions: { durable: true },   // survive broker restart
    noAck: false,                      // <-- ack only after the work is done
  },
});
```

…and add a `rabbitmq` service to `docker-compose.yml` (image `rabbitmq:3-management`, ports
`5672` + `15672`) the same way Redis was added. Your `@MessagePattern` / `@EventPattern` handlers
stay the same.

---

## Key takeaways

- **Redis transport ≠ reliability.** In NestJS it's **Pub/Sub = at-most-once**; messages are lost
  if no one is listening. It buys **decoupling + fan-out + low latency** over plain TCP.
- **TCP** is the simplest (direct, no broker) but **couples** the gateway to the service's address
  and doesn't fan out.
- **RabbitMQ** is the go-to for **reliable task queues** (acks, retries, DLQ, routing). **Kafka**
  for **high-throughput, replayable event streams** with many consumers.
- **For production notifications, use RabbitMQ (or Kafka if it's a streaming pipeline).** Keep
  **Redis for caching / rate-limiting / ephemeral signals / dev**.
- There is **no single "best" transport** — choose by the **delivery guarantee and access pattern**
  your feature needs.