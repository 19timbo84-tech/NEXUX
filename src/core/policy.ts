import type {
  ActionRequest,
  AuthorizationPolicy,
  CapabilityManifest,
  RiskLevel
} from "./contracts.js";

export interface PolicyConfig {
  /** Actions above this level always require an explicit approval token. */
  approvalRequiredAt: RiskLevel;
  /** Allow only explicitly enabled capability IDs. */
  enabledCapabilities: ReadonlySet<string>;
  /** Tokens are opaque server-side references; never put secrets in the model prompt. */
  validateApprovalToken: (token: string, request: ActionRequest) => Promise<boolean>;
}

const rank: Record<RiskLevel, number> = {
  READ: 0,
  REVERSIBLE: 1,
  SENSITIVE: 2,
  HIGH_IMPACT: 3
};

export class FailClosedPolicy implements AuthorizationPolicy {
  constructor(private readonly config: PolicyConfig) {}

  async authorize(
    request: ActionRequest,
    manifest: CapabilityManifest
  ): Promise<{ allowed: boolean; reason: string }> {
    if (!request.actorId.trim() || !request.requestId.trim()) {
      return { allowed: false, reason: "Missing actor or request identity." };
    }
    if (!this.config.enabledCapabilities.has(manifest.id)) {
      return { allowed: false, reason: "Capability is not enabled by policy." };
    }
    if (manifest.lifecycle !== "DEPLOYED" && manifest.lifecycle !== "REAL_VERIFIED") {
      return { allowed: false, reason: `Capability lifecycle is ${manifest.lifecycle}; execution is blocked.` };
    }
    if (!manifest.actions.includes(request.action)) {
      return { allowed: false, reason: "Action is not declared by the capability manifest." };
    }
    if (!request.target.trim()) {
      return { allowed: false, reason: "Target must be explicit." };
    }
    const granted = new Set(request.scopes);
    const missing = manifest.requiredScopes.filter(scope => !granted.has(scope));
    if (missing.length > 0) {
      return { allowed: false, reason: `Missing required scopes: ${missing.join(", ")}.` };
    }

    const risk = manifest.riskByAction[request.action];
    if (!risk) {
      return { allowed: false, reason: "Action risk is undeclared; refusing by default." };
    }
    if (rank[risk] >= rank[this.config.approvalRequiredAt]) {
      if (!request.approvalToken) {
        return { allowed: false, reason: "Explicit approval is required for this action." };
      }
      if (!(await this.config.validateApprovalToken(request.approvalToken, request))) {
        return { allowed: false, reason: "Approval token is invalid, expired, or out of scope." };
      }
    }
    return { allowed: true, reason: "Authorization checks passed." };
  }
}
