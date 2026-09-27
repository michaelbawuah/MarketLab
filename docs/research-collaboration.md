# Invite-only report discussion

## Explicit model — September 27, 2026

Milestone 12 implements comments, not forks. The user approved invite-only
comments and asked for these four boundaries to be recorded before building.

1. **Visibility:** an accepted invitation shows exactly the existing redacted
   shared report and its confidence certificates. It grants no workspace,
   other-experiment, raw-input or brokerage access. Discussion is visible only
   to the owner and active accepted invitees; public report viewers cannot read it.
2. **Revocation:** revoking an accepted invitation also revokes that account's
   other accepted invitations to the same report revision. It blocks subsequent discussion
   reads and writes. Existing comments remain attributed in the thread. Removing
   a comment replaces its public body with a removal notice; the original text
   remains in private audit storage. Replacing/revoking/expiring the report link
   invalidates all invitations for that share revision. Earlier comments remain
   in the owner's history; a replacement share starts a new discussion. Anyone
   separately holding an active public report link can still read that summary.
3. **Identity:** use existing dispatch-owned Sign in with ChatGPT, not new OAuth
   infrastructure or a token-only claimed identity. A random single-use invitation
   binds atomically to the first signed-in account that explicitly accepts it.
   Before acceptance, forwarding the link transfers the ability to accept it.
   Afterwards, possession alone is insufficient. Names are display labels;
   authorization uses the stable dispatcher user ID. The owner creates and
   manually distributes a link; the app sends no email. Invite labels are private.
4. **Audit:** database triggers append invitation creation/acceptance/revocation,
   comment creation and removal, and share replacement/revocation events with
   actor ID, server time, report revision and entity ID. Comment-created records
   preserve original text. No browser-facing audit endpoint or invitation secrets
   are included. Database triggers reject audit updates/deletes. This is an
   application/database audit trail, not externally signed or admin-proof storage.

Comments are plain text (2,000 characters), with no editing, attachments or
notifications. Authors may remove their own comments while access is active;
the owner may moderate all comments. Each report has at most 100 invitations and
500 comments across revisions. Client-generated request IDs prevent duplicate
comments on retry. SQL mutations recheck membership, share revision and expiry
atomically; a prior browser check never authorizes a later write.

## Acceptance evidence

Type checking, ESLint and the production build passed. The built Worker passed
174 HTTP/header/content assertions against a disposable local D1 database,
including 28 additional discussion content, audit and concurrency assertions.
Checks cover anonymous rejection, account binding, concurrent acceptance by two
accounts (one winner), unaccepted/other-user denial, report-projection equality,
private-workspace denial, cross-origin rejection, duplicate comment retries,
author/owner moderation, original-text retention, append-only audit enforcement,
revocation of duplicate account invitations, share replacement, expiry and stale
writes. Existing sharing/provider checks passed in the same run.

The first run caught D1 counting trigger-created audit rows in `meta.changes`:
a successful single-row share update was incorrectly reported as a conflict.
Conditional writes now require a nonzero change count; the unique-key/revision
predicates still limit the actual entity mutation to one row. The passing gate
also exercises stale share revisions, so audit logging does not weaken fencing.

See [captured local output](evidence/invite-only-discussion-local.txt).
The untouched financial calculation/recovery suites retain their earlier
passing evidence; they were not rerun locally for this UI/authorization change.
Production dispatcher sign-in and an actual second-person conversation require
a real user check. Local emulated identities are not live identity verification
or adoption. No invitation was distributed and no email was sent during testing.


## Owner mobile check and copy refinement

The September 27 9:23 and 9:25 AM mobile screenshots show the live sign-in
landing page followed by the signed-in owner’s posted comment. This confirms
the owner exercised invitation acceptance and posting on mobile; it does not
establish a distinct second-person account. The owner requested concise guest
copy without explanations of private inputs or inaccessible workspace areas.
The guest introduction, acceptance text, discussion helper and report footer
were simplified accordingly. Authorization and audit behavior are unchanged.
