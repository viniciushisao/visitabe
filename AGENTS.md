---

# Visita App Philosophy

This project is an MVP.

Our priority is to deliver features quickly while keeping the codebase easy to understand and maintain.

We intentionally avoid introducing infrastructure that does not solve a real problem today.

## Initial Architecture

```
Flutter App
      │
      ▼
Node.js + Fastify API
      │
      ├── PostgreSQL
      ├── OpenAI API
      └── File Storage
```

This architecture is enough to support the first versions of the application and can scale much further than most MVPs require.

## Do NOT Add Yet

The following technologies should **not** be introduced unless there is a measurable need:

- Redis
- Message Queues
- RabbitMQ
- Kafka
- Docker (for development)
- Kubernetes
- Microservices
- Background Workers
- Event Bus
- CQRS
- Event Sourcing
- Distributed Cache
- API Gateway
- Load Balancers
- Multiple Databases

These technologies are excellent tools, but they solve problems that we do not currently have.

Adding them too early increases:

- Complexity
- Development time
- Deployment complexity
- Maintenance cost
- Debugging difficulty

## Scale Only When Needed

The project should evolve gradually.

Current architecture:

```
Flutter
    │
    ▼
Fastify
    │
    ▼
PostgreSQL
```

Future architecture (only if required):

```
Flutter
    │
    ▼
Load Balancer
    │
 ┌──┴────┐
 │       │
API     API
 │       │
 └──┬────┘
    │
 Redis
    │
 PostgreSQL
```

There is no benefit in building the future architecture before it becomes necessary.

## Rule of Thumb

When someone proposes adding a new technology, ask:

- What problem does this solve?
- Do we currently have this problem?
- Can we solve it with simpler code?
- Can we postpone this decision?

If there is no clear and measurable benefit today, do not add it.

The simplest architecture that works is almost always the best architecture.

## Authentication

Before creating or modifying authentication, sessions, tokens, users, or protected routes, read [AUTHENTICATION.md](./AUTHENTICATION.md).

All authentication changes must follow that document.
