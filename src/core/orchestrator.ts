import { createHash } from "node:crypto";
import type {
  ActionRequest,
  ActionReceipt,
  AuditEvent,
  AuditSink,
  AuthorizationPolicy
} from "./contracts.js";
import { CapabilityRegistry } from "./registry.js";

function fingerprint(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return createHash("sha256").update(serialized ?? "undefined").digest("hex");
  } catch {
    return "UNHASHABLE";
  }
}

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

    // Sovereign invariant: this repository has no independently enforced sandbox
    // provider boundary yet. Never invoke an adapter that may affect the real world.
    // Keep the system fail-closed until a separately reviewed sandbox adapter exists.
    if (request.dryRun !== true) {
      const reason = "SANDBOX_ONLY: real-world execution is disabled until an independently enforced sandbox adapter is registered.";
      await this.write(request, "DENIED", { reason, executionBoundary: "SANDBOX_ONLY" });
      throw new Error(reason);
    }

    return {
      accepted: false,
      operationId: request.requestId,
      message: "Sandbox dry-run only; no adapter was executed and no real-world action was performed.",
      evidenceState: "SIMULATED"
    };
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
