import type {
  ActionRequest,
  ActionReceipt,
  AuditEvent,
  AuditSink,
  AuthorizationPolicy
} from "./contracts.js";
import { CapabilityRegistry } from "./registry.js";

export class ActionOrchestrator {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly policy: AuthorizationPolicy,
    private readonly audit: AuditSink
  ) {}

  async run(request: ActionRequest): Promise<ActionReceipt> {
    const adapter = this.registry.get(request.capabilityId);
    if (!adapter) {
      await this.write(request, "DENIED", { reason: "Unknown capability." });
      throw new Error("Unknown capability; execution denied.");
    }

    await this.write(request, "REQUESTED", {
      target: request.target,
      action: request.action,
      dryRun: request.dryRun === true
    });

    const decision = await this.policy.authorize(request, adapter.manifest);
    if (!decision.allowed) {
      await this.write(request, "DENIED", { reason: decision.reason });
      throw new Error(`Execution denied: ${decision.reason}`);
    }

    if (request.dryRun === true) {
      return {
        accepted: false,
        operationId: request.requestId,
        message: "Dry run only; no real-world action was executed.",
        evidenceState: "SIMULATED"
      };
    }

    if (!(await adapter.checkAvailability())) {
      await this.write(request, "FAILED", { reason: "Adapter unavailable." });
      throw new Error("Adapter unavailable; no action executed.");
    }

    try {
      const before = await adapter.getState(request.target);
      const receipt = await adapter.execute(request);
      await this.write(request, "EXECUTED", {
        operationId: receipt.operationId,
        accepted: receipt.accepted,
        before
      });

      if (!receipt.accepted) {
        await this.write(request, "FAILED", { reason: receipt.message });
        return { ...receipt, evidenceState: "UNKNOWN" };
      }

      const verification = await adapter.verify(request, receipt);
      if (!verification.verified) {
        await this.write(request, "FAILED", {
          operationId: receipt.operationId,
          reason: verification.reason ?? "Post-action state not verified."
        });
        return {
          ...receipt,
          evidenceState: "UNKNOWN",
          message: "Command accepted, but the real-world result was not verified."
        };
      }

      await this.write(request, "VERIFIED", {
        operationId: receipt.operationId,
        observedState: verification.observedState,
        evidenceRef: verification.evidenceRef
      });
      return {
        ...receipt,
        observedState: verification.observedState,
        evidenceRef: verification.evidenceRef,
        evidenceState: "OBSERVED",
        message: "Action result independently verified."
      };
    } catch (error) {
      await this.write(request, "FAILED", {
        reason: error instanceof Error ? error.message : "Unknown execution error."
      });
      throw error;
    }
  }

  private async write(
    request: ActionRequest,
    phase: AuditEvent["phase"],
    details: Record<string, unknown>
  ): Promise<void> {
    await this.audit.append({
      timestamp: new Date().toISOString(),
      requestId: request.requestId,
      actorId: request.actorId,
      capabilityId: request.capabilityId,
      action: request.action,
      target: request.target,
      phase,
      details
    });
  }
}
