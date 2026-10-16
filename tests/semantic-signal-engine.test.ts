import { describe, expect, it } from "vitest";
import { analyzeSemanticSignals, type ASHSemanticSignalInput } from "../src/core/signals/semantic-signal-engine.js";

const base: ASHSemanticSignalInput = {
  id: "SIG-1",
  title: "Semantic divergence: Distributed Consensus",
  source: "Federal Open Data Portal",
  concepts: ["Distributed Consensus"],
  confidencePercent: 93,
  confidenceBand: "MEDIUM"
};

describe("A.S.H. semantic signal intake", () => {
  it("keeps source claims unverified and never certifies automatically", () => {
    const report = analyzeSemanticSignals([base]);
    expect(report.mode).toBe("SANDBOX_ONLY");
    expect(report.signals[0]?.status).toBe("SOURCE_UNVERIFIED");
    expect(report.signals[0]?.evidenceState).toBe("UNKNOWN");
    expect(report.certification).toBe("NOT_CERTIFIED");
  });

  it("flags exact duplicate candidates without claiming factual duplication", () => {
    const report = analyzeSemanticSignals([
      base,
      { ...base, id: "SIG-2" }
    ]);
    expect(report.exactDuplicateCandidates).toBe(1);
    expect(report.signals[1]).toMatchObject({
      status: "DUPLICATE_CANDIDATE",
      duplicateOf: "SIG-1"
    });
  });

  it("clusters repeated concepts without merging distinct signal records", () => {
    const report = analyzeSemanticSignals([
      base,
      { ...base, id: "SIG-2", title: "A different reported divergence" }
    ]);
    expect(report.conceptClusters).toContainEqual({
      concept: "distributed consensus",
      signalIds: ["SIG-1", "SIG-2"]
    });
    expect(report.signals).toHaveLength(2);
  });

  it("flags a score/band inconsistency without silently rewriting the input", () => {
    const signal = { ...base, confidencePercent: 98, confidenceBand: "MEDIUM" as const };
    const report = analyzeSemanticSignals([signal]);
    expect(report.signals[0]?.confidenceBand).toBe("MEDIUM");
    expect(report.signals[0]?.issues).toContain("CONFIDENCE_BAND_INCONSISTENT_WITH_LOCAL_RULE");
  });

  it("flags invalid scores and malformed source URIs", () => {
    const report = analyzeSemanticSignals([{
      ...base,
      confidencePercent: 120,
      sourceUri: "not a uri"
    }]);
    expect(report.signals[0]?.issues).toContain("CONFIDENCE_OUT_OF_RANGE");
    expect(report.signals[0]?.issues).toContain("SOURCE_URI_INVALID");
  });

  it("does not treat a concept recurrence as an exact duplicate", () => {
    const report = analyzeSemanticSignals([
      base,
      { ...base, id: "SIG-2", title: "Another observation", confidencePercent: 80, confidenceBand: "MEDIUM" }
    ]);
    expect(report.exactDuplicateCandidates).toBe(0);
    expect(report.signals[1]?.status).toBe("SOURCE_UNVERIFIED");
  });
});
