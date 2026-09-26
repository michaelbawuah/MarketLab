# Research service: Node.js, MongoDB and C++

The standalone service is implemented and locally verified against MongoDB 8.0.17. The hosted website remains on Workers + D1 until an external Node service and MongoDB deployment are configured. The optional signed gateway is present, but no production service URL or credentials are configured by this release.

## Responsibilities

| Component | Responsibility |
| --- | --- |
| React / Workers / D1 | Interactive research, authenticated ownership, current datasets/ledgers and canonical saved experiments |
| Node.js HTTP service | Signed job submission/status, bounded request handling and health check |
| MongoDB | Durable queued/running/completed/failed jobs, complete immutable input snapshots, final results and replay nonces |
| Worker threads | CPU calculations outside the HTTP event loop; bounded concurrency, memory and duration |
| TypeScript engine | Canonical exact-share/cash accounting and research outputs |
| C++ Node-API kernel | Independent calculation of observed risk statistics; nine parity comparisons per completed job |

Mongo does not become a second writer for D1 datasets or ledgers. Each job owns its complete snapshot and terminal output. The bridge reads the current authenticated owner's saved D1 experiment and submits that exact snapshot. There is no D1 deletion, automatic full-database migration or production cutover.

## Local setup

Requirements: Node 24, pnpm 11.25.0, a C++17 compiler, and MongoDB 8.0.17 or a compatible tested server. Native builds currently support Linux/macOS; `RESEARCH_ENGINE=typescript` explicitly disables native verification when needed. It is never silently disabled after a native error.

```sh
pnpm install --frozen-lockfile
pnpm native:build
pnpm test:native
```

Set these in your shell or an ignored local environment file. `pnpm service:start` inherits environment variables; it does not implicitly load a file.

```sh
export MONGODB_URI='mongodb://127.0.0.1:27017'
export MONGODB_DATABASE='marketlab'
export RESEARCH_SERVICE_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export RESEARCH_ENGINE='cpp-verify'
pnpm service:start
```

For a real disposable database test, build the addon, install `mongod` and run `pnpm test:service:local`. Set `MONGOD_BIN` if it is outside PATH. This starts a loopback-only Mongo process in a temporary directory, runs the integration layer and removes only its own temporary data. `pnpm test:service:local --ci` also compiles the addon and runs type checking, lint, unit and independent cross-check layers. Alternatively, `MONGODB_TEST_URI=... pnpm test:service` creates unique `marketlab_test_...` databases and deletes them afterward. Do not point integration tests at a deployment where creating disposable databases is inappropriate. See [the labeled suite](../tests/README.md) and [recorded reliability evidence](reliability-evidence.md).

The optional `compose.research.yml` supplies authenticated MongoDB, a persistent named volume and a Node container bound only to loopback. It is a local deployment recipe, not a public HTTPS deployment. Docker is not available in the build workspace, so the container build/Compose path has not been executed here; native compilation and the standalone process path have been tested directly.

```sh
export MONGO_ADMIN_PASSWORD="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export MARKETLAB_MONGO_PASSWORD="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export RESEARCH_SERVICE_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
docker compose -f compose.research.yml up --build -d
```

Store these generated values securely if reusing the Compose volume; changing environment variables does not rotate an existing MongoDB user's password. The example uses hex passwords so URI escaping is unambiguous. The pinned Mongo version matches local verification; review supported security updates before production deployment. The Node image uses the current Node 24 image tag, so record its resolved digest when deploying.

## Export and import a research experiment

Download **Full report JSON** from Research lab. The client verifies the report ID, dataset content IDs, event payload and settings before submitting it. Set the owner ID explicitly for the standalone trusted client. The website gateway obtains it from platform authentication; browser request bodies cannot choose an owner.

```sh
export RESEARCH_SERVICE_URL='http://127.0.0.1:8788'
export RESEARCH_OWNER_ID='your-stable-owner-id'
pnpm service:submit submit exported-experiment.json verified-result.json
```

The client waits up to two minutes, writes a new result file without overwriting an existing one, and supports safe retry of the same snapshot. Importing a historical report recomputes it; it does not trust supplied analysis or alter the original D1 run. Completed jobs can also be fetched directly through the signed API. No user data was migrated during this release.

## API and authentication

| Request | Behavior |
| --- | --- |
| `GET /healthz` | Unsigned database readiness and configured calculation mode |
| `POST /v1/jobs` | `{ "snapshot": ... }`; validate and enqueue, or return an existing job |
| `GET /v1/jobs` | Owner's job summaries |
| `GET /v1/jobs/:id/status` | Owner's job status without full snapshots/results |
| `GET /v1/jobs/:id` | Owner's full frozen snapshot and completed output |

Except `/healthz`, requests use HMAC-SHA256 over version, fixed service audience, method, exact request target, timestamp, nonce, owner and SHA-256 of raw body bytes. Signatures expire after 60 seconds of clock skew. A unique owner/nonce record prevents replay; TTL cleanup is housekeeping, not the expiry check. HTTP redirects are rejected. Service errors do not return database URLs or raw driver errors. Mongo operations use a five-second deadline; calculation workers have a 30-second deadline.

Secrets and MongoDB URLs belong in server-side secret storage. Use TLS for remote database and service connections. The standalone API has no browser CORS interface; the private website calls it server to server. The service secret authorizes owner impersonation by trusted gateways, so it must never be sent to a browser or embedded in client code. Coordinate secret rotation on both sides. No account OAuth or public multi-tenant registration is added here.

## Queue guarantees and limits

- A run ID is the SHA-256 of its complete snapshot, matching the hosted research engine. CSV/provider content hashes are recomputed at the service boundary.
- Unique `{owner,id}` and `{owner,slot}` indexes plus a database validator restricting slot to 0–29 make concurrent quota checks atomic without transactions. All job states consume slots. Replaying an existing ID works at capacity.
- Each job stores input, lease state and terminal result in one document. A claim increments its attempt count and assigns a fresh lease token. Expired leases can be reclaimed; completion, heartbeat and failure updates require the live token and an unexpired lease.
- Lease issuance, expiration, renewal and finalization use MongoDB's `$$NOW` in atomic filters/update pipelines. They do not trust a worker host's clock. An acknowledged heartbeat remains valid when the same-millisecond renewal changes no stored bytes. User-supplied update values are literal data, including dollar-prefixed strings.
- At most three attempts, two CPU workers by default (configurable 1–8), 128 MiB V8 old-generation limit per worker, 1 MiB input, and 1,900,000 combined input/result bytes. The V8 limit does not cap every native allocation; the native kernel separately bounds arrays to 2,500 elements.
- Computation may run more than once after a crash; only the fenced current worker can commit. Completed input/results are immutable through the API. This is at-least-once processing with idempotent finalization, not exactly-once execution.
- A calculation or native parity rejection fails permanently. Infrastructure interruptions retry up to the attempt limit. Missing native binaries fail startup in `cpp-verify` mode.
- Existing collection validators must match the service schema; startup refuses an unknown schema instead of silently modifying it. The app database role needs read/write and normal collection/index creation privileges, not a Mongo root account.

There is no deletion/retention interface yet. Backup, restore rehearsal, alerts, service-level monitoring, public ingress rate limits and production load tests remain activation/hardening work.

The September 26 failure test kills an actual runner process after canonical calculation but before result finalization. Two replacement runners recover through natural lease expiry, leaving one completed result with two attempts. This proves that specific crash window on one local MongoDB server. It does not establish database replica failover, network-partition behavior, host-clock behavior inside a MongoDB cluster or arbitrary external-side-effect deduplication.

## Optional hosted connection

After deploying the Node service with HTTPS and authenticated MongoDB, configure these **server-side Site secrets**:

```text
RESEARCH_SERVICE_URL=https://your-research-service-origin
RESEARCH_SERVICE_SECRET=the-same-secret-used-by-the-node-service
```

The URL must be an origin without a path, query or embedded credentials. An additional **Background verification** control then appears on saved experiments. It submits the owned snapshot, polls status, and shows completed recomputation/native comparisons. With both values absent, the current research workflow stays available and no external request is attempted. A partially configured connection reports an error. Disabling the optional connection does not remove D1 records or Mongo jobs.

Activation requires an actual Node hosting target, MongoDB URI/credentials, TLS and this matching secret. None has been provisioned in production. The existing Sites Worker cannot execute a native Node addon.

## Measurements

The [service load baseline](service-performance.md) measures the signed HTTP,
MongoDB queue, worker calculation and saved-result journey. Three fresh-database
runs each verified 1,000 jobs with no failures: 39.96 jobs/s aggregate and 319.77 ms
combined client-observed p99, using two workers, eight clients and 500 prices per
instrument. Raw samples, source hashes, environment and limits are included.
Run `pnpm bench:service --output /path/to/new-directory` with `MONGOD_BIN` set.
This is local closed-loop evidence; staging and production remain unmeasured.

`pnpm bench:native` writes [native-benchmark.json](native-benchmark.json). In the recorded shared Linux run, the 2,500-observation risk kernel's median was 0.0463 ms in TypeScript, 0.0148 ms in C++, and 0.0279 ms including array packing. This is approximately 3.1× direct / 1.7× packed kernel throughput, not an application speedup.

The full direct TypeScript calculation measured 13.75 ms. Worker measurements include input validation, hashing, structured-clone transport and the full simulation. The C++ verification mode adds work and leaves canonical output unchanged; different worker medians in one shared run reflect timing variability and do not establish an app optimization. Separate fresh-process peak RSS was about 73 MiB (TS), 68 MiB (native prepacked) and 137 MiB (native with repeated packing); these are whole-process measurements, not native-only memory.

Primary references: [MongoDB atomic writes](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/), [unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/), [schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/specify-json-schema/), [TTL behavior](https://www.mongodb.com/docs/manual/core/index-ttl/), [Node worker threads](https://nodejs.org/api/worker_threads.html), and [Node-API](https://nodejs.org/api/n-api.html).
