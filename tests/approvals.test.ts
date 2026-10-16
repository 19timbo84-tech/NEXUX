import { describe, expect, it } from "vitest";
import { InMemoryApprovalStore, OneTimeApprovalService } from "../src/core/approvals.js";
import type { ActionRequest } from "../src/core/contracts.js";

const request: ActionRequest = {
  requestId: "request-42",
  actorId: "actor-7",
  capabilityId: "home-assistant",
  action: "light.turn_on",
  target: "light.office",
  parameters: {}
};

describe("OneTimeApprovalService", () => {
  it("accepts a token only for its exact request binding", async () => {
    const service = new OneTimeApprovalService(new InMemoryApprovalStore(), () => 10_000);
    const token = await service.issue({
      actorId: request.actorId,
      requestId: request.requestId,
      capabilityId: request.capabilityId,
      action: request.action,
      target: request.target
    });
    expect(await service.validate(token, request)).toBe(true);
  });

  it("consumes a token once and rejects replay", async () => {
    const service = new OneTimeApprovalService(new InMemoryApprovalStore(), () => 10_000);
    const token = await service.issue({
      actorId: request.actorId,
      requestId: request.requestId,
      capabilityId: request.capabilityId,
      action: request.action,
      target: request.target
    });
    expect(await service.validate(token, request)).toBe(true);
    expect(await service.validate(token, request)).toBe(false);
  });

  it("rejects use for a different target", async () => {
    const service = new OneTimeApprovalService(new InMemoryApprovalStore(), () => 10_000);
    const token = await service.issue({
      actorId: request.actorId,
      requestId: request.requestId,
      capabilityId: request.capabilityId,
      action: request.action,
      target: request.target
    });
    expect(await service.validate(token, { ...request, target: "light.kitchen" })).toBe(false);
  });

  it("rejects expired tokens", async () => {
    let now = 10_000;
    const service = new OneTimeApprovalService(new InMemoryApprovalStore(), () => now);
    const token = await service.issue({
      actorId: request.actorId,
      requestId: request.requestId,
      capabilityId: request.capabilityId,
      action: request.action,
      target: request.target
    }, 1_000);
    now += 1_001;
    expect(await service.validate(token, request)).toBe(false);
  });

  it("rejects unreasonable TTLs", async () => {
    const service = new OneTimeApprovalService(new InMemoryApprovalStore());
    await expect(service.issue({
      actorId: request.actorId,
      requestId: request.requestId,
      capabilityId: request.capabilityId,
      action: request.action,
      target: request.target
    }, 600_000)).rejects.toThrow(/TTL/);
  });
});
