export type SignalStatus =
  | "RECEIVED"
  | "NORMALIZED"
  | "DUPLICATE_CANDIDATE"
  | "SOURCE_UNVERIFIED"
  | "UNDER_REVIEW"
  | "CORROBORATED"
  | "CONTESTED"
  | "REJECTED";

export type EvidenceState =
  | "OBSERVED"
  | "DERIVED"
  | "INFERRED"
  | "SIMULATED"
  | "SYNTHETIC"
  | "UNKNOWN";

export type ReportedConfidenceBand = "LOW" | "MEDIUM" | "HIGH";

export interface ASHSemanticSignalInput {
  id: string;
  title: string;
  source: string;
  concepts: readonly string[];
  confidencePercent?: number;
  confidenceBand?: ReportedConfidenceBand;
  sourceUri?: string;
  observedAt?: string;
}

export interface ASHSemanticSignal extends ASHSemanticSignalInput {
  normalizedTitle: string;
  normalizedSource: string;
  normalizedConcepts: readonly string[];
  status: SignalStatus;
  evidenceState: EvidenceState;
  issues: readonly string[];
  duplicateOf?: string;
}

export interface ASHSemanticSignalReport {
  mode: "SANDBOX_ONLY";
  inputCount: number;
  processedCount: number;
  exactDuplicateCandidates: number;
  conceptClusters: Array<{ concept: string; signalIds: string[] }>;
  statusCounts: Record<SignalStatus, number>;
  signals: ASHSemanticSignal[];
  certification: "NOT_CERTIFIED";
  notes: string[];
}

const STATUS_VALUES: readonly SignalStatus[] = [
  "RECEIVED", "NORMALIZED", "DUPLICATE_CANDIDATE", "SOURCE_UNVERIFIED",
  "UNDER_REVIEW", "CORROBORATED", "CONTESTED", "REJECTED"
];

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US")
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function validHttpUri(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function confidenceIssues(input: ASHSemanticSignalInput): string[] {
  const issues: string[] = [];
  const score = input.confidencePercent;

  if (score !== undefined && (!Number.isFinite(score) || score < 0 || score > 100)) {
    issues.push("CONFIDENCE_OUT_OF_RANGE");
  }

  if (score !== undefined && input.confidenceBand) {
    // This is a consistency heuristic, not a calibration model.
    const expected: ReportedConfidenceBand =
      score >= 95 ? "HIGH" : score >= 70 ? "MEDIUM" : "LOW";
    if (input.confidenceBand !== expected) {
      issues.push("CONFIDENCE_BAND_INCONSISTENT_WITH_LOCAL_RULE");
    }
  }

  return issues;
}

/**
 * Deterministic intake and triage only. This module does not verify sources,
 * establish truth, calibrate confidence, or authorize external actions.
 */
export function analyzeSemanticSignals(
  inputs: readonly ASHSemanticSignalInput[]
): ASHSemanticSignalReport {
  const seenExact = new Map<string, string>();
  const conceptIds = new Map<string, Set<string>>();
  const signals: ASHSemanticSignal[] = [];

  for (const input of inputs) {
    const issues = confidenceIssues(input);
    const normalizedTitle = normalize(input.title);
    const normalizedSource = normalize(input.source);
    const normalizedConcepts = [...new Set(input.concepts.map(normalize).filter(Boolean))];

    if (!input.id.trim()) issues.push("MISSING_SIGNAL_ID");
    if (!normalizedTitle) issues.push("MISSING_TITLE");
    if (!normalizedSource) issues.push("MISSING_SOURCE");
    if (normalizedConcepts.length === 0) issues.push("MISSING_CONCEPTS");
    if (input.sourceUri && !validHttpUri(input.sourceUri)) issues.push("SOURCE_URI_INVALID");
    if (input.observedAt && Number.isNaN(Date.parse(input.observedAt))) {
      issues.push("OBSERVED_AT_INVALID");
    }

    const hasExactKey = Boolean(normalizedSource && normalizedTitle && normalizedConcepts.length > 0);
    const exactKey = [normalizedSource, normalizedTitle, [...normalizedConcepts].sort().join("|")].join("::");
    const duplicateOf = hasExactKey ? seenExact.get(exactKey) : undefined;
    if (duplicateOf) issues.push("EXACT_DUPLICATE_CANDIDATE");
    else if (hasExactKey) seenExact.set(exactKey, input.id);

    for (const concept of normalizedConcepts) {
      const ids = conceptIds.get(concept) ?? new Set<string>();
      ids.add(input.id);
      conceptIds.set(concept, ids);
    }

    const status: SignalStatus = duplicateOf
      ? "DUPLICATE_CANDIDATE"
      : issues.length > 0
        ? "UNDER_REVIEW"
        : "SOURCE_UNVERIFIED";

    signals.push({
      ...input,
      normalizedTitle,
      normalizedSource,
      normalizedConcepts,
      status,
      evidenceState: "UNKNOWN",
      issues,
      ...(duplicateOf ? { duplicateOf } : {})
    });
  }

  const conceptClusters = [...conceptIds.entries()]
    .filter(([, ids]) => ids.size > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([concept, ids]) => ({ concept, signalIds: [...ids].sort() }));

  const statusCounts = Object.fromEntries(
    STATUS_VALUES.map(status => [status, signals.filter(signal => signal.status === status).length])
  ) as Record<SignalStatus, number>;

  return {
    mode: "SANDBOX_ONLY",
    inputCount: inputs.length,
    processedCount: signals.length,
    exactDuplicateCandidates: signals.filter(signal => signal.status === "DUPLICATE_CANDIDATE").length,
    conceptClusters,
    statusCounts,
    signals,
    certification: "NOT_CERTIFIED",
    notes: [
      "SOURCE_UNVERIFIED means the source has not been independently checked.",
      "Repeated concepts are clusters for review, not proof of duplicate events.",
      "Confidence values and bands are reported inputs, not calibrated probabilities.",
      "No signal is marked CORROBORATED by this intake engine."
    ]
  };
}
