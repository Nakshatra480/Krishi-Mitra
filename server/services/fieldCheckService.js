/**
 * Field check orchestrator — the full pipeline.
 * Weather → GDD → Yield → Event Detection → Advisory → Challenger → Safety Policy → Validator → Save
 * PRD §17 build order steps 3–9.
 */
const weatherService = require('./weatherService');
const gddEngine = require('./gddEngine');
const pythonClient = require('./pythonClient');
const { advise } = require('./advisorService');
const { applyPolicy } = require('./safetyPolicyService');
const { validate } = require('./validatorService');
const { detectAndCreateEvents, upsertEvent } = require('./eventDetectionService');
const Field = require('../models/Field');

async function runFieldCheck(fieldId) {
  const field = await Field.findById(fieldId);
  if (!field || field.status !== 'active') {
    return { skipped: true, reason: 'Field not found or not active' };
  }

  const previousStage = field.current.stage;
  const { lat, lon } = field.location;

  // ── Step 1: Fetch weather ──
  const weatherData = await weatherService.getFieldWeather(
    fieldId.toString(),
    lat,
    lon,
    field.sowingDate
  );

  const historicalDays = gddEngine.parseHistoricalDays(weatherData.historical);
  const forecastDays = gddEngine.parseForecastDays(weatherData.forecast);

  // ── Step 2: GDD computation ──
  const cropParams = gddEngine.getCropParams(field.crop);
  const cumGdd = gddEngine.accumulateGdd(historicalDays, cropParams.base, cropParams.upper);
  const gddPct = Math.min(cumGdd / cropParams.maturityGdd, 1.0);
  const stage = gddEngine.computeStage(gddPct);
  const predictedHarvestDate = gddEngine.predictHarvestDate(
    cumGdd,
    cropParams.maturityGdd,
    forecastDays,
    cropParams.base,
    cropParams.upper
  );

  // ── Step 3: Yield prediction ──
  const areaHa = field.areaAcre * 0.404686; // 1 acre = 0.404686 ha
  const totalHistoricalRain = historicalDays.reduce((s, d) => s + (d.rain || 0), 0);
  const tmaxSeries = historicalDays.map((d) => d.tmax);
  const rainfallSeries = historicalDays.map((d) => d.rain);

  let yieldResult = null;
  try {
    yieldResult = await pythonClient.predictYield({
      crop: field.crop,
      season: gddEngine.deriveSeason(field.sowingDate, field.crop),
      state: field.location.state,
      area_ha: areaHa,
      annual_rainfall_mm: totalHistoricalRain,
      // Omitted on purpose: the AI service fills these from the state's median
      // agronomic intensity. The old hardcoded 100 kg/ha and 5 kg/ha were a
      // guess, and 5 kg/ha of pesticide is ~13x the dataset maximum, which put
      // every request outside the range the model was fitted on.
      gdd_pct: gddPct,
      tmax_series: tmaxSeries,
      daily_rainfall: rainfallSeries,
    });
  } catch (err) {
    console.error(`[fieldCheck] Yield prediction failed for ${fieldId}:`, err.message);
    yieldResult = null;
  }

  // ── Step 4: Update field.current ──
  field.current.cumGdd = Math.round(cumGdd);
  field.current.gddPct = Math.round(gddPct * 10000) / 10000;
  field.current.stage = stage;
  field.current.predictedHarvestDate = predictedHarvestDate;
  field.current.lastCheckedAt = new Date();

  if (yieldResult) {
    field.current.yieldEstimate = yieldResult.predicted_yield;
    field.current.yieldRangeLow = yieldResult.yield_range_low;
    field.current.yieldRangeHigh = yieldResult.yield_range_high;
    field.current.stressFactor = yieldResult.stress_factor;
    // Not every crop is measured in tonnes/ha (coconut is nuts/ha), and a
    // low-confidence fallback must not be rendered as a firm number.
    field.current.yieldUnit = yieldResult.unit;
    field.current.yieldConfidence = yieldResult.confidence;
    // Stored so the UI can explain the stress figure instead of asserting it.
    field.current.stressBreakdown = yieldResult.stress_breakdown || null;
    field.current.baselineYield = yieldResult.baseline_yield;

    const sb = yieldResult.stress_breakdown;
    if (sb) {
      console.log(
        `[fieldCheck] ${field.crop} @ ${field.location.district}: ` +
        `baseline=${yieldResult.baseline_yield} stress=${sb.stress_factor}` +
        `${sb.clamped ? ' (CLAMPED)' : ''} | ` +
        `hot_days=${sb.hot_days} above ${sb.upper_temp_c}C, ` +
        `rain=${sb.total_rainfall_mm}mm of ${sb.water_need_mm}mm need, ` +
        `longest_dry_run=${sb.longest_dry_run_days}d (tolerates ${sb.dry_tolerance_days}d)`
      );
    }
  }

  // ── Step 5: Event detection ──
  const triggeredTypes = await detectAndCreateEvents(
    field,
    historicalDays,
    forecastDays,
    yieldResult,
    previousStage,
    cropParams
  );

  // Update yield history if yield changed meaningfully
  if (yieldResult) {
    field.yieldHistory.push({
      date: new Date(),
      estimate: yieldResult.predicted_yield,
      trigger: triggeredTypes.join(',') || 'routine_check',
    });
    // Keep last 30 history entries
    if (field.yieldHistory.length > 30) {
      field.yieldHistory = field.yieldHistory.slice(-30);
    }
  }

  // ── Step 6: Advisory pipeline ──
  const advisory = advise(field, forecastDays);

  let finalAction = advisory.proposedAction === 'NONE' ? 'HOLD' : advisory.proposedAction;
  let decisionReason = advisory.reason;
  let validatorPassed = true;
  let challengerResult = null;
  // Whether the challenger's objection actually moved the decision. Drives
  // whether the UI shows a blocking callout or a one-line note.
  let objectionApplied = false;

  if (advisory.proposedAction !== 'NONE') {
    // Build evidence object for challenger verification
    const next3DayRain = forecastDays.slice(0, 3).reduce((s, d) => s + (d.rain ?? 0), 0);
    const rainProb = forecastDays[0]?.rain_prob ?? 0;
    const activeHazard = triggeredTypes.includes('HAZARD_ALERT');

    const evidence = {
      crop: field.crop,
      stage,
      gddPct: Math.round(gddPct * 100),
      next3DayRainfall: Math.round(next3DayRain * 10) / 10,
      rainProbability: rainProb,
      soilTestedOn: field.soil?.testedOn || null,
      yieldEstimate: yieldResult?.predicted_yield || null,
      stressFactor: yieldResult?.stress_factor || null,
      heatFactor: yieldResult?.heat_factor || null,
      drySpellFactor: yieldResult?.dry_spell_factor || null,
      // A day count, not a factor — the safety policy needs the magnitude to
      // decide whether a heat objection is worth acting on.
      heatDaysAboveMax: yieldResult?.stress_breakdown?.hot_days ?? 0,
      hasActiveHazard: activeHazard,
    };

    // ── Step 7: Challenger ──
    try {
      challengerResult = await pythonClient.challenge(advisory.reason, evidence);
    } catch (err) {
      console.error(`[fieldCheck] Challenger failed for ${fieldId}:`, err.message);
      challengerResult = null;
    }

    // ── Step 8: Safety Policy ──
    const policyResult = applyPolicy(advisory, challengerResult, evidence);
    finalAction = policyResult.finalAction;
    decisionReason = policyResult.decisionReason;
    objectionApplied = policyResult.objectionApplied === true;

    // ── Step 9: Validator ──
    const validationResult = validate({
      yieldEstimate: yieldResult?.predicted_yield,
      crop: field.crop,
      dose: advisory.dose,
      cumGdd,
      finalAction,
      activeHazard,
    });

    validatorPassed = validationResult.passed;
    if (!validationResult.passed) {
      finalAction = 'HOLD';
      decisionReason = `Validator override: ${validationResult.reason}`;
    }

    // Create advisory event if action is actionable
    if (finalAction !== 'NONE') {
      const severityMap = { APPLY: 'medium', HARVEST: 'high', WAIT: 'low', HOLD: 'low' };
      // Same dedupe path as the detectors — re-running a check restates the
      // advisory rather than stacking another copy on the timeline.
      await upsertEvent({
        fieldId: field._id,
        userId: field.userId,
        type: advisory.type || 'FERTILIZER_WINDOW',
        severity: severityMap[finalAction] || 'medium',
        title: `Advisory: ${finalAction}`,
        message: advisory.reason,
        evidence: {
          proposedAction: advisory.proposedAction,
          challengerObjection: challengerResult?.reason || null,
          finalAction,
          decisionReason,
        },
        advisory: {
          proposedAction: advisory.proposedAction,
          challengerObjection: challengerResult?.reason || 'No objection',
          finalAction,
          decisionReason,
          validatorPassed,
          objectionApplied,
        },
      });
    }
  }

  await field.save();

  return {
    fieldId: field._id,
    stage,
    cumGdd: Math.round(cumGdd),
    gddPct: Math.round(gddPct * 100),
    predictedHarvestDate,
    yieldResult,
    triggeredEvents: triggeredTypes,
    advisory: {
      proposedAction: advisory.proposedAction,
      finalAction,
      decisionReason,
      validatorPassed,
    },
  };
}

module.exports = { runFieldCheck };
