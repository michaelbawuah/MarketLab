# Email sign-in for invited discussions

## Scope approved September 27, 2026

The user selected **Invited discussions** for email login. The existing workspace
continues to use its owner-only ChatGPT identity. Email guests receive a separate
WorkOS identity and must explicitly accept a valid report invitation. Existing
ChatGPT invitations remain bound to their original account. Matching email
addresses do not merge accounts or transfer invitations.

The integration uses WorkOS AuthKit's hosted sign-in and official Worker SDK,
with Magic Auth enabled in the provider dashboard. WorkOS handles verification
codes, delivery, identity and encrypted sessions. MarketLab continues to handle
the invitation, discussion and immediate revocation checks in D1. No new database
or schema migration is required. There are no invitation emails or notifications.

## Activation

The integration is **disabled by default**. It is currently enabled with WorkOS
Staging. Live sign-in is confirmed by the owner and a verified-session callback
log; the remaining email-account discussion lifecycle checks are still pending.
Until all configuration is present and the flag is enabled, the email button is
hidden and its endpoints return 404. ChatGPT sign-in continues to work.

1. Create/sign in to the owner's WorkOS account and select the intended AuthKit
   environment/application. Enable **Magic Auth**; use the default hosted domain
   and email sender. Do not activate paid SSO, custom domains, Radar subscriptions,
   or other paid add-ons. The user authorized $0 paid spend.
2. Add the exact redirect URI:
   `https://marketlab-portfolio.michaelbaffour240306.chatgpt.site/api/discussion-auth/callback`.
   Guests start from a MarketLab invitation; a generic login without an invitation
   deliberately does not create workspace access.
3. Configure these runtime values in Sites, without putting secrets in chat or Git:

   | Key | Value |
   | --- | --- |
   | `WORKOS_API_KEY` | The selected environment's API key; secret |
   | `WORKOS_CLIENT_ID` | The selected application's client ID |
   | `WORKOS_COOKIE_PASSWORD` | A new cryptographically random secret of at least 32 characters |
   | `WORKOS_REDIRECT_URI` | The exact callback URL above |
   | `DISCUSSION_EMAIL_AUTH_ENABLED` | `true`, only when ready for the live acceptance check |

4. Republish to apply the configuration. Using a fresh invitation and a separate
   browser/account, complete email-code delivery, callback, explicit acceptance,
   comment, refresh and sign-out. Revoke the invitation and verify subsequent
   reads/comments are denied. Do not claim live email delivery before this check.
5. Disable the flag and republish to hide email login if activation fails.

WorkOS lists AuthKit user management as free up to 1 million monthly active users;
paid extras are separate. Account-specific activation requirements and billing
settings still require inspection before enabling production traffic.

## Authentication and evidence boundaries

- S256 PKCE and a signed, host-only, Secure/HttpOnly state cookie bind the callback
  to its initiating browser. State expires after ten minutes. Only an exact
  `/discussion/<64-hex-token>` return path is allowed. The invitation token is not
  sent in the provider authorization URL or a referrer.
- The official SDK seals sessions and verifies JWT signatures and expiration.
  MarketLab additionally checks verified email, issuer, identity/profile binding,
  audience when present, and rejects impersonated sessions. Stable authorization
  IDs use `workos:<client-id>:<user-id>`; email is not the authorization key.
- Email cookies never authorize owner workspace APIs. All discussion reads and
  writes still check the active invitation, claimant, report revision and expiry.
  Existing account binding, duplicate-write protection, audit and moderation apply.
- Expired access tokens use the SDK refresh flow. Provider calls have a ten-second
  timeout and no automatic retries. Sign-out requires a same-origin POST and
  revokes the provider session before clearing the browser cookie. Provider-side
  revocation does not retroactively invalidate an already-issued access token;
  invitation revocation is checked directly in D1 on every request.
- The two sign-in methods remain separate. When an email session is present it
  takes precedence in discussions. Choosing ChatGPT clears the email cookie first.
  Unnamed email guests appear as “Invited reader”; their email is shown only to
  them in the account line, not in other readers' comments.
- Tests use fictional AuthKit responses and test-generated RSA keys, alongside
  the real SDK, compiled Worker and disposable local D1. This verifies application
  behavior, not WorkOS account setup, provider email delivery or the live dispatcher.

## Local verification — September 27, 2026

TypeScript checking, lint on changed TypeScript files, and the production build
passed. All three focused authentication tests passed. The final compiled Worker
passed **222 HTTP/header/content assertions**, including 15 additional email
identity/content assertions and the existing 28 discussion audit/concurrency
assertions. The count includes the actual HTTP status assertions during both
discussion flows, not only their extra content checks.

Email checks cover disabled configuration, invalid return paths, nonexistent
invitations, absent/mismatched callback state, cancellation, verified sign-in,
explicit acceptance, posting, hidden guest email, owner-API denial, distinct
ChatGPT identity despite a matching email, tampered/unverified/wrong-issuer
sessions, refresh and rotated cookie, same-origin sign-out, invitation revocation,
and switching back to ChatGPT. Unit checks additionally cover state tampering,
expiry, another signing key, duplicate cookies and the S256 challenge/verifier.

No live email, WorkOS account, production user or production data was used by
these tests. Railway and GitHub were not redeployed for this Site integration.
Email activation was disabled for the initial deployment. See
[captured gate summary](evidence/discussion-email-local.txt).

## Staging configuration — September 27, 2026

The owner configured the callback in the WorkOS Staging application and saved
`WORKOS_API_KEY` directly as a hosted secret. Hosted environment revision 8 adds
the matching client ID, callback URI, a new random session secret, and enables
the email flag for the first live acceptance check. This configuration does not
establish successful code delivery, callback, acceptance, or revocation with a
real WorkOS account; the lifecycle check above remains outstanding. No WorkOS
Production activation or paid add-on was selected. The invitation dialog now
uses provider-neutral account wording and concise instructions.

## Issuer regression and first live attempt — September 27, 2026

Version 27 was published successfully with environment revision 8. The user's
14:14 America/New_York screenshot showed a failed email sign-in. Production
callback logs at `2026-09-27T18:14:27.437Z`, request
`f0703cd56bd35e21ba0501bdaab7ff88`, show that code exchange completed and session
validation rejected the result. The logs do not contain tokens or decoded claims,
so they do not establish the exact failed identity check.

The WorkOS [session-token API reference](https://workos.com/docs/reference/authkit/session-tokens)
uses `https://api.workos.com` as issuer, while its
[session guide](https://workos.com/docs/authkit/sessions) documents the version
with a trailing slash. The application and original fixture accepted only the
latter. Changing the signed fixture to the API reference's issuer, `client_id`,
and absent `aud` reproduced the same callback redirect to `?email_error=1`
against the original built Worker before changing the implementation.

Version 28 validation accepted exactly those two default WorkOS issuer strings, checked
the signed `client_id` when supplied, and preserved signature/expiry, optional
audience, verified-email, subject/profile, and impersonation checks. It does not
accept arbitrary hosts, paths, or normalized URL variants. Callback rejection
logs now use a closed reason label without including claim values or identities.

TypeScript, changed-file lint, all three focused unit tests, and the production
build passed. The rebuilt Worker passed **229 HTTP/header/content assertions**,
including both documented issuers, client/audience mismatches, invalid issuer
variants, callback, refresh, sign-out, invitation revocation, and owner isolation.
See [before/after evidence](evidence/discussion-email-issuer-regression.txt).
This fixes a reproduced compatibility defect; real-provider sign-in and the full
email invitation lifecycle still require the owner's live retry.

## Client-specific issuer correction — September 27, 2026

The owner's retry after version 28 still failed. At `2026-09-27T18:36:58.639Z`,
callback request `09e3af8ba1bc50e5b8a2d6be6203cf9c` logged
`Discussion email callback rejected session: issuer_mismatch.` The previous
two-string compatibility change was insufficient; it did not establish that the
application accepted the issuer used by this WorkOS environment.

A read-only HTTPS request to the selected application's public WorkOS discovery
endpoint returned HTTP 200:
`https://api.workos.com/user_management/client_01M3HQ3HZMG7DXMPSKX8BRT6WV/.well-known/openid-configuration`.
It advertises issuer
`https://api.workos.com/user_management/client_01M3HQ3HZMG7DXMPSKX8BRT6WV`
and the matching application-specific `/sso/jwks/` URL. The
[official Node SDK documentation](https://workos.com/docs/sdks/node) also shows
this client-specific issuer format. This is provider configuration evidence,
not a decoded production token or a successful live session.

The application now accepts that exact issuer derived from its trusted configured
client ID, alongside the two documented legacy default issuers. No arbitrary
WorkOS paths, client IDs, hosts, URL normalization, or wildcard domains are trusted.
Signature, expiry, verified email, profile binding, client/audience and invitation
checks remain in place. Successful callbacks now log a static confirmation without
tokens, decoded claims, cookies or identities.

Updating the fictional signed fixture to the discovery format reproduced
`issuer_mismatch` against the previous build. After the correction, TypeScript,
changed-file lint, all three focused tests, and the production build passed.
The compiled Worker passed **234 HTTP/header/content assertions**. The callback
and refresh now use the client-specific issuer; legacy values still work, while
another client's issuer and extra slash/path/query variants fail. See
[captured discovery and regression evidence](evidence/discussion-email-client-issuer.txt).
At this deployment checkpoint, live sign-in and the complete email invitation
lifecycle were still pending. The later sign-in confirmation is recorded below.

## Live sign-in confirmed — September 27, 2026

Version 29, source `c7c4ac7b0fc3c0de9f0ddf9e3a85091e9ec8dcc6`, was published
with the issuer correction and existing environment revision 8. At 23:42:46
America/New_York, the owner reported, "it worked now, lets continue."

The production callback at `2026-09-28T03:42:20.107Z` independently logged
`Discussion email callback established a verified session.` Request
`9b988c022c0d6e7899b614496c94149b` returned HTTP 303. This confirms code exchange
and the application's session checks passed on the live site. It closes the
reported sign-in failure. No code, cookie, token or account identity was retained.

The owner confirmation establishes that sign-in worked in their browser; the
static callback log alone does not establish the email delivery method or later
browser behavior. Email-account invitation acceptance, comment, refresh,
sign-out and access denial after revocation remain separate live checks. Their
automated coverage passed in the 234-assertion local Worker run. WorkOS remains
on Staging; no production activation or paid feature was enabled.

## Official implementation references

- [WorkOS hosted UI](https://workos.com/docs/authkit/hosted-ui)
- [WorkOS Node integration and sealed sessions](https://workos.com/docs/authkit/vanilla/nodejs)
- [Magic Auth](https://workos.com/docs/authkit/magic-auth)
- [WorkOS pricing](https://workos.com/pricing)
- [Sites authentication](https://learn.chatgpt.com/docs/sites)
