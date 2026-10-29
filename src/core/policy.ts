import type {
  ActionRequest,
  AuthorizationPolicy,
  CapabilityManifest,
  RiskLevel
} from "./contracts.js";

export interface PolicyConfig {
  /** Actions at or above this risk require an explicit approval token. */
  approvalRequiredAt: RiskLevel;
  /** Server-controlled allowlist; never derive this from the model or request. */
  enabledCapabilities: ReadonlySet<string>;
  /**
   * Resolve the actor from trusted server authentication context (verified session/token).
   * Never implement this by returning request.actorId without authenticating it.
   */
  resolveAuthenticatedActorId: (request: ActionRequest) => Promise<string | null>;
  /** Resolve scopes from trusted server-side identity/authorization storage. */
  resolveGrantedScopes: (authenticatedActorId: string) => Promise<ReadonlySet<string>>;
  /** Must validate actor, action, target, expiry, single-use and request binding. */
  validateApprovalToken: (token: string, request: ActionRequest) => Promise<boolean>;
  /** Must read a trusted server-side kill switch; missing/unavailable means deny. */
  isEmergencyStopActive?: () => Promise<boolean>;
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
      return { allowed: false, reason: "Missing authenticated actor or request identity." };
    }

    let authenticatedActorId: string | null;
    try {
      authenticatedActorId = await this.config.resolveAuthenticatedActorId(request);
    } catch {
      return { allowed: false, reason: "Trusted authentication context could not be resolved; refusing by default." };
    }
    if (!authenticatedActorId || !authenticatedActorId.trim() || authenticatedActorId !== request.actorId) {
      return { allowed: false, reason: "Request actor does not match the trusted authenticated principal." };
    }

    if (request.capabilityId !== manifest.id) {
      return { allowed: false, reason: "Request capability does not match the registered manifest." };
    }
    try {
      if (!this.config.isEmergencyStopActive || await this.config.isEmergencyStopActive()) {
        return { allowed: false, reason: "Emergency stop is active or unavailable; execution is blocked." };
      }
    } catch {
      return { allowed: false, reason: "Emergency-stop state could not be verified; refusing by default." };
    }
    if (!this.config.enabledCapabilities.has(manifest.id)) {
      return { allowed: false, reason: "Capability is not enabled by server policy." };
    }
    if (manifest.lifecycle !== "DEPLOYED" && manifest.lifecycle !== "REAL_VERIFIED") {
      return { allowed: false, reason: `Capability lifecycle is ${manifest.lifecycle}; execution is blocked.` };
    }
    if (!manifest.sourceHash || !/^[a-f0-9]{64}$/i.test(manifest.sourceHash)) {
      return { allowed: false, reason: "Capability has no valid SHA-256 source digest; execution is blocked." };
    }
    if (!manifest.actions.includes(request.action)) {
      return { allowed: false, reason: "Action is not declared by the capability manifest." };
    }
    if (!request.target.trim()) {
      return { allowed: false, reason: "Target must be explicit." };
    }

    const risk = manifest.riskByAction[request.action];
    if (!risk || !(risk in rank)) {
      return { allowed: false, reason: "Action risk is undeclared or invalid; refusing by default." };
    }

    let grantedScopes: ReadonlySet<string>;
    try {
      grantedScopes = await this.config.resolveGrantedScopes(authenticatedActorId);
    } catch {
      return { allowed: false, reason: "Unable to resolve trusted permissions; refusing by default." };
    }
    const missing = manifest.requiredScopes.filter(scope => !grantedScopes.has(scope));
    if (missing.length > 0) {
      return { allowed: false, reason: `Missing server-granted scopes: ${missing.join(", ")}.` };
    }

    if (rank[risk] >= rank[this.config.approvalRequiredAt]) {
      if (!request.approvalToken) {
        return { allowed: false, reason: "Explicit approval is required for this action." };
      }
      try {
        if (!(await this.config.validateApprovalToken(request.approvalToken, request))) {
          return { allowed: false, reason: "Approval token is invalid, expired, already used, or out of scope." };
        }
      } catch {
        return { allowed: false, reason: "Approval validation failed; refusing by default." };
      }
    }
    return { allowed: true, reason: "Trusted identity and server-side authorization checks passed." };
  }
}
