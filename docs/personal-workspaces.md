# Personal workspaces — September 28, 2026

The user authorized personal saved portfolio workspaces for new users, closure
of test and live-check gaps, and a three-person pilot. This extends the earlier
consumer redesign and supersedes the original single-owner restriction.

## Product behavior

- Public visitors immediately see the fictional $10,000 cost example.
- Open workspace offers existing verified email sign-in and ChatGPT sign-in.
  New accounts start with an empty My portfolio. The current account and sign-out
  action appear in the navigation. Returning users load their saved portfolio.
- Try a practice portfolio prepares authored fictional Schwab transactions,
  25 price observations and their known no-event record. The user reviews
  $994.97 value, $19.97 gain and $1.03 costs, then explicitly saves. A real
  portfolio is never replaced by the practice shortcut.
- Practice inputs also support the existing backtest, report download and
  reviewed public-sharing flows. Imported real data retains its completeness,
  price-basis and event checks; practice defaults are never applied to it.

## Account and resource boundaries

D1 keys already include the verified owner. Existing ChatGPT user IDs remain
unchanged so the original owner's records are preserved. Email identities use
`workos:<configured-client-id>:<verified-user-id>`, matching existing discussion
identities. Equal email addresses never link or merge accounts. If both sessions
exist, the explicit email session wins; an invalid email session fails closed.
Root-page responses are private/no-store and vary by account headers and cookie.
No owner is accepted from a request body or URL as authorization.

The existing WorkOS PKCE flow accepts exactly `/` or the existing invitation
path format. Invitation checks remain mandatory for discussion return paths.
State, signed host-only flow cookies, JWT verification and verified-email checks
are preserved. Workspace email logout revokes the email session, clears cookies,
and also leaves ChatGPT so a hidden second session cannot reopen another account.
WorkOS remains in its existing staging configuration; no paid upgrade is made.

The original configured provider key, if present, is restricted to its original
ChatGPT account. New accounts can use the public demo or their own one-time key.
Per-account dataset, report and provider limits remain in place. Background
service signatures still contain the current account ID. No service protocol,
financial engine or Railway runtime input changed in this extension.

## Observed checks

- TypeScript and lint pass; 135 unit tests, 19 real MongoDB/SQLite integration
  tests, four native tests, 11 Python tests and 67,044 comparisons across ten
  freshly generated reports pass.
- The old MongoDB executable was truncated at 85,496,320 bytes. The retained
  archive matches its recorded SHA-256; full extraction produced the expected
  220,137,320-byte MongoDB 8.0.17 executable. All 19 integration tests then ran
  without skips. This closes the previous local database-startup gap.
- 314 checks against the production-built Worker and isolated D1 pass. Coverage
  includes two independent ChatGPT accounts, a separately verified email account,
  durable portfolio saves/reads, brokerage conversion and exact fees, JSON/CSV
  exports, backtests, cross-account read/write denial, same-email separation,
  configured-key restriction, public-link create/replace/revoke, discussions,
  email callbacks and logout, and bound independent replay receipts.
- Supervised browser preview: new empty workspace → practice preview → save →
  reload retains the correct portfolio. Practice backtest preview/save works.
  Actual JSON and CSV browser downloads were parsed and agree on the ending
  value. Desktop and 390px-width layouts were inspected with fictional data.
  This preview uses local identity, not the production sign-in dispatcher.

## Remaining live and human gates

Prior user confirmations establish public-link opening, provider data saving,
background recomputation, independent replay, and invited email discussions.
They do not establish this new account-onboarding release. The Sites cloud
browser cannot reach deployed Sites; use the real participants' production
sessions for new sign-in, save/sign-out/sign-in persistence, phone downloads,
and a practice-report replacement/revocation check. Production logs can corroborate
those actions after they happen. Do not substitute local headers for live identity.

No three participants have been identified, contacted or observed in this
extension. The revised pilot kit records P1–P3 as not yet run and includes an
uncoached task script, facilitator checks and a results table. A genuine supported
brokerage export still requires a consenting user's real file; authored fictional
CSV coverage is not that evidence. No adoption claim follows from automated QA.
