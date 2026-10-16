import { describe, expect, it } from "vitest";
import { validateBuildIsolationPolicy } from "../src/core/build-isolation.js";
import type { BuildIsolationPolicy } from "../src/core/build-isolation.js";

const valid: BuildIsolationPolicy = {
  ephemeral: true,
  productionSecretsAvailable: false,
  allowedEgressHosts: [],
  timeoutMs: 60_000,
  memoryLimitMb: 1024,
  cpuLimit: 2,
  maxOutputBytes: 1_000_000
};

describe("build isolation policy", () => {
  it("accepts bounded ephemeral builds without production secrets", () => {
    expect(() => validateBuildIsolationPolicy(valid)).not.toThrow();
  });

  it("rejects production secret access", () => {
    expect(() => validateBuildIsolationPolicy({
      ...valid, productionSecretsAvailable: true
    } as unknown as BuildIsolationPolicy)).toThrow(/production secrets/);
  });

  it("rejects unbounded timeout and resource limits", () => {
    expect(() => validateBuildIsolationPolicy({ ...valid, timeoutMs: 99_999_999 }))
      .toThrow(/timeout/);
    expect(() => validateBuildIsolationPolicy({ ...valid, cpuLimit: 100 }))
      .toThrow(/CPU limit/);
  });

  it("rejects URL-shaped egress entries", () => {
    expect(() => validateBuildIsolationPolicy({
      ...valid, allowedEgressHosts: ["https://attacker.example/path"]
    })).toThrow(/hostnames/);
  });
});
