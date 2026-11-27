"use strict";

const { createHash } = require("node:crypto");

const STATES = Object.freeze(["OBSERVED", "DERIVED", "INFERRED", "SIMULATED", "SYNTHETIC", "UNKNOWN", "NOT_PROVEN"]);
const DIRECTIONS = Object.freeze(["maximize", "minimize"]);

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}
function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalize(value), "utf8").digest("hex");
}
function assertRuns(name, values) {
  if (!Array.isArray(values) || values.length < 2 || values.some(v => typeof v !== "number" || !Number.isFinite(v))) {
    throw new TypeError(name + " must contain at least two finite numeric observations");
  }
}
function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sampleVariance(xs) {
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}
function utility(x, direction) { return direction === "maximize" ? x : -x; }
function intervalDifference(a, b) {
  const delta = mean(a) - mean(b);
  const se = Math.sqrt(sampleVariance(a) / a.length + sampleVariance(b) / b.length);
  return { delta, standardError: se, lower95: delta - 1.96 * se, upper95: delta + 1.96 * se };
}

/**
 * Evaluate a candidate from measured repeated runs. This function does not
 * execute capabilities; the caller must supply independently captured data.
 * CERTIFIED is possible only with complete evidence and explicit human approval.
 */
function evaluateEmergence(input) {
  if (!input || typeof input !== "object") throw new TypeError("evaluation input is required");
  const direction = input.direction || "maximize";
  if (!DIRECTIONS.includes(direction)) throw new TypeError("direction must be maximize or minimize");
  for (const key of ["baselineRuns", "fusionRuns", "uncoupledControlRuns"]) assertRuns(key, input[key]);
  if (!input.candidateId || typeof input.candidateId !== "string") throw new TypeError("candidateId is required");
  const minPracticalGain = input.minPracticalGain ?? 0;
  if (!Number.isFinite(minPracticalGain) || minPracticalGain < 0) throw new TypeError("minPracticalGain must be a finite non-negative number");

  const baseline = input.baselineRuns.map(x => utility(x, direction));
  const fusion = input.fusionRuns.map(x => utility(x, direction));
  const control = input.uncoupledControlRuns.map(x => utility(x, direction));
  const comparator = mean(baseline) >= mean(control) ? baseline : control;
  const comparatorName = comparator === baseline ? "BASELINE" : "UNCOUPLED_CONTROL";
  const ci = intervalDifference(fusion, comparator);
  const incrementalGain = ci.delta;

  const componentIds = Array.isArray(input.componentIds) ? input.componentIds : [];
  const ablations = input.ablationRuns && typeof input.ablationRuns === "object" ? input.ablationRuns : {};
  const ablationResults = componentIds.map(id => {
    const values = ablations[id];
    if (!Array.isArray(values) || values.length < 2 || values.some(v => !Number.isFinite(v))) {
      return { componentId: id, status: "NOT_TESTED", contribution: null };
    }
    const contribution = mean(fusion) - mean(values.map(x => utility(x, direction)));
    return { componentId: id, status: "MEASURED", contribution };
  });
  const ablationsComplete = componentIds.length > 0 && ablationResults.every(x => x.status === "MEASURED");
  const ablationPositive = ablationsComplete && ablationResults.every(x => x.contribution > 0);

  const replayArtifacts = Array.isArray(input.replayArtifacts) ? input.replayArtifacts : [];
  const replayHashes = replayArtifacts.map(sha256);
  const reproducible = replayHashes.length >= 2 && replayHashes.every(h => h === replayHashes[0]);
  const evidence = input.evidence || {};
  const evidenceChecks = {
    inputProvenance: evidence.inputProvenance === true,
    falsificationPerformed: evidence.falsificationPerformed === true,
    independentReproduction: evidence.independentReproduction === true,
    benchmarkIndependent: evidence.benchmarkIndependent === true,
    noCriticalFailures: evidence.noCriticalFailures === true,
    humanApproval: input.humanApproval === true,
    noveltyReviewSupported: input.noveltyAssessment && input.noveltyAssessment.status === "SUPPORTED"
  };
  const evidenceComplete = Object.values(evidenceChecks).every(Boolean);
  const gainSupported = incrementalGain >= minPracticalGain && ci.lower95 > 0;
  const checks = {
    repeatedMeasurements: true,
    positiveIncrementalGain: gainSupported,
    ablationsComplete,
    ablationContributionPositive: ablationPositive,
    deterministicReplay: reproducible,
    evidenceComplete,
    ...evidenceChecks
  };
  const certified = Object.values(checks).every(Boolean);
  const epistemicStatus = certified ? "OBSERVED" : "NOT_PROVEN";

  const report = {
    candidateId: input.candidateId,
    topology: "CROSS_DOMAIN_EMERGENCE",
    certificationStatus: certified ? "CERTIFIED" : "BLOCKED",
    epistemicStatus,
    metrics: {
      baselineMean: mean(input.baselineRuns),
      fusionMean: mean(input.fusionRuns),
      uncoupledControlMean: mean(input.uncoupledControlRuns),
      comparator: comparatorName,
      incrementalGain,
      confidenceInterval95: { lower: ci.lower95, upper: ci.upper95 },
      minPracticalGain,
      ablationResults
    },
    checks,
    replayHashes,
    evidenceDigest: sha256({ candidateId: input.candidateId, checks, replayHashes, metrics: { incrementalGain, lower95: ci.lower95, upper95: ci.upper95 } })
  };
  return Object.freeze(report);
}

module.exports = { STATES, canonicalize, sha256, evaluateEmergence };
