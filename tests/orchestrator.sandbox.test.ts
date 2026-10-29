import { describe, expect, it, vi } from "vitest";
import { ActionOrchestrator } from "../src/core/orchestrator.js";
import { CapabilityRegistry } from "../src/core/registry.js";
import type {
  ActionRequest,
  AuditSink,
  CapabilityAdapter,
  CapabilityManifest
} from "../src/core/contracts.js";

const manifest: CapabilityManifest = {
  id: "test-capability",
  version: "1.0.0",
  description: "Test-only adapter",
  actions: ["change_state"],
  riskByAction: { change_state: "REVERSIBLE" },
  requiredScopes: [],
  lifecycle: "DEPLOYED",
  sourceHash: "c".repeat(64)
};

const request: ActionRequest = {
  requestId: "sandbox-req-1",
  actorId: "test-actor",
  capabilityId: manifest.id,
  action: "change_state",
  target: "test-target",
  parameters: {}
};

function setup() {
  const execute = vi.fn().mockResolvedValue({
    accepted: true,
    operationId: "op-1",
    message: "executed",
    evidenceState: "OBSERVED"
  });
  const getState = vi.fn().mockResolvedValue({ state: "before" });
  const adapter: CapabilityAdapter = {
    manifest,
    checkAvailability: vi.fn().mockResolvedValue(true),
    getState,
    execute,
    verify: vi.fn().mockResolvedValue({ verified: true, observedState: { state: "after" } })
  };
  const registry = new CapabilityRegistry();
  registry.register(adapter);
  const policy = { authorize: vi.fn().mockResolvedValue({ allowed: true, reason: "test policy" }) };
  const audit: AuditSink = { append: vi.fn().mockResolvedValue(undefined) };
  return {
    execute,
    getState,
    audit,
    orchestrator: new ActionOrchestrator(registry, policy, audit)
  };
}

describe("ActionOrchestrator SANDBOX_ONLY invariant", () => {
  it("denies real-world execution by default and never calls adapter methods", async () => {
    const { orchestrator, execute, getState, audit } = setup();
    await expect(orchestrator.run(request)).rejects.toThrow(/SANDBOX_ONLY/);
    expect(execute).not.toHaveBeenCalled();
    expect(getState).not.toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({
      phase: "DENIED",
      details: expect.objectContaining({ executionBoundary: "SANDBOX_ONLY" })
    }));
  });

  it("returns a simulated receipt for dry-run without invoking the adapter", async () => {
    const { orchestrator, execute, getState } = setup();
    await expect(orchestrator.run({ ...request, dryRun: true })).resolves.toMatchObject({
      accepted: false,
      evidenceState: "SIMULATED",
      message: expect.stringContaining("no real-world action")
    });
    expect(execute).not.toHaveBeenCalled();
    expect(getState).not.toHaveBeenCalled();
  });
});
