# Fixed same-run entry — prepared, not a real run

The entry is `scripts/acceptance/recovery/run-same-run.mjs`. Its only optional
argument is `--reconcile-only`; it never accepts module, output, path, password,
case-list or callback arguments. All 17 cases and the actual 5016 package are
fixed. TEMP and TMP must canonically equal RUNNER_TEMP before profiles exist.

## Trigger and authorization are separate

Ordinary code pushes do not trigger identity work. The only push path is a newly
added `scripts/acceptance/requests/same-run-next-trigger.json`, with exact nonce
commit marker, actor and triggering actor, attempt 1, parent commit, event.before,
expectedBefore, and no other staged or unstaged tracked change. Manual runs only
perform preparation; they cannot enter the push-only identity validator.

A ticket cannot include its own as-yet-unknown run/commit in the same commit.
Therefore entry emits a safe authorization-request for the actual run/trigger
commit and polls one fixed repository/branch authorization JSON path. The parent
may subsequently supply a signed ticket through that normal reviewed path.
Signature, original run/commit, trigger nonce, expiry and scope must all match.
There are no redirects, arbitrary URLs or downloaded executable content, and
body size and wait time are bounded. No request or ticket was created by this
implementation.

## Custody and artifacts

The wrapper starts only the fixed Node entry and records exact PID/start ticks/
image. Authorization, A/B encrypted capsules, A3 pregrant, C absence, five-device
grant and fresh S02 cell each have separate safe artifacts, so receipt waits do
not deadlock on a final upload. Final case receipts/intents and exact screenshots
are explicitly listed; private streams, process registry, profiles and vault
are not uploaded.

Stop only requests the existing watchdog's terminal cleanup. It does not kill
the holder tree. Cleanup is accepted only with a bound terminal receipt, missing
vault root and exit of the exact holder. A request acknowledgment alone is not
cleanup. Scope is registered profiles, not arbitrary or unregistered paths.
On failed/terminated holder, the wrapper permits one fixed readback-only
reconciliation holder, never a new business attempt. It retains the original
failed receipt, uses separate reconciliation status/results, and exposes only
original A/B/C journal readback requests or trusted unsubmitted-slot skips. The
independent watchdog remains alive; terminal cleanup follows this bounded window.
Original job clock caps authorization and phase waits at start + 320 minutes,
reserving ten minutes inside the 330-minute job for terminal cleanup.

## Remaining activation gates

The schema-only production deployment/readback proof is now fixed by its
independently reviewed byte SHA; this is not Realtime business acceptance.
The approved parent signing key and reviewed factory are now byte-pinned;
this still does not create the one-time trigger or a signed run ticket. The Windows custody suite has a genuine separate run; the
newest twelfth journal-only check still requires the planned preparation rerun. Local
Node and YAML tests are not a substitute for Windows execution. The actual fresh signed-out package probe must run before credentials.
No new credential operation follows from this preparation document.

## Public index replaces rejected private fixture configuration

The public completion file contains only the fixed plan, a new synthetic run ID,
and the original Actions run/artifact/whole-ZIP hash index. It contains no owner,
pet or memory identifiers, encoded replacements, raw records or secrets. The old
rejected private configuration is retained only privately and must not be sent.

Inside the runner, the existing original artifact download is used without new
network permissions. Five fixed member byte hashes, source/reuse checks, unique
case matching and owner/pet/memory relationships are verified before deriving the
private fixture in memory. The S05 original intent memory is intentionally not
confused with the separate S03-created memory. A genuine resolver capability is
required; arbitrary caller fields cannot replace the original artifact.

The whole-ZIP hash is an evidence index, not a claim that download-artifact's
unpacked files recomputed that ZIP. Actual runner integrity checks use the exact
five original member byte hashes. Derived private identifiers are never printed
or written into the public index or a new public artifact.
