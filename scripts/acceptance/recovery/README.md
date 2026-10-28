# One-time QA A recovery (parent-admin SQL; not an Auth-admin API)

Preparation does not authorize execution. The new workflow first runs isolated
crypto/request/transport tests and the Windows exact-owned-process supervisor
selftest without loading the live holder. A normal preparation push skips the
live job. Only a new added-only request with the exact nonce message, approved
actor/branch, parent SHA and run attempt 1 can start it. Never rerun an uncertain
recovery or use the old register-A holder. No actual request is stored here.

## Parent keys and input

After independent review, parent may run:

```
node scripts/acceptance/recovery/parent-helper.mjs generate-public --private-dir=<new-private-directory>
```

The directory must not exist. It is created mode 0700; RSA-3072 and independent
Ed25519 PKCS8 private files are mode 0600. The only stdout is public JSON:
`rsaPublicKey`, `signingPublicKey`, `encryptionKeySha256`, `signingKeySha256`.
Only these public values belong in the immutable request. No private key enters
Actions, repository or artifacts. Parent removes its temporary directory after
confirmed terminal state; do not destroy keys while an active recovery needs them.

## Capsule and exact CAS

Holder binds the fixed authorized account/owner/auth UID/project and the original
SQL updated_at string (including microseconds), nonce, current run/attempt/commit,
package source, key fingerprints and recovery expiry. Its high-entropy replacement
password stays only in the same holder's memory. bcrypt cost 12 is encrypted in a
standard compact JWE RSA-OAEP-256/A256GCM. Public capsule contains only nonce, run,
bindingDigest, ciphertext and requestSha256. No old password/hash/token is read.

Parent downloads the exact run's capsule and the exact trigger commit's request;
independently confirms their provenance. It may invoke `decrypt-private-bridge`
with `--private-memory-bridge --private-dir=... --capsule=... --request=...`
`--run=<exact run> --commit=<exact trigger SHA>`. **This mode emits the new bcrypt
and private binding solely for the approved functions.exec in-memory bridge. Do
not call it with tool output forwarded by text()/notify(), terminal output, logs,
files, or model context.** It refuses Actions and a TTY. This is not a SQL tool.

The controlled parent bridge validates the parsed object, then passes that new
bcrypt directly to its approved exact admin SQL CAS input. The update must match
only the authorized auth UID, account/owner linkage and exact old updated_at;
change only encrypted_password/updated_at, and return only id/time/rowcount.
Do not write SQL/hash files. Tool refusal or unknown result stops; no automatic
retry, registration, session revocation or another account change.

After one confirmed row, safe confirmation JSON has exactly `authUserId`,
`affectedRows:1`, `updatedAt` (UTC six-digit microseconds +00), `requestSha256`.
`sign-confirmed` uses the same capsule/request/run/commit/private-dir arguments
plus `--confirmation=<safe-confirmation-file>`. It emits only `{jws}`. The exact
signed payload contains bindingDigest/nonce/ciRunId/requestSha256/applied/rows/
updatedAt/issuedAt/expiresAt, not plaintext owner/UID. Parent publishes it normally
at the fixed nonce-specific GitHub path; a refusal is not bypassed.

## Runner lifecycle

Transport reads only the fixed GitHub raw repository/branch/path as bounded data,
no redirects/credentials/execution. Initial 404 is required before creating the
password. Invalid or preexisting receipt stops. JWS uses the independently pinned
Ed25519 key; exact binding/expiry and durable login intent precede one normal A
login. Unknown login stops permanently. A is never registered. Only the originally
planned B may be registered once, after verified A; A2 uses normal login. No
snapshot or business mutation precedes separately confirmed three-device QA scope.

Budget: holder 150 minutes total, recovery wait at most 30, grant wait at most 30,
business at most 90 and bounded by the total. Job 165 minutes leaves cleanup.
Same process retains credentials for all four reviewed live modules. Exact owned
PID/start-time/image supervisor is tested before credentials; always-stop is a
cleanup, not proof of business success. Passwords/proofs stay out of logs, public
artifacts, argv and environment. JavaScript strings cannot promise zeroization;
clear references and stop exact owned processes. Do not persist credentials.

## Offline tests and dependency isolation

```
npm ci --prefix scripts/acceptance/recovery --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
node --test scripts/acceptance/recovery/*.test.mjs
```

Private exact pinned jose/bcryptjs lockfile does not change product dependencies.
Protocol tests use synthetic identities/passwords and transient in-memory keys;
parent tests additionally exercise the real authorized public binding with a
syntactically valid deliberately unusable test hash, not any actual credential.
Tests perform no remote operations. Their success is not a completed reset.
