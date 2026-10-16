# A.S.H. CORE — Security hardening backlog and acceptance gates

**Status: implementation in progress; not a security certification.**

## Controls added in this change

- Authorization scopes are resolved from a server-side grant provider; request JSON cannot self-assign permissions.
- Unknown, disabled, non-deployed, malformed-digest, or undeclared-risk capabilities fail closed.
- Sensitive/high-impact actions require an approval validator that must bind approval to the authenticated actor, action, target, request, expiry and single use.
- Home Assistant hostnames and entity IDs are allowlisted by trusted deployment configuration.
- The adapter refuses non-HTTPS remote endpoints, URLs with embedded credentials/query/fragments, and redirects.
- Home Assistant service actions and parameters are allowlisted; entity_id cannot be overwritten by arbitrary parameters.
- Light and volume parameters have explicit numeric bounds; volume is independently verified against observed state.
- Newly constructed Home Assistant adapters default to VALIDATED, not DEPLOYED.

## Still required before production

1. Authentication middleware must create the trusted actor identity; never accept actorId from untrusted request JSON.
2. Implement server-side grants in a durable authorization store and tenant isolation.
3. Implement approval issuance, short expiry, one-time consumption, replay prevention, actor/action/target binding and revocation.
4. Implement an append-only audit store with restricted writers, integrity protection, retention and redaction. Never log bearer tokens, approval tokens or raw secrets.
5. Put all secrets in a managed secret store; rotate/revoke credentials; use least-privilege service accounts; never expose secrets to model context, mobile clients or build workers.
6. Add API rate limits, request size limits, timeouts, idempotency, cancellation, concurrency limits and abuse monitoring.
7. Add SSRF protections at the network layer: egress allowlist, private-address rules, DNS rebinding defenses, no user-controlled connector URLs.
8. Isolate generated-code builds in ephemeral workers with no production credentials, restricted egress, resource quotas and immutable base images.
9. Require reviewed patches, dependency/SBOM scanning, secret scanning, artifact signing, staging smoke tests and rollback drills before deployment.
10. Add global kill switch, per-capability suspension and device revocation.
11. Add backup/restore, incident response, vulnerability reporting, security review and privacy/data-residency review.
12. Execute tests in CI and retain run IDs, logs and artifact hashes before claiming acceptance.

## Rollback design

- Application releases: immutable artifact digest, previous known-good version, staged rollout, health check and automatic rollback on failed smoke tests.
- Capability releases: disable the capability first, revoke connector credentials if compromise is suspected, restore previous signed adapter version and verify read-only state before re-enabling.
- Data migrations: backward-compatible expand/migrate/contract changes and tested restore; do not assume a database rollback is always lossless.
- Physical actions: no generic rollback promise. Each adapter must define compensating action only when safe and meaningful; otherwise stop, report actual state and request human intervention.

## Release gates

- Unit and integration tests pass on CI.
- Every capability has a real SHA-256 artifact digest and explicit lifecycle.
- Negative authorization tests pass for missing scopes, spoofed identity, invalid approval, replay, expiry, wrong target, disabled capability and suspended adapter.
- Secret scan and dependency audit show no unresolved critical finding.
- Restore and rollback drills pass.
- Independent real-device verification is recorded for any claim of physical execution.
