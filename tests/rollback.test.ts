import { describe, expect, it, vi } from "vitest";
import { CapabilityRollbackService } from "../src/core/rollback.js";
import type { DeploymentController, ReleaseDescriptor, ReleaseStore } from "../src/core/rollback.js";

const previous: ReleaseDescriptor = {
  capabilityId: "demo",
  version: "1.0.0",
  artifactSha256: "c".repeat(64),
  deployedAt: "2026-01-01T00:00:00.000Z"
};

function setup(healthy = true, release: ReleaseDescriptor | undefined = previous) {
  const releases: ReleaseStore = {
    getCurrent: vi.fn().mockResolvedValue(undefined),
    getPreviousKnownGood: vi.fn().mockResolvedValue(release)
  };
  const deployment: DeploymentController = {
    disableCapability: vi.fn().mockResolvedValue(undefined),
    deploySignedArtifact: vi.fn().mockResolvedValue({ deploymentId: "deploy-1" }),
    verifyHealth: vi.fn().mockResolvedValue(healthy)
  };
  return { service: new CapabilityRollbackService(releases, deployment), releases, deployment };
}

describe("CapabilityRollbackService", () => {
  it("disables then restores a known-good signed release", async () => {
    const { service, deployment } = setup();
    await expect(service.rollback("demo", "failed health check")).resolves.toMatchObject({
      rolledBack: true, previousVersion: "1.0.0"
    });
    expect(deployment.disableCapability).toHaveBeenCalledTimes(1);
    expect(deployment.deploySignedArtifact).toHaveBeenCalledWith(previous);
    expect(deployment.verifyHealth).toHaveBeenCalledWith("demo", "deploy-1");
  });

  it("keeps capability disabled if rollback health check fails", async () => {
    const { service, deployment } = setup(false);
    await expect(service.rollback("demo", "release regression")).resolves.toMatchObject({
      rolledBack: false
    });
    expect(deployment.disableCapability).toHaveBeenCalledTimes(2);
  });

  it("leaves capability disabled if no previous release exists", async () => {
    const { service, deployment } = setup(true, undefined);
    await expect(service.rollback("demo", "bad release")).resolves.toMatchObject({
      rolledBack: false
    });
    expect(deployment.deploySignedArtifact).not.toHaveBeenCalled();
  });
});
