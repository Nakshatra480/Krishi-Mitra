/**
 * Safety Policy — deterministic 6-rule verification of Challenger output.
 * PRD §10: Safety Policy section.
 * The LLM identifies risks. This code verifies them. Code has authority.
 */

/**
 * The magnitudes at which a risk is worth acting on. A challenger citing a
 * true-but-trivial number — "95% chance of 5.7mm" — is technically verified
 * and agronomically meaningless, so verification alone is not enough of a bar.
 * The prompt asks the model to respect these; this enforces it, because a
 * prompt is a request and this is a guarantee.
 */
const OBJECTION_THRESHOLDS = {
  rainNext3dMm: 15,
  soilTestAgeDays: 90,
  heatDaysAboveMax: 3,
};

const DAY_MS = 86400000;

/**
 * Is this citation about something big enough to act on?
 * Unknown citation subjects return true — this gate exists to filter out
 * trivial *quantities*, not to silence risks it does not have a rule for.
 */
function crossesThreshold(claim, evidence) {
  const field = String(claim.field || '').toLowerCase();

  if (field.includes('rain')) {
    // Probability never qualifies on its own; only the amount does.
    const mm = evidence.next3DayRainfall ?? evidence.forecast_rainfall ?? 0;
    return mm >= OBJECTION_THRESHOLDS.rainNext3dMm;
  }

  if (field.includes('soil')) {
    if (!evidence.soilTestedOn) return false;
    const ageDays = (Date.now() - new Date(evidence.soilTestedOn).getTime()) / DAY_MS;
    return ageDays > OBJECTION_THRESHOLDS.soilTestAgeDays;
  }

  if (field.includes('heat') || field.includes('temp')) {
    const hotDays = evidence.heatDaysAboveMax ?? 0;
    return hotDays >= OBJECTION_THRESHOLDS.heatDaysAboveMax;
  }

  return true;
}

/**
 * @param {object} proposal - { proposedAction, dose }
 * @param {object} challengerResult - result from Python /challenge
 * @param {object} evidence - actual field data used to verify challenger claims
 * @returns {{ finalAction, decisionReason }}
 */
function applyPolicy(proposal, challengerResult, evidence) {
  // Rule 1: No challenge → keep the proposal
  if (!challengerResult || !challengerResult.challenged) {
    return {
      finalAction: proposal.proposedAction === 'APPLY' ? 'APPLY'
        : proposal.proposedAction === 'HARVEST' ? 'HARVEST'
        : 'HOLD',
      decisionReason: 'No challenger objection. Proposal accepted.',
      objectionApplied: false,
    };
  }

  const citedEvidence = challengerResult.cited_evidence || [];

  // Rule 2 & 3: Verify every cited value against actual tool data
  const unverifiedClaims = citedEvidence.filter((claim) => {
    const actualValue = evidence[claim.field];
    if (actualValue === undefined || actualValue === null) return true; // unsupported
    // Mismatch check: allow 10% tolerance for numeric values
    if (typeof actualValue === 'number' && typeof claim.value === 'number') {
      return Math.abs(actualValue - claim.value) / (Math.abs(actualValue) || 1) > 0.10;
    }
    return String(actualValue).toLowerCase() !== String(claim.value).toLowerCase();
  });

  if (unverifiedClaims.length === citedEvidence.length && citedEvidence.length > 0) {
    // All claims unverified → discard objection
    return {
      finalAction: proposal.proposedAction === 'APPLY' ? 'APPLY'
        : proposal.proposedAction === 'HARVEST' ? 'HARVEST'
        : 'HOLD',
      decisionReason: 'Challenger objection discarded: no cited evidence verified against actual data.',
      objectionApplied: false,
    };
  }

  // Rule 3b: every cited value is real but too small to act on → discard.
  // Without this, a light shower reads on screen as a blocking objection.
  if (citedEvidence.length > 0 && !citedEvidence.some((claim) => crossesThreshold(claim, evidence))) {
    return {
      finalAction: proposal.proposedAction === 'APPLY' ? 'APPLY'
        : proposal.proposedAction === 'HARVEST' ? 'HARVEST'
        : 'HOLD',
      decisionReason: 'objection below action threshold',
      objectionApplied: false,
    };
  }

  // Rule 4: Verified rainfall risk ≥15mm and probability ≥50% → WAIT
  const rainfallClaim = citedEvidence.find(
    (c) => c.field.toLowerCase().includes('rain') || c.field.toLowerCase().includes('rainfall')
  );
  if (rainfallClaim) {
    const actualRain = evidence.next3DayRainfall ?? evidence.forecast_rainfall ?? 0;
    const rainProb = evidence.rainProbability ?? evidence.rain_probability ?? 0;
    if (actualRain >= 15 && rainProb >= 50) {
      return {
        finalAction: 'WAIT',
        decisionReason: `Rainfall risk verified: ${actualRain.toFixed(1)}mm expected with ${rainProb}% probability. Waiting for better window.`,
        objectionApplied: true,
      };
    }
  }

  // Rule 5: Verified objection with soil test older than 90 days → HOLD
  const soilClaim = citedEvidence.find((c) => c.field.toLowerCase().includes('soil'));
  if (soilClaim && evidence.soilTestedOn) {
    const daysSinceSoilTest = (Date.now() - new Date(evidence.soilTestedOn).getTime()) / 86400000;
    if (daysSinceSoilTest > 90) {
      return {
        finalAction: 'HOLD',
        decisionReason: `Soil test is ${Math.round(daysSinceSoilTest)} days old (>90 days). Recommend fresh soil test before applying.`,
        objectionApplied: true,
      };
    }
  }

  // Rule 6: Otherwise keep the original proposal
  return {
    finalAction: proposal.proposedAction === 'APPLY' ? 'APPLY'
      : proposal.proposedAction === 'HARVEST' ? 'HARVEST'
      : 'HOLD',
    decisionReason: 'Challenger objection reviewed but not sufficient to override proposal.',
    objectionApplied: false,
  };
}

module.exports = { applyPolicy, OBJECTION_THRESHOLDS };
