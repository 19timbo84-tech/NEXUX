import { describe, expect, it, vi } from "vitest";
import { FailClosedPolicy } from "../src/core/policy.js";
import type { ActionRequest, CapabilityManifest } from "../src/core/contracts.js";

const manifest: CapabilityManifest = {
  id: "demo-light",
  version: "1.0.0",
  description: "Test light",
  actions: ["turn_on"],
  riskByAction: { turn_on: "REVERSIBLE" },
  requiredScopes: ["light:control"],
  lifecycle: "DEPLOYED",
  sourceHash: "a".repeat(64)
};

const request: ActionRequest = {
  requestId: "req-1",
  actorId: "user-1",
  capabilityId: "demo-light",
  action: "turn_on",
  target: "light.living_room",
  parameters: {}
};

function policy(overrides: Partial<ConstructorParameters<typeof FailClosedPolicy>[0]> = {}) {
  return new FailClosedPolicy({
    approvalRequiredAt: "SENSITIVE",
    enabledCapabilities: new Set(["demo-light"]),
    resolveGrantedScopes: vi.fn().mockResolvedValue(new Set(["light:control"])),
    validateApprovalToken: vi.fn().mockResolvedValue(true),
    isEmergencyStopActive: vi.fn().mockResolvedValue(false),
    ...overrides
  });
}

describe("FailClosedPolicy", () => {
  it("allows an enabled, declared action with server-granted scope", async () => {
    await expect(policy().authorize(request, manifest)).resolves.toMatchObject({ allowed: true });
  });

  it("denies when the emergency stop is active", async () => {
    await expect(policy({ isEmergencyStopActive: vi.fn().mockResolvedValue(true) }).authorize(request, manifest))
      .resolves.toMatchObject({ allowed: false, reason: expect.stringContaining("Emergency stop") });
  });

  it("fails closed when emergency-stop state is unavailable", async () => {
    await expect(policy({ isEmergencyStopActive: vi.fn().mockRejectedValue(new Error("store unavailable")) })
      .authorize(request, manifest)).resolves.toMatchObject({ allowed: false });
    await expect(policy({ isEmergencyStopActive: undefined } as never).authorize(request, manifest))
      .resolves.toMatchObject({ allowed: false });
  });

  it("denies capability identity mismatch", async () => {
    await expect(policy().authorize({ ...request, capabilityId: "other-capability" }, manifest))
      .resolves.toMatchObject({ allowed: false });
  });

  it("denies unknown actions", async () => {
    await expect(policy().authorize({ ...request, action: "delete_everything" }, manifest))
      .resolves.toMatchObject({ allowed: false });
  });

  it("denies missing server-granted scopes", async () => {
    const resolveGrantedScopes = vi.fn().mockResolvedValue(new Set<string>());
    await expect(policy({ resolveGrantedScopes }).authorize(request, manifest))
      .resolves.toMatchObject({ allowed: false });
  });

  it("does not accept client-provided scopes as authorization", async () => {
    const resolveGrantedScopes = vi.fn().mockResolvedValue(new Set<string>());
    await policy({ resolveGrantedScopes }).authorize(request, manifest);
    expect(resolveGrantedScopes).toHaveBeenCalledWith("user-1");
  });

  it("denies a capability that is not enabled", async () => {
    await expect(policy({ enabledCapabilities: new Set() }).authorize(request, manifest))
      .resolves.toMatchObject({ allowed: false });
  });

  it("denies a non-deployed capability", async () => {
    await expect(policy().authorize(request, { ...manifest, lifecycle: "VALIDATED" }))
      .resolves.toMatchObject({ allowed: false });
  });

  it("denies a placeholder or malformed source digest", async () => {
    await expect(policy().authorize(request, { ...manifest, sourceHash: "IMPLEMENTATION_HASH_REQUIRED" }))
      .resolves.toMatchObject({ allowed: false });
  });

  it("requires a valid explicit approval for sensitive actions", async () => {
    const sensitive = { ...manifest, riskByAction: { turn_on: "SENSITIVE" as const } };
    const validateApprovalToken = vi.fn().mockResolvedValue(false);
    await expect(policy({ validateApprovalToken }).authorize(request, sensitive))
      .resolves.toMatchObject({ allowed: false });
    await expect(policy({ validateApprovalToken }).authorize(
      { ...request, approvalToken: "bad" }, sensitive
    )).resolves.toMatchObject({ allowed: false });
    await expect(policy().authorize(
      { ...request, approvalToken: "valid-reference" }, sensitive
    )).resolves.toMatchObject({ allowed: true });
  });

  it("fails closed when the permissions store is unavailable", async () => {
    await expect(policy({
      resolveGrantedScopes: vi.fn().mockRejectedValue(new Error("database unavailable"))
    }).authorize(request, manifest)).resolves.toMatchObject({ allowed: false });
  });

  it("fails closed when approval validation errors", async () => {
    const sensitive = { ...manifest, riskByAction: { turn_on: "SENSITIVE" as const } };
    await expect(policy({
      validateApprovalToken: vi.fn().mockRejectedValue(new Error("approval service unavailable"))
    }).authorize({ ...request, approvalToken: "token" }, sensitive))
      .resolves.toMatchObject({ allowed: false });
  });
});
