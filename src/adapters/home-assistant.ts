import type {
  ActionRequest,
  ActionReceipt,
  CapabilityAdapter,
  CapabilityManifest
} from "../core/contracts.js";

export interface HomeAssistantConfig {
  baseUrl: string;
  token: string;
  /** Domain/action pairs allowed by local configuration. */
  allowedActions: ReadonlySet<string>;
  fetchImpl?: typeof fetch;
}

/**
 * Minimal Home Assistant adapter. Keep the token server-side, scope it to a
 * dedicated service account where possible, and never expose it to the model
 * or mobile client. The adapter intentionally requires an allowlisted action.
 */
export class HomeAssistantAdapter implements CapabilityAdapter {
  readonly manifest: CapabilityManifest;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: HomeAssistantConfig) {
    const url = new URL(config.baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("Home Assistant must use HTTPS except on loopback.");
    }
    if (!config.token.trim()) throw new Error("Home Assistant token is required.");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.manifest = {
      id: "home-assistant",
      version: "0.1.0",
      description: "Allowlisted Home Assistant REST control",
      actions: ["light.turn_on", "light.turn_off", "media_player.volume_set"],
      riskByAction: {
        "light.turn_on": "REVERSIBLE",
        "light.turn_off": "REVERSIBLE",
        "media_player.volume_set": "REVERSIBLE"
      },
      requiredScopes: ["home:control"],
      lifecycle: "DEPLOYED",
      sourceHash: "IMPLEMENTATION_HASH_REQUIRED"
    };
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(new URL("/api/", this.config.baseUrl), {
        headers: this.headers(),
        signal: AbortSignal.timeout(4000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getState(target: string): Promise<unknown> {
    const response = await this.fetchImpl(
      new URL(`/api/states/${encodeURIComponent(target)}`, this.config.baseUrl),
      { headers: this.headers(), signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok) throw new Error(`Home Assistant state read failed: HTTP ${response.status}`);
    return response.json();
  }

  async execute(request: ActionRequest): Promise<ActionReceipt> {
    const [domain, service] = request.action.split(".");
    if (!domain || !service || !this.config.allowedActions.has(request.action)) {
      throw new Error("Home Assistant action is not allowlisted.");
    }
    const response = await this.fetchImpl(
      new URL(`/api/services/${domain}/${service}`, this.config.baseUrl),
      {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: request.target, ...request.parameters }),
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!response.ok) throw new Error(`Home Assistant action failed: HTTP ${response.status}`);
    const body: unknown = await response.json();
    return {
      accepted: true,
      operationId: request.requestId,
      message: "Home Assistant accepted the service call; post-action verification is still required.",
      observedState: body,
      evidenceState: "UNKNOWN"
    };
  }

  async verify(request: ActionRequest, _receipt: ActionReceipt) {
    const observed = await this.getState(request.target) as { state?: string; attributes?: Record<string, unknown> };
    const expected = request.action === "light.turn_on"
      ? "on"
      : request.action === "light.turn_off"
        ? "off"
        : undefined;
    const verified = expected ? observed.state === expected : typeof observed.state === "string";
    return {
      verified,
      observedState: observed,
      evidenceRef: `ha-state:${request.target}:${Date.now()}`,
      reason: verified ? undefined : "Observed state did not match the expected result."
    };
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: "application/json"
    };
  }
}
