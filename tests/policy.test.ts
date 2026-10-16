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
  sourceHash: "test-hash"
};

const request: ActionRequest = {
  requestId: "req-1",
  actorId: "user-1",
  capabilityId: "demo-light",
  action: "turn_on",
  target: "light.living_room",
  parameters: {},
  scopes: ["light:control"]
};

describe("FailClosedPolicy", () => {
  it("allows an enabled, declared, scoped reversible action", async () => {
    const policy = new FailClosedPolicy({
      approvalRequiredAt: "SENSITIVE",
      enabledCapabilities: new Set(["demo-light"]),
      validateApprovalToken: vi.fn().mockResolvedValue(true)
    });
    await expect(policy.authorize(request, manifest)).resolves.toMatchObject({ allowed: true });
  });

  it("denies unknown actions", async () => {
    const policy = new FailClosedPolicy({
      approvalRequiredAt: "SENSITIVE",
      enabledCapabilities: new Set(["demo-light"]),
      validateApprovalToken: vi.fn()
    });
    await expect(policy.authorize({ ...request, action: "delete_everything" }, manifest))
      .resolves.toMatchObject({ allowed: false });
  });

  it("denies missing scopes", async () => {
    const policy = new FailClosedPolicy({
      approvalRequiredAt: "SENSITIVE",
      enabledCapabilities: new Set(["demo-light"]),
      validateApprovalToken: vi.fn()
    });
    await expect(policy.authorize({ ...request, scopes: [] }, manifest))
      .resolves.toMatchObject({ allowed: false });
  });

  it("denies a capability that is not enabled", async () => {
    const policy = new FailClosedPolicy({
      approvalRequiredAt: "SENSITIVE",
      enabledCapabilities: new Set(),
      validateApprovalToken: vi.fn()
    });
    await expect(policy.authorize(request, manifest)).resolves.toMatchObject({ allowed: false });
  });

  it("requires explicit approval for sensitive actions", async () => {
    const policy = new FailClosedPolicy({
      approvalRequiredAt: "SENSITIVE",
      enabledCapabilities: new Set(["demo-light"]),
      validateApprovalToken: vi.fn().mockResolvedValue(false)
    });
    const sensitive = {
      ...manifest,
      riskByAction: { turn_on: "SENSITIVE" as const }
    };
    await expect(policy.authorize(request, sensitive)).resolves.toMatchObject({ allowed: false });
    await expect(policy.authorize({ ...request, approvalToken: "bad" }, sensitive))
      .resolves.toMatchObject({ allowed: false });
  });
});
