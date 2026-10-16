export interface BuildIsolationPolicy {
  /** Must be a fresh disposable worker/container/VM for each job. */
  ephemeral: true;
  /** Build jobs must never receive production secrets or long-lived credentials. */
  productionSecretsAvailable: false;
  /** Explicit outbound network destinations; empty means no network. */
  allowedEgressHosts: readonly string[];
  timeoutMs: number;
  memoryLimitMb: number;
  cpuLimit: number;
  maxOutputBytes: number;
}

export interface IsolatedBuildRequest {
  jobId: string;
  sourceArtifactRef: string;
  expectedSourceSha256: string;
  command: readonly string[];
  policy: BuildIsolationPolicy;
}

export interface IsolatedBuildResult {
  jobId: string;
  completed: boolean;
  exitCode?: number;
  timedOut: boolean;
  sourceSha256: string;
  outputSha256?: string;
  logRef?: string;
  violations: readonly string[];
}

/** Provider adapter must enforce isolation at the OS/container/VM boundary. */
export interface BuildSandboxProvider {
  run(request: IsolatedBuildRequest): Promise<IsolatedBuildResult>;
}

export function validateBuildIsolationPolicy(policy: BuildIsolationPolicy): void {
  if (policy.ephemeral !== true || policy.productionSecretsAvailable !== false) {
    throw new Error("Build jobs must be ephemeral and must not have production secrets.");
  }
  if (!Number.isInteger(policy.timeoutMs) || policy.timeoutMs < 1_000 || policy.timeoutMs > 30 * 60_000) {
    throw new Error("Build timeout must be between 1 second and 30 minutes.");
  }
  if (!Number.isInteger(policy.memoryLimitMb) || policy.memoryLimitMb < 128 || policy.memoryLimitMb > 32_768) {
    throw new Error("Build memory limit must be between 128 MB and 32 GB.");
  }
  if (!Number.isFinite(policy.cpuLimit) || policy.cpuLimit <= 0 || policy.cpuLimit > 16) {
    throw new Error("Build CPU limit must be greater than 0 and at most 16 CPUs.");
  }
  if (!Number.isInteger(policy.maxOutputBytes) || policy.maxOutputBytes < 1_024 || policy.maxOutputBytes > 50_000_000) {
    throw new Error("Build output limit is outside the supported range.");
  }
  for (const host of policy.allowedEgressHosts) {
    if (!host.trim() || host.includes("://") || host.includes("/") || host.includes("@")) {
      throw new Error("Egress entries must be hostnames, not URLs or credentials.");
    }
  }
}
