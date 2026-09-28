# Independent replay of saved experiments

Approved September 28, 2026. An owner can choose **Run independent replay** in
Research lab. Python independently reconstructs the saved experiment's three
periods and nine simulations. A successful check attaches a receipt to that
exact saved report; project CI results never become a report's receipt.

The confidence certificate shows the completion time, compared scalar count,
verifier version and verifier source SHA-256. Full JSON includes the private
receipt and its report digest; CSV includes the certificate summary. C++ risk
comparisons remain a separate background check. Preview, portfolio and
corporate-action reports do not acquire unsupported Python verification.

## Binding and ownership

`POST /api/research/replay` accepts only a saved experiment ID, requires the
workspace owner and enforces the existing same-origin JSON-write rules. It
loads the inputs and results from D1; the browser cannot upload a receipt or
replacement report. Valid stored receipts are reused without another request.

The Worker signs a request to the existing research service's `/v1/replay`
endpoint. Python validates the input fingerprint and independently compares
every result field. Its response hashes the exact UTF-8 request bytes. The
service records its verifier source hash and completion time. The full-report
digest covers `{format,id,snapshot,analysis}` in that fixed wrapper order,
preserving the frozen nested JSON key order used by the existing input ID.
Display names outside the snapshot, creation metadata and prior receipts are
excluded; the snapshot's own name remains part of its input identity.

The Worker validates receipt shape and exact report binding before storing it
in `research_replay_receipts`, keyed by owner and run ID. The SQL write checks
that both saved payload and result are still identical to the checked report.
Every subsequent private read, export and new sharing preview rechecks the
digest. A changed result, another owner's identical experiment or a malformed
receipt cannot inherit passing evidence. This is a trusted service record,
not a portable cryptographic attestation or external data certification.

Public summaries include only the safe certificate summary. They omit private
report/input IDs, the full-report digest and raw inputs. Existing links retain
their reviewed, frozen content. New Python evidence changes the next sharing
preview digest and requires the normal owner review/replacement flow; it never
silently updates a shared report or its discussion revision.

## Runtime bounds and failure behavior

The existing Railway free-trial container adds Python's standard library; no
new service, paid upgrade, package dependency or MongoDB schema is required.
The Node gateway admits one Python process per service instance, with a
1,950,000-byte report limit, 16 KiB combined output limit and eight-second hard
timeout. Python runs without inherited application secrets, user script paths,
shell expansion or temporary report files, with 256 MiB address space and six
CPU seconds. The slot is released only after the subprocess closes.

Concurrent requests receive 429 and can be retried by the owner. A numerical
mismatch returns 422. Unavailable service, invalid response or timeout fails
without a verified badge or stored successful receipt. There are no automatic
retries. Exact cents, rational shares and trades must match exactly; floating
metrics use absolute and relative tolerances of 1e-10. Replay does not prove
source authenticity, event completeness, exchange-calendar coverage or future
performance.

## Acceptance boundaries

Focused tests execute the real isolated Python process and generated SQLite
migrations. They cover altered metrics, fingerprint mismatch, duplicate JSON
keys, capacity, hard timeout, owner isolation, stale-report writes and sharing
consent. Built-Worker checks exercise the owner endpoint, rejection paths,
cached receipts, JSON/CSV exports, redaction, anonymous summary rendering and
removal of evidence after result mutation. Their HTTPS transport is mocked;
the supplied receipt is produced by the real Python checker.

The signed HTTP integration test and container acceptance workflow also call
the real endpoint and reject a tampered report. Current execution results are
recorded in `docs/verification.md`. A healthy deployment and CI are distinct
from the owner clicking the live replay button. The separate public-link
anonymous browser lifecycle check remains outstanding.
