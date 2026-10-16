import type {
  ActionRequest,
  ActionReceipt,
  CapabilityAdapter,
  CapabilityLifecycle,
  CapabilityManifest
} from "../core/contracts.js";

export interface HomeAssistantConfig {
  baseUrl: string;
  token: string;
  /** Exact hostname allowlist; configure from trusted server-side deployment settings. */
  allowedHosts: ReadonlySet<string>;
  /** Exact entity IDs that this adapter is permitted to touch. */
  allowedTargets: ReadonlySet<string>;
  /** Exact domain/service allowlist; do not expose this setting to model-generated input. */
  allowedActions: ReadonlySet<string>;
  /** Injected by the reviewed build/deployment pipeline. Must be a real SHA-256 digest. */
  sourceHash: string;
  /** Defaults to VALIDATED so a new adapter is blocked by policy until explicitly deployed. */
  lifecycle?: CapabilityLifecycle;
  fetchImpl?: typeof fetch;
}

const ACTIONS = [
  "light.turn_on",
  "light.turn_off",
  "media_player.volume_set"
] as const;

type HAState = { state?: string; attributes?: Record<string, unknown> };

export class HomeAssistantAdapter implements CapabilityAdapter {
  readonly manifest: CapabilityManifest;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: URL;

  constructor(private readonly config: HomeAssistantConfig) {
    this.baseUrl = new URL(config.baseUrl);
    if (this.baseUrl.protocol !== "https:" &&
        this.baseUrl.hostname !== "localhost" &&
        this.baseUrl.hostname !== "127.0.0.1") {
      throw new Error("Home Assistant must use HTTPS except on loopback.");
    }
    if (this.baseUrl.username || this.baseUrl.password || this.baseUrl.search || this.baseUrl.hash) {
      throw new Error("Home Assistant base URL must not contain credentials, query, or fragment.");
    }
    if (!config.allowedHosts.has(this.baseUrl.hostname.toLowerCase())) {
      throw new Error("Home Assistant host is not in the server-side host allowlist.");
    }
    if (!config.token.trim()) throw new Error("Home Assistant token is required.");
    if (!/^[a-f0-9]{64}$/i.test(config.sourceHash)) {
      throw new Error("A real SHA-256 source digest from the build pipeline is required.");
    }
    for (const action of config.allowedActions) {
      if (!(ACTIONS as readonly string[]).includes(action)) {
        throw new Error(`Unsupported Home Assistant action in allowlist: ${action}`);
      }
    }
    if (config.allowedTargets.size === 0) {
      throw new Error("At least one exact Home Assistant entity target must be allowlisted.");
    }
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.manifest = {
      id: "home-assistant",
      version: "0.2.0",
      description: "Scoped Home Assistant REST control",
      actions: ACTIONS.filter(action => config.allowedActions.has(action)),
      riskByAction: {
        "light.turn_on": "REVERSIBLE",
        "light.turn_off": "REVERSIBLE",
        "media_player.volume_set": "REVERSIBLE"
      },
      requiredScopes: ["home:control"],
      lifecycle: config.lifecycle ?? "VALIDATED",
      sourceHash: config.sourceHash
    };
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(this.url("/api/"), {
        headers: this.headers(),
        redirect: "error",
        signal: AbortSignal.timeout(4000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getState(target: string): Promise<unknown> {
    this.assertTarget(target);
    const response = await this.fetchImpl(
      this.url(`/api/states/${encodeURIComponent(target)}`),
      { headers: this.headers(), redirect: "error", signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok) throw new Error(`Home Assistant state read failed: HTTP ${response.status}`);
    return response.json();
  }

  async execute(request: ActionRequest): Promise<ActionReceipt> {
    this.assertTarget(request.target);
    const [domain, service] = request.action.split(".");
    if (!domain || !service || !this.config.allowedActions.has(request.action) ||
        !this.manifest.actions.includes(request.action)) {
      throw new Error("Home Assistant action is not allowlisted.");
    }
    this.validateTargetDomain(request.target, request.action);
    const serviceData = this.validateParameters(request.action, request.parameters);
    const response = await this.fetchImpl(
      this.url(`/api/services/${domain}/${service}`),
      {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: request.target, ...serviceData }),
        redirect: "error",
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!response.ok) throw new Error(`Home Assistant action failed: HTTP ${response.status}`);
    await response.json();
    return {
      accepted: true,
      operationId: request.requestId,
      message: "Home Assistant accepted the service call; independent state verification is still required.",
      evidenceState: "UNKNOWN"
    };
  }

  async verify(request: ActionRequest, _receipt: ActionReceipt) {
    const observed = await this.getState(request.target) as HAState;
    let verified = false;
    let reason = "Observed state did not match the expected result.";

    if (request.action === "light.turn_on") {
      verified = observed.state === "on";
    } else if (request.action === "light.turn_off") {
      verified = observed.state === "off";
    } else if (request.action === "media_player.volume_set") {
      const actual = observed.attributes?.volume_level;
      const desired = request.parameters.volume_level;
      verified = typeof actual === "number" && typeof desired === "number" &&
        Math.abs(actual - desired) <= 0.02;
    }
    if (verified) reason = "Observed state matches the requested state.";
    return {
      verified,
      observedState: observed,
      evidenceRef: `ha-state:${request.target}:${Date.now()}`,
      reason: verified ? undefined : reason
    };
  }

  private assertTarget(target: string): void {
    if (!this.config.allowedTargets.has(target)) {
      throw new Error("Home Assistant entity is not in the exact target allowlist.");
    }
    if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(target)) {
      throw new Error("Invalid Home Assistant entity ID.");
    }
  }

  private validateTargetDomain(target: string, action: string): void {
    const domain = action.split(".")[0];
    if (target.split(".")[0] !== domain) {
      throw new Error("Action domain does not match the allowlisted target domain.");
    }
  }

  private validateParameters(
    action: string,
    parameters: Readonly<Record<string, unknown>>
  ): Record<string, number> {
    const allowed = action === "media_player.volume_set"
      ? new Set(["volume_level"])
      : new Set(["brightness", "transition"]);
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (!allowed.has(key)) {
        throw new Error(`Parameter is not allowed for ${action}: ${key}`);
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Parameter must be a finite number: ${key}`);
      }
      if (key === "brightness" && (!Number.isInteger(value) || value < 0 || value > 255)) {
        throw new Error("brightness must be an integer from 0 to 255.");
      }
      if (key === "transition" && (value < 0 || value > 300)) {
        throw new Error("transition must be between 0 and 300 seconds.");
      }
      if (key === "volume_level" && (value < 0 || value > 1)) {
        throw new Error("volume_level must be between 0 and 1.");
      }
      result[key] = value;
    }
    if (action === "media_player.volume_set" && typeof result.volume_level !== "number") {
      throw new Error("media_player.volume_set requires volume_level.");
    }
    return result;
  }

  private url(path: string): URL {
    return new URL(path, this.baseUrl);
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: "application/json"
    };
  }
}
