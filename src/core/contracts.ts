export type EpistemicState =
  | "OBSERVED"
  | "DERIVED"
  | "INFERRED"
  | "SIMULATED"
  | "SYNTHETIC"
  | "UNKNOWN";

export type CapabilityLifecycle =
  | "DISCOVERED"
  | "GENERATED"
  | "SANDBOX_TESTED"
  | "VALIDATED"
  | "APPROVAL_REQUIRED"
  | "DEPLOYED"
  | "REAL_VERIFIED"
  | "SUSPENDED";

export type RiskLevel = "READ" | "REVERSIBLE" | "SENSITIVE" | "HIGH_IMPACT";

export interface CapabilityManifest {
  id: string;
  version: string;
  description: string;
  actions: readonly string[];
  riskByAction: Readonly<Record<string, RiskLevel>>;
  requiredScopes: readonly string[];
  lifecycle: CapabilityLifecycle;
  sourceHash: string;
}

export interface ActionRequest {
  requestId: string;
  actorId: string;
  capabilityId: string;
  action: string;
  target: string;
  parameters: Readonly<Record<string, unknown>>;
  scopes: readonly string[];
  approvalToken?: string;
  dryRun?: boolean;
}

export interface ActionReceipt {
  accepted: boolean;
  operationId: string;
  message: string;
  observedState?: unknown;
  evidenceState: EpistemicState;
  evidenceRef?: string;
}

export interface CapabilityAdapter {
  readonly manifest: CapabilityManifest;
  checkAvailability(): Promise<boolean>;
  getState(target: string): Promise<unknown>;
  execute(request: ActionRequest): Promise<ActionReceipt>;
  verify(request: ActionRequest, receipt: ActionReceipt): Promise<{
    verified: boolean;
    observedState?: unknown;
    evidenceRef?: string;
    reason?: string;
  }>;
}

export interface AuditEvent {
  timestamp: string;
  requestId: string;
  actorId: string;
  capabilityId: string;
  action: string;
  target: string;
  phase: "REQUESTED" | "DENIED" | "EXECUTED" | "VERIFIED" | "FAILED";
  details: Readonly<Record<string, unknown>>;
}

export interface AuditSink {
  append(event: AuditEvent): Promise<void>;
}

export interface AuthorizationPolicy {
  authorize(request: ActionRequest, manifest: CapabilityManifest): Promise<{
    allowed: boolean;
    reason: string;
  }>;
}
