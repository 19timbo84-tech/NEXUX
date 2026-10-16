import { describe, expect, it, vi } from "vitest";
import { HomeAssistantAdapter } from "../src/adapters/home-assistant.js";

const config = (overrides: Record<string, unknown> = {}) => ({
  baseUrl: "https://ha.example.test",
  token: "server-only-test-token",
  allowedHosts: new Set(["ha.example.test"]),
  allowedTargets: new Set(["light.office", "media_player.office"]),
  allowedActions: new Set(["light.turn_on", "light.turn_off", "media_player.volume_set"]),
  sourceHash: "b".repeat(64),
  fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: "on", attributes: {} }), {
    status: 200, headers: { "Content-Type": "application/json" }
  })),
  ...overrides
});

describe("HomeAssistantAdapter security", () => {
  it("rejects hosts outside the configured allowlist", () => {
    expect(() => new HomeAssistantAdapter(config({ baseUrl: "https://attacker.example" }) as never)
    ).toThrow(/host is not in/);
  });

  it("rejects HTTP outside loopback", () => {
    expect(() => new HomeAssistantAdapter(config({ baseUrl: "http://ha.example.test" }) as never)
    ).toThrow(/HTTPS/);
  });

  it("rejects missing or placeholder source hashes", () => {
    expect(() => new HomeAssistantAdapter(config({ sourceHash: "IMPLEMENTATION_HASH_REQUIRED" }) as never)
    ).toThrow(/SHA-256/);
  });

  it("defaults to VALIDATED rather than deployable", () => {
    const adapter = new HomeAssistantAdapter(config() as never);
    expect(adapter.manifest.lifecycle).toBe("VALIDATED");
  });

  it("rejects targets not explicitly allowlisted", async () => {
    const adapter = new HomeAssistantAdapter(config() as never);
    await expect(adapter.getState("light.bedroom")).rejects.toThrow(/target allowlist/);
  });

  it("rejects entity_id parameter injection", async () => {
    const fetchImpl = vi.fn();
    const adapter = new HomeAssistantAdapter(config({ fetchImpl, lifecycle: "DEPLOYED" }) as never);
    await expect(adapter.execute({
      requestId: "req-1", actorId: "user-1", capabilityId: "home-assistant",
      action: "light.turn_on", target: "light.office",
      parameters: { entity_id: "light.other" }
    })).rejects.toThrow(/Parameter is not allowed/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects target/action domain mismatch", async () => {
    const fetchImpl = vi.fn();
    const adapter = new HomeAssistantAdapter(config({ fetchImpl, lifecycle: "DEPLOYED" }) as never);
    await expect(adapter.execute({
      requestId: "req-2", actorId: "user-1", capabilityId: "home-assistant",
      action: "light.turn_on", target: "media_player.office", parameters: {}
    })).rejects.toThrow(/domain does not match/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("validates volume bounds", async () => {
    const fetchImpl = vi.fn();
    const adapter = new HomeAssistantAdapter(config({ fetchImpl, lifecycle: "DEPLOYED" }) as never);
    await expect(adapter.execute({
      requestId: "req-3", actorId: "user-1", capabilityId: "home-assistant",
      action: "media_player.volume_set", target: "media_player.office",
      parameters: { volume_level: 2 }
    })).rejects.toThrow(/between 0 and 1/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sets redirect:error so bearer credentials are not forwarded through redirects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: "on" }), { status: 200 }));
    const adapter = new HomeAssistantAdapter(config({ fetchImpl }) as never);
    await adapter.checkAvailability();
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  });
});
