# Research service staging acceptance

Milestone 11 is **pending a persistent host and a successful remote run**.
The deployable container and acceptance command are prepared. A passing
`Research container acceptance` GitHub Actions run is an ephemeral CI check;
it does not establish staging availability, backups or an activated Site gateway.

## Proposed deployment

Use one Railway staging environment with a research service and authenticated
MongoDB on its private network. Railway is a proposed provider, not a provisioned
account. Before creating resources, confirm the connected account, selected plan
and acceptable recurring spend. Its published Hobby plan is $5/month including
$5 of resource usage; excess usage is additional, so $5 is not a price quote for
this two-service deployment. A persistent Mongo volume also consumes resources.

| Component | Configuration |
| --- | --- |
| Research image | Repository root as build context; `services/research/Dockerfile`; exact GitHub commit as `SOURCE_COMMIT` build argument |
| Runtime | Pinned Node 24.19.0, C++ addon built in the matching image, unprivileged `node` user, one replica, two compute workers |
| HTTP | `RESEARCH_HOST=0.0.0.0`; platform `PORT` is honored unless `RESEARCH_PORT` is explicitly set; public HTTPS domain |
| Readiness | `/healthz`, 120-second deployment deadline; native loading and database initialization must succeed before listening |
| Lifecycle | Always-on worker service: disable sleeping/serverless; restart on failure with a bounded retry policy |
| Database | MongoDB 8.0.17 with authentication and a persistent `/data/db` volume; private networking only, no public TCP proxy |
| App database user | `marketlab_service`, `readWrite` only on `marketlab`; create separately from the Mongo admin account |
| Service variables | `MONGODB_URI`, `MONGODB_DATABASE=marketlab`, fresh random `RESEARCH_SERVICE_SECRET`, `RESEARCH_ENGINE=cpp-verify`, `RESEARCH_WORKERS=2`, `RESEARCH_DEPLOYMENT_STAGE=staging` |
| Acceptance origin | `RESEARCH_ACCEPTANCE_URL` is the exact public HTTPS origin, with no path, credentials, query or fragment |

Store credentials in the host's secret variables. Keep Mongo admin credentials
out of the research container. Use URI-escaped credentials (random hex passwords
avoid ambiguity). Railway's private network encrypts inter-service traffic;
an external Mongo provider instead requires its TLS connection string. The
Railway Mongo template is unmanaged: persistence alone is not backup or failover.
Review supported image updates and record resolved image digests before provisioning.

Set the Dockerfile location with the provider's documented build setting
(`RAILWAY_DOCKERFILE_PATH=services/research/Dockerfile` on Railway). Declare
`SOURCE_COMMIT` with the selected immutable source SHA for its Docker build.
Do not deploy the website Dockerfile or point a Railpack build at the web app.
Railway's legacy config-as-code page now recommends infrastructure-as-code;
this checkpoint uses documented service settings without an unverified legacy
deployment manifest.

## What the container gate proves

`.github/workflows/research-container.yml` builds this Dockerfile from the exact
workflow commit, starts the existing Compose recipe with random ephemeral
credentials and a dedicated named volume, and waits for both health checks.
It then runs the following command **inside the research container**:

```sh
RESEARCH_DEPLOYMENT_STAGE=ci node --experimental-strip-types scripts/staging/check.ts ci /tmp/marketlab-ci-acceptance.json
```

The command verifies signed submission, native parity, unsigned rejection,
cross-owner isolation and idempotent replay over the real service HTTP API.
For recovery, it creates two randomly prefixed collections in the same database,
so the live API's runner cannot claim the controlled fixture. It calculates
fictional input through the production TypeScript/C++ worker, sends a barrier
notification before finalization, and kills only that child with `SIGKILL`.
Two replacement runners then compete after natural database-clock lease expiry.
Acceptance requires attempt two, one accepted finalization, one stored result,
matching canonical output, rejected stale writes/heartbeats and a matching read
from a fresh Mongo client. CI uses a one-second lease to keep the gate short.

No public crash endpoint is installed. The command is operator-only and refuses
to run without a matching `ci` or `staging` environment marker. It removes only
its random owner records and its two random collections. A passing JSON receipt
is written only after checks and cleanup succeed, using exclusive file creation.
Credentials and raw driver errors are never written to the receipt or console.
CI retains the receipt and container image ID as an artifact for 30 days and
removes its own disposable containers and volume afterward.

## Remote staging run

Deploy the chosen commit, wait for readiness, and confirm persistent volume,
private database routing, runtime identity and public HTTPS. Record the hosting
deployment ID, source SHA, resolved image digest and environment in the evidence.
Use the provider's remote container execution feature. With a linked Railway
CLI and registered SSH key, for example:

```sh
railway ssh --service research --environment staging -- node --experimental-strip-types scripts/staging/check.ts staging /tmp/marketlab-staging-acceptance.json
```

This must execute on the deployed host; `railway run` runs locally and does not
meet the criterion. The `staging` scope requires HTTPS and the production
60-second lease. Allow roughly two minutes, including the natural lease wait.
Use a new receipt filename for every attempt. Copy the file out through the
provider's remote-file facility; for Railway, its documented `scp` uses the
service domain (or deployment instance ID) as the username at `ssh.railway.com`.

Inspect the receipt: `scope=staging`, `publicHttpsChecked=true`, the exact revision,
`leaseMs=60000`, two attempts, one finalization, one stored result, nine native
comparisons and successful cleanup. Preserve the receipt with deployment
metadata under `docs/evidence/`; do not include secrets or raw provider logs.
Only then mark milestone 11 complete. This is recovery after a runner process
crash, not Mongo replica failover or database-host-loss testing.

The Site gateway is a separate activation step: configure its server-only
`RESEARCH_SERVICE_URL` and matching signing secret only after remote acceptance,
then verify an owner's saved experiment through Background verification.
Removing both gateway variables disconnects the optional service without
deleting D1 research or Mongo results. No Site gateway change is part of this
preparation checkpoint.

References checked September 27, 2026: [Dockerfile builds](https://docs.railway.com/builds/dockerfiles),
[MongoDB](https://docs.railway.com/databases/mongodb),
[private networking](https://docs.railway.com/networking/private-networking),
[remote SSH and file transfer](https://docs.railway.com/cli/ssh),
[deployment configuration](https://docs.railway.com/config-as-code/reference),
[plans and usage](https://docs.railway.com/pricing/plans).
