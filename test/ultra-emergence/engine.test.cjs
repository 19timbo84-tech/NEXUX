"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateEmergence, sha256 } = require("../../src/ultra-emergence/engine.cjs");
const manifest = require("../../src/ultra-emergence/manifest.cjs");

function validInput(overrides = {}) {
  return {
    candidateId: "candidate-test-001",
    direction: "maximize",
    minPracticalGain: 1,
    componentIds: ["cap-A", "cap-B"],
    baselineRuns: [10, 10.1, 9.9, 10],
    fusionRuns: [14, 14.1, 13.9, 14],
    uncoupledControlRuns: [10.2, 10.1, 10.3, 10.2],
    ablationRuns: { "cap-A": [11, 11.1, 10.9], "cap-B": [12, 12.1, 11.9] },
    replayArtifacts: [{ output: "same", version: 1 }, { version: 1, output: "same" }],
    noveltyAssessment: { status: "SUPPORTED", reviewer: "independent-review" },
    evidence: { inputProvenance: true, falsificationPerformed: true, independentReproduction: true, benchmarkIndependent: true, noCriticalFailures: true },
    humanApproval: true,
    ...overrides
  };
}

test("manifest contains five five-capability fusion sets", () => {
  assert.equal(manifest.fusions.length, 5);
  for (const fusion of manifest.fusions) assert.equal(fusion.capabilityIds.length, 5);
  assert.equal(manifest.topology, "CROSS_DOMAIN_EMERGENCE");
});

test("canonical SHA-256 is independent of object key order", () => {
  assert.equal(sha256({ a: 1, b: 2 }), sha256({ b: 2, a: 1 }));
});

test("certification requires measured gain, ablation, replay, evidence and human approval", () => {
  const result = evaluateEmergence(validInput());
  assert.equal(result.certificationStatus, "CERTIFIED");
  assert.equal(result.epistemicStatus, "OBSERVED");
  assert.ok(result.metrics.incrementalGain > 1);
});

test("missing human approval blocks certification", () => {
  const result = evaluateEmergence(validInput({ humanApproval: false }));
  assert.equal(result.certificationStatus, "BLOCKED");
  assert.equal(result.checks.humanApproval, false);
});

test("non-reproducible replay blocks certification", () => {
  const result = evaluateEmergence(validInput({ replayArtifacts: [{ output: "A" }, { output: "B" }] }));
  assert.equal(result.certificationStatus, "BLOCKED");
  assert.equal(result.checks.deterministicReplay, false);
});

test("missing ablation remains NOT_TESTED and blocks certification", () => {
  const result = evaluateEmergence(validInput({ ablationRuns: { "cap-A": [11, 11.1] } }));
  assert.equal(result.certificationStatus, "BLOCKED");
  assert.equal(result.metrics.ablationResults[1].status, "NOT_TESTED");
});

test("negative or unsupported novelty assessment blocks certification", () => {
  const result = evaluateEmergence(validInput({ noveltyAssessment: { status: "UNASSESSED" } }));
  assert.equal(result.certificationStatus, "BLOCKED");
  assert.equal(result.checks.noveltyReviewSupported, false);
});

test("lower-is-better metrics are normalized before gain calculation", () => {
  const result = evaluateEmergence(validInput({
    direction: "minimize",
    baselineRuns: [10, 10, 10],
    uncoupledControlRuns: [9.8, 9.9, 9.8],
    fusionRuns: [7, 7.1, 6.9],
    ablationRuns: { "cap-A": [8, 8.1], "cap-B": [8.5, 8.6] }
  }));
  assert.ok(result.metrics.incrementalGain > 0);
});

test("invalid measurement arrays fail closed", () => {
  assert.throws(() => evaluateEmergence(validInput({ fusionRuns: [1] })), /at least two/);
});
