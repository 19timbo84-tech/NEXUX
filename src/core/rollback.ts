export interface ReleaseDescriptor {
  capabilityId: string;
  version: string;
  artifactSha256: string;
  deployedAt: string;
}

export interface ReleaseStore {
  getCurrent(capabilityId: string): Promise<ReleaseDescriptor | undefined>;
  getPreviousKnownGood(capabilityId: string): Promise<ReleaseDescriptor | undefined>;
}

/**
 * The deployment implementation must verify signatures/digests and perform
 * staged rollout/health checks. This interface deliberately does not pretend
 * to roll back physical-world actions.
 */
export interface DeploymentController {
  disableCapability(capabilityId: string, reason: string): Promise<void>;
  deploySignedArtifact(release: ReleaseDescriptor): Promise<{ deploymentId: string }>;
  verifyHealth(capabilityId: string, deploymentId: string): Promise<boolean>;
}

export interface RollbackResult {
  rolledBack: boolean;
  capabilityId: string;
  previousVersion?: string;
  deploymentId?: string;
  reason: string;
}

export class CapabilityRollbackService {
  constructor(
    private readonly releases: ReleaseStore,
    private readonly deployment: DeploymentController
  ) {}

  async rollback(capabilityId: string, reason: string): Promise<RollbackResult> {
    if (!capabilityId.trim() || !reason.trim()) {
      throw new Error("Capability and rollback reason are required.");
    }
    await this.deployment.disableCapability(capabilityId, reason);
    const previous = await this.releases.getPreviousKnownGood(capabilityId);
    if (!previous) {
      return {
        rolledBack: false,
        capabilityId,
        reason: "Capability disabled; no previous known-good release is available."
      };
    }
    if (!/^[a-f0-9]{64}$/i.test(previous.artifactSha256)) {
      return {
        rolledBack: false,
        capabilityId,
        reason: "Capability disabled; previous release has no valid SHA-256 digest."
      };
    }
    const { deploymentId } = await this.deployment.deploySignedArtifact(previous);
    const healthy = await this.deployment.verifyHealth(capabilityId, deploymentId);
    if (!healthy) {
      await this.deployment.disableCapability(capabilityId, "Rollback health check failed.");
      return {
        rolledBack: false,
        capabilityId,
        previousVersion: previous.version,
        deploymentId,
        reason: "Rollback deployed but health verification failed; capability remains disabled."
      };
    }
    return {
      rolledBack: true,
      capabilityId,
      previousVersion: previous.version,
      deploymentId,
      reason: "Previous known-good release deployed and health-checked."
    };
  }
}
