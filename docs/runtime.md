# Runtime notes

The project uses the bundled Vinext starter and Sites build integration. Preserve `sites()` in `vite.config.ts`. The hosted runtime is a Cloudflare-compatible Worker, not a long-running Node.js process.

The source contains no secrets. The logical database binding is `DB` in `.openai/hosting.json`. Hosting provisions that database and applies checked-in SQL migrations. Generate new schema migrations from `db/schema.ts` with `pnpm db:generate`. Do not rewrite a migration after production application.

For local D1 after a build, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_demonic_nightmare.sql
```

The historical-data addition is `drizzle/0001_sleepy_wolverine.sql`; apply it with the same command and its filename after the first migration.

Do not reapply a local migration that has already succeeded. `.wrangler/` is ignored and contains only local state. Hosted data is not packaged with source.

The managed preview is controlled by `sites-preview start` and `sites-preview stop`. The project-local execution profile is ignored; portable development must configure the portable profile with the Sites setup helper, then use `pnpm dev`. Publishing uses the Sites source/build workflow and keeps the deployment owner-private.

The provider addition is `drizzle/0002_productive_shadow_king.sql`. It creates owner-scoped request history and adds source metadata with a constant CSV default. Apply it after 0001 for local preview. Production applies it through the hosting migration flow. An optional `ALPHA_VANTAGE_API_KEY` must be a server secret; never prefix it with `NEXT_PUBLIC_`. No secret is needed for the public IBM provider demo.

The corporate-action addition is `drizzle/0003_mixed_thor_girl.sql`. It adds the owner/dataset keyed event record and revision without modifying prices or existing ledger data. Apply after 0002 for local preview.

The historical portfolio addition is `drizzle/0004_next_senator_kelly.sql`. It adds one owner-keyed current portfolio with a revision, fingerprint, saved timestamp and frozen input payload. It does not change the sample ledger or existing market snapshots.

The Research lab addition is `drizzle/0005_thin_freak.sql`. It adds owner/id-keyed immutable experiments with frozen inputs and outputs. Apply after 0004 for local preview. Per-owner count limits use an atomic INSERT predicate; the API bounds combined serialized row content before preview and save.
