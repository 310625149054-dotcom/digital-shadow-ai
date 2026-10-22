
const BASE_SCORE = {
  critical: 40,
  high: 25,
  medium: 15,
  low: 5,
  informational: 0,
};

const CONFIDENCE_FACTOR = {
  high: 1,
  medium: 0.6,
  low: 0.3,
};

export function calculateRisk(findings = []) {
  // Count each finding ID only once.
  const unique = new Map();

  for (const finding of findings) {
    const key =
      finding.id ||
      [
        finding.repository,
        finding.filePath,
        finding.lineNumber,
        finding.ruleId,
      ].join(":");

    if (!unique.has(key)) {
      unique.set(key, finding);
    }
  }

  let total = 0;

  for (const finding of unique.values()) {
    const severity = String(
      finding.severity || "informational"
    ).toLowerCase();

    const confidence = String(
      finding.confidence || "medium"
    ).toLowerCase();

    total +=
      (BASE_SCORE[severity] ?? 0) *
      (CONFIDENCE_FACTOR[confidence] ?? 0.6);
  }

  const score = Math.min(100, Math.round(total));

  const riskLevel =
    score >= 70 ? "high" :
    score >= 35 ? "medium" :
    score > 0 ? "low" :
    "no_indicators";

  return {
    score,
    riskLevel,
    scoringLabel:
      "Estimated exposure indicator (0–100; higher means more potential exposure)",
    uniqueFindingsCount: unique.size,
  };
}
