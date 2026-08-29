# Monorepo with the worker as a separate process

The repository is a pnpm workspace: `apps/api` (webhooks + admin REST), `apps/worker` (queue
consumer), `apps/web` (Next.js + Tailwind) and `packages/core` (pure domain, no I/O),
orchestrated by docker-compose.

The worker runs as its own process, not as background work inside the API. The central
requirement of the system is decoupling processing from the webhook response; processing in the
same process keeps the resource coupling — a burst of slow messages degrades webhook latency and
breaks the 5-second ack — even when the code looks decoupled. Separate processes also let the
worker and the API scale independently, which is the whole reason for the split.

`packages/core` imports neither Fastify nor the Twilio SDK: that is the structural guarantee
that domain rules are testable without infrastructure.
