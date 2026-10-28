# A.S.H. / NEXUS — Ω∞-04 Auth Boundary Remediation

## Status

- Change: proposed on branch `audit/omega-04-auth-boundary`
- Scope: server-side authorization policy only
- Runtime verification: **NOT RUN**
- TypeScript build: **NOT RUN**
- Production certification: **NOT ESTABLISHED**
- Execution boundary: `SANDBOX_ONLY`
- Policy posture: `ZERO_IMPLICIT_TRUST`, `DEFAULT_POLICY=DENY`

## Change made

`src/core/policy.ts` now requires a server-provided `resolveAuthenticatedActorId(request)` callback. Authorization fails closed if the callback throws, returns no principal, or returns a principal different from `request.actorId`. Scope resolution uses the resolved authenticated principal, not the untrusted actor field.

This is an intentionally breaking configuration change: every `FailClosedPolicy` constructor must supply an identity resolver backed by trusted server authentication context. Do not implement this callback by simply returning `request.actorId`; that would defeat the control.

## Required verification before merge

1. Authenticated actor matches request actor → continue to remaining policy checks.
2. Request actor spoofed to another principal → deny.
3. Resolver returns null → deny.
4. Resolver throws / auth context unavailable → deny.
5. Scope resolver is called with the authenticated principal only.
6. Missing emergency-stop reader → deny.
7. Emergency stop active or reader throws → deny.
8. Missing capability allowlist entry → deny.
9. Missing/invalid source digest, undeclared action, target, or risk → deny.
10. High-impact action without a valid approval token → deny.
11. Approval token for another actor/action/target/request, expired or replayed → deny (the token validator must enforce these bindings).
12. Any denied request causes zero execution side effects.

## Integration requirements

- Resolve the principal from trusted server middleware/session/token verification, not from client JSON.
- Bind request identity and approval to actor, capability, action, target, expiry, and single-use semantics.
- Keep the capability allowlist and granted scopes server-controlled.
- Add automated unit and route-level tests, then run `npm run build` and record exact output.
- Do not promote the capability lifecycle to `REAL_VERIFIED` merely because a digest exists; that status requires independent evidence under the project's governance rules.

## Decision

**Candidate remediation only.** The patch tightens the policy boundary, but no test, build, sandbox isolation, end-to-end workflow, or production behavior is certified by this document.
