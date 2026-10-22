export type RiskLevel = "READ" | "REVERSIBLE" | "SENSITIVE" | "HIGH_IMPACT";

export interface ActionRequest {
  actorId: string;
  requestId: string;
  capabilityId: string;
  action: string;
  target: string;
  approvalToken?: string;
  metadata?: Record<string, unknown>;
}

export interface CapabilityManifest {
  id: string;
  lifecycle: "DEPLOYED" | "REAL_VERIFIED" | "DRAFT" | "TEST";
  sourceHash?: string;
  actions: string[];
  requiredScopes: string[];
  riskByAction: Partial<Record<string, RiskLevel>>;
}

export interface AuthorizationPolicy {
  authorize(
    request: ActionRequest,
    manifest: CapabilityManifest
  ): Promise<{ allowed: boolean; reason: string }>;
}

export type CommandPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface CommandSignal {
  id: string;
  source: string;
  domain: string;
  priority: CommandPriority;
  timestamp: number;
  score: number;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface HeatCell {
  label: string;
  value: number;
  risk: CommandPriority;
}

export type HeatMap = Record<string, HeatCell>;

export interface SystemCommand {
  id: string;
  title: string;
  priority: CommandPriority;
  domain: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface CommandDecision {
  allowed: boolean;
  reason: string;
  priority: CommandPriority;
  heatMap: HeatMap;
  command?: SystemCommand;
}
