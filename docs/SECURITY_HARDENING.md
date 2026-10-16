# A.S.H. CORE — Security hardening backlog and acceptance gates

**Status: implementation in progress; not a security certification.**

## Controls added in this change

- Authorization scopes are resolved from a server-side grant provider; request JSON cannot self-assign permissions.
- Unknown, disabled, non-deployed, malformed-digest, or undeclared-risk capabilities fail closed.
- Sensitive/high-impact actions require an approval validator that must bind approval to the authenticated actor, action, target, request, expiry and single use.
- A one-time approval service stores only token hashes and supports an atomic consume contract. The included in-memory store is development/test only and is not production-safe across replicas or restarts.
- Home Assistant hostnames and entity IDs are allowlisted by trusted deployment configuration.
- The adapter refuses non-HTTPS remote endpoints, URLs with embedded credentials/query/fragments, and redirects.
- Home Assistant service actions and parameters are allowlisted; entity_id cannot be overwritten by arbitrary parameters.
- Light and volume parameters have explicit numeric bounds; volume is independently verified against observed state.
- Newly constructed Home Assistant adapters default to VALIDATED, not DEPLOYED.
- Audit events fingerprint pre/post state instead of storing raw state objects, and exception messages are not copied into audit details.
- A release rollback controller disables a capability first, restores a previous known-good artifact and verifies health; if verification fails, the capability remains disabled.
- CI workflow runs typecheck, tests, build and a secret scan. It currently uses npm install because this scaffold does not yet have a committed lockfile; lockfile-based reproducible installs are a pre-production requirement.

## Still required before production

1. Authentication middleware must create the trusted actor identity; never accept actorId from untrusted request JSON.
2. Implement server-side grants in a durable authorization store and tenant isolation.
3. Replace the in-memory approval store with a durable database implementation whose consume operation is atomic. Implement issuance UI, human confirmation, revocation, audit and rate limits.
4. Implement a production SecretProvider using the selected cloud secret manager; rotate/revoke credentials; never expose secrets to model context, mobile clients, audit details or build workers.
5. Implement an append-only audit store with restricted writers, integrity protection, retention and redaction.
6. Add API rate limits, request size limits, timeouts, idempotency, cancellation, concurrency limits and abuse monitoring.
7. Add SSRF protections at the network layer: egress allowlist, private-address rules, DNS rebinding defenses, no user-controlled connector URLs.
8. Isolate generated-code builds in ephemeral workers with no production credentials, restricted egress, resource quotas and immutable base images.
9. Require reviewed patches, dependency/SBOM scanning, secret scanning, artifact signing, staging smoke tests and rollback drills before deployment.
10. Add global kill switch, per-capability suspension and device revocation.
11. Add backup/restore, incident response, vulnerability reporting, security review and privacy/data-residency review.
12. Commit a lockfile and use npm ci before production; pin third-party actions to immutable commit SHAs.
13. Execute tests in CI and retain run IDs, logs and artifact hashes before claiming acceptance.

## Rollback design

- Application releases: immutable artifact digest, previous known-good version, staged rollout, health check and automatic rollback on failed smoke tests.
- Capability releases: disable the capability first, revoke connector credentials if compromise is suspected, restore previous signed adapter version and verify read-only state before re-enabling.
- Data migrations: backward-compatible expand/migrate/contract changes and tested restore; do not assume a database rollback is always lossless.
- Physical actions: no generic rollback promise. Each adapter must define a compensating action only when safe and meaningful; otherwise stop, report actual state and request human intervention.

## Release gates

- Unit and integration tests pass on CI.
- Every capability has a real SHA-256 artifact digest that is verified against the built artifact and an explicit lifecycle.
- Negative authorization tests pass for missing scopes, spoofed identity, invalid approval, replay, expiry, wrong target, disabled capability and suspended adapter.
- Secret scan and dependency audit show no unresolved critical finding.
- Restore and rollback drills pass.
- Independent real-device verification is recorded for any claim of physical execution.
