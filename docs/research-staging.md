# Research service staging acceptance

Milestone 11 **passed on Railway staging on September 27, 2026**. The
[remote receipt](evidence/research-staging-2026-09-27-receipt.json) records a
60-second lease, two attempts, one durable finalization and nine native
comparisons. [Deployment metadata](evidence/research-staging-2026-09-27-deployment.json)
identifies the exact source, image, host and persistent database volume.
The earlier container CI gate remains separate evidence. This staging result
does not establish backups, database failover or the owner's browser workflow.

## Trial deployment

The user authorized **free trial only, with no paid upgrade**. Their Railway
dashboard showed "30 days or $4.98 left" during setup. The project is named
`MarketLab staging`; Railway's default environment is named `production`, but
its purpose is staging. Both services run in `sfo`. Trial credit and time limit
availability; this is not a commitment to ongoing paid hosting.

| Component | Configuration |
| --- | --- |
| Research image | Repository root as build context; `services/research/Dockerfile`; exact GitHub commit as `SOURCE_COMMIT` build argument |
| Runtime | Pinned Node 24.19.0, C++ addon built in the matching image, unprivileged `node` user, one replica, two compute workers |
| HTTP | `RESEARCH_HOST=0.0.0.0`; platform `PORT` is honored unless `RESEARCH_PORT` is explicitly set; public HTTPS domain |
| Readiness | `/healthz`, 120-second deployment deadline; native loading and database initialization must succeed before listening |
| Lifecycle | Always-on worker service: disable sleeping/serverless; restart on failure with a bounded retry policy |
| Database | MongoDB 8.0.17 with authentication and a 500 MB persistent `/data/db` volume; private networking only, no public TCP proxy |
| App database user | `marketlab_service`, `readWrite` only on `marketlab`; create separately from the Mongo admin account |
| Service variables | `MONGODB_URI`, `MONGODB_DATABASE=marketlab`, fresh random `RESEARCH_SERVICE_SECRET`, `RESEARCH_ENGINE=cpp-verify`, `RESEARCH_WORKERS=2`, `RESEARCH_DEPLOYMENT_STAGE=staging` |
| Acceptance origin | `RESEARCH_ACCEPTANCE_URL` is the exact public HTTPS origin, with no path, credentials, query or fragment |

The first research image built but failed to initialize Mongo indexes. A
temporary diagnostic emitted only the startup phase and safe error code:
`MongoServerError`, `14031`, `OutOfDiskSpace`. Mongo authentication had succeeded.
MongoDB's default `indexBuildMinAvailableDiskSpaceMB=500` cannot work with this
trial volume: its mounted filesystem reported 434 MiB total, 201 MiB used and
224 MiB available. The staging Mongo start command now sets
`--setParameter indexBuildMinAvailableDiskSpaceMB=50`, retaining a nonzero
reserve, alongside `--setParameter diagnosticDataCollectionEnabled=false`.
Startup logs confirm the value and readiness. This is a small staging capacity
choice, not a general production recommendation; review storage before growth.

Store credentials in the host's secret variables. Keep Mongo admin credentials
out of the research container. Use URI-escaped credentials (random hex passwords
avoid ambiguity). Railway's private network encrypts inter-service traffic;
an external Mongo provider instead requires its TLS connection string. The
Railway Mongo template is unmanaged: persistence alone is not backup or failover.
Review supported image updates and record resolved image digests before provisioning.

Set the Dockerfile location with the provider's documented build setting
(`RAILWAY_DOCKERFILE_PATH=services/research/Dockerfile` on Railway). Declare
`SOURCE_COMMIT` with the selected immutable source SHA for its Docker build.
Keep that value synchronized before deploying any future runtime change.
Railway watch paths cover every Dockerfile input: research service, finance,
signing, native code, build/staging scripts, fixture, package/lock/workspace files
and `.dockerignore`. Documentation-only checkpoints do not redeploy research.
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
railway ssh --service research --environment production -- node --experimental-strip-types scripts/staging/check.ts staging /tmp/marketlab-staging-acceptance.json
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

## Observed remote acceptance

The September 27 run used a temporary operator start-command wrapper because
the connected provider tools did not expose remote shell execution. The wrapper
started the ordinary research server, waited for local and public readiness,
then launched the unchanged acceptance command **inside the deployed research
image**. It printed the completed receipt as one log record for retrieval.
No public crash endpoint, additional service or local substitute was used.
The normal start command was restored after successful cleanup.

| Evidence | Observed result |
| --- | --- |
| GitHub source | `84bd1a86c50b27e55195c3c0b9221c1edd84d83d` |
| Research image digest | `sha256:4b7edd99da7acbd0d33e936ed0ad9c931080035442cd3cf6310e24b8f7583776` |
| Acceptance deployment | `6b3af02f-a130-4edd-8053-1f62158013d0`, successful |
| Restored normal deployment | `fcecb36c-708e-429a-a732-c0b1d9ab9aeb`, same image digest, successful health check |
| Remote run | September 27, 09:56:19–09:57:20 UTC; 60,977 ms |
| HTTPS and authorization | Ready response, unsigned rejection, signed submission, owner isolation and replay passed |
| Crash recovery | SIGKILL after calculation; natural 60-second expiry; two competing runners; attempt two; one accepted finalization and one stored result |
| Correctness | Canonical output matched; nine native comparisons; stale completion/heartbeat/failure rejected; fresh-client read matched |
| Cleanup | Only this run's random owner records and two isolated collections removed |

The receipt's five TypeScript source hashes match the local source checkpoint;
its sixth hash identifies the native addon built in the deployed image. The
unprivileged runtime is Node 24.19.0. A persistent single Mongo volume is
attached; neither backup restore nor database-host-loss recovery was tested.

The [engineering CI run](https://github.com/michaelbawuah/MarketLab/actions/runs/36287597610)
and [container CI run](https://github.com/michaelbawuah/MarketLab/actions/runs/36287597512)
for the same source both passed. The latter uses `scope=ci` and a one-second
lease; it is not the remote staging receipt above.

The Site gateway is a separate activation step: configure its server-only
`RESEARCH_SERVICE_URL` and matching signing secret only after remote acceptance,
then verify an owner's saved experiment through Background verification.
Removing both gateway variables disconnects the optional service without
deleting D1 research or Mongo results. After the passing receipt, the service
origin and matching secret were added to Site environment revision 4 for the
next publication. Public reports and the owner-only workspace keep their
existing access model. The owner's live saved-experiment click remains an
explicit final integration check; do not infer it from service acceptance.

References checked September 27, 2026: [Dockerfile builds](https://docs.railway.com/builds/dockerfiles),
[MongoDB](https://docs.railway.com/databases/mongodb),
[private networking](https://docs.railway.com/networking/private-networking),
[remote SSH and file transfer](https://docs.railway.com/cli/ssh),
[deployment configuration](https://docs.railway.com/config-as-code/reference),
[plans and usage](https://docs.railway.com/pricing/plans),
[watch paths](https://docs.railway.com/builds/build-configuration), and
[MongoDB disk reserve](https://www.mongodb.com/docs/v8.0/reference/parameters/#mongodb-parameter-param.indexBuildMinAvailableDiskSpaceMB).
