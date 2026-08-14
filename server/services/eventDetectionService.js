/**
 * Event detection — runs all 8 checks on every field check.
 * PRD §9: Event Detection section.
 * Creates Event documents and updates field state.
 */
const Event = require('../models/Event');
const { searchHazards } = require('./tavilyService');

// Running a check twice in a day re-detects the same conditions and used to
// insert a second identical row, so a farmer opening the timeline saw the same
// warning stacked several times. Within this window an event is refreshed in
// place instead.
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

const HEAVY_RAIN_MM = 25;
const HEAT_DAYS_THRESHOLD = 3;
const DRY_SPELL_DAYS = 14;
const FERTILIZER_RAIN_LIMIT = 15;
const FERTILIZER_WINDOW_DAYS = 3;
const YIELD_SHIFT_PCT = 0.10;

/**
 * Create an event, or refresh the same field's event of that type if one was
 * already raised in the last 24 hours.
 *
 * STAGE_CHANGE is exempt: two stage changes in one day are two real, distinct
 * transitions, and collapsing them would erase part of the crop's history.
 *
 * @param {object} doc - the event to create
 * @returns {Promise<object>} the created or refreshed event
 */
async function upsertEvent(doc) {
  if (doc.type !== 'STAGE_CHANGE') {
    const recent = await Event.findOne({
      fieldId: doc.fieldId,
      type: doc.type,
      createdAt: { $gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    }).sort({ createdAt: -1 });

    if (recent) {
      recent.severity = doc.severity;
      recent.title = doc.title;
      recent.message = doc.message;
      recent.evidence = doc.evidence ?? recent.evidence;
      if (doc.advisory) recent.advisory = doc.advisory;
      // Bumping the timestamp keeps the timeline ordered by when the condition
      // was last confirmed, not when it was first seen.
      recent.createdAt = new Date();
      await recent.save();
      return recent;
    }
  }

  return Event.create(doc);
}

/**
 * @param {object} field - Mongoose field document
 * @param {object} weatherData - { historical, forecast }
 * @param {object} parsedHistorical - array of daily historical objects
 * @param {object} parsedForecast - array of daily forecast objects
 * @param {object} yieldResult - result from yield prediction
 * @param {string} previousStage - stage before this check
 * @returns {string[]} - list of triggered event types
 */
async function detectAndCreateEvents(
  field,
  parsedHistorical,
  parsedForecast,
  yieldResult,
  previousStage,
  cropParams
) {
  const triggeredTypes = [];
  const eventsToCreate = [];

  const stage = field.current.stage;
  const gddPct = field.current.gddPct;
  const upper = cropParams.upper;

  // 1. STAGE_CHANGE — low
  if (previousStage && previousStage !== stage) {
    eventsToCreate.push({
      fieldId: field._id,
      userId: field.userId,
      type: 'STAGE_CHANGE',
      severity: 'low',
      title: 'Crop stage changed',
      message: `Crop progressed from ${previousStage} to ${stage} (${Math.round(gddPct * 100)}% GDD complete).`,
      evidence: { previousStage, currentStage: stage, gddPct },
    });
    triggeredTypes.push('STAGE_CHANGE');
  }

  // 2. HEAVY_RAIN — next 48h rainfall > 25mm — high
  const next48hRain = parsedForecast.slice(0, 2).reduce((s, d) => s + (d.rain ?? 0), 0);
  if (next48hRain > HEAVY_RAIN_MM) {
    eventsToCreate.push({
      fieldId: field._id,
      userId: field.userId,
      type: 'HEAVY_RAIN',
      severity: 'high',
      title: 'Heavy rain expected',
      message: `${next48hRain.toFixed(1)}mm of rain forecast in the next 48 hours. Avoid field operations.`,
      evidence: { next48hRainfall: next48hRain },
    });
    triggeredTypes.push('HEAVY_RAIN');
  }

  // 3. HEAT_STRESS — 3+ forecast days above crop upper temp — high
  const hotForecastDays = parsedForecast.slice(0, 7).filter(
    (d) => (d.temperature_2m_max ?? 0) > upper
  ).length;
  if (hotForecastDays >= HEAT_DAYS_THRESHOLD) {
    eventsToCreate.push({
      fieldId: field._id,
      userId: field.userId,
      type: 'HEAT_STRESS',
      severity: 'high',
      title: 'Heat stress risk',
      message: `${hotForecastDays} days forecast above ${upper}°C (crop upper temperature). Yield risk elevated.`,
      evidence: { hotDays: hotForecastDays, upperTemp: upper },
    });
    triggeredTypes.push('HEAT_STRESS');
  }

  // 4. DRY_SPELL — 14+ past days with rainfall < 1mm — medium
  const recentDays = parsedHistorical.slice(-21);
  const dryRun = longestDryRun(recentDays.map((d) => d.rain));
  if (dryRun >= DRY_SPELL_DAYS) {
    eventsToCreate.push({
      fieldId: field._id,
      userId: field.userId,
      type: 'DRY_SPELL',
      severity: 'medium',
      title: 'Extended dry spell',
      message: `${dryRun} consecutive days with less than 1mm rainfall. Consider irrigation if available.`,
      evidence: { dryRunDays: dryRun },
    });
    triggeredTypes.push('DRY_SPELL');
  }

  // 5. FERTILIZER_WINDOW — vegetative/flowering, next 3 days < 15mm — medium
  const next3DayRain = parsedForecast.slice(0, FERTILIZER_WINDOW_DAYS).reduce((s, d) => s + (d.rain ?? 0), 0);
  if (['vegetative', 'flowering'].includes(stage) && next3DayRain < FERTILIZER_RAIN_LIMIT) {
    eventsToCreate.push({
      fieldId: field._id,
      userId: field.userId,
      type: 'FERTILIZER_WINDOW',
      severity: 'medium',
      title: 'Fertilizer window open',
      message: `${stage} stage with only ${next3DayRain.toFixed(1)}mm forecast over 3 days — good window for fertilizer application.`,
      evidence: { stage, next3DayRainfall: next3DayRain },
    });
    triggeredTypes.push('FERTILIZER_WINDOW');
  }

  // 6. HAZARD_ALERT — Tavily hazard check — high
  try {
    const hazard = await searchHazards(field.location.district, field.location.state);
    if (hazard.hazardFound) {
      eventsToCreate.push({
        fieldId: field._id,
        userId: field.userId,
        type: 'HAZARD_ALERT',
        severity: 'high',
        title: 'Active hazard warning',
        message: hazard.reason,
        evidence: { sources: hazard.evidence },
      });
      triggeredTypes.push('HAZARD_ALERT');
    }
  } catch (_) {
    // Tavily failure does not block the pipeline
  }

  // 7. YIELD_SHIFT — yield changed > 10% from last notification — medium
  const lastYieldEntry = field.yieldHistory?.slice(-1)[0];
  if (lastYieldEntry && yieldResult?.predicted_yield) {
    const shift = Math.abs(yieldResult.predicted_yield - lastYieldEntry.estimate) / (lastYieldEntry.estimate || 1);
    if (shift > YIELD_SHIFT_PCT) {
      const direction = yieldResult.predicted_yield > lastYieldEntry.estimate ? 'improved' : 'declined';
      eventsToCreate.push({
        fieldId: field._id,
        userId: field.userId,
        type: 'YIELD_SHIFT',
        severity: 'medium',
        title: `Yield estimate ${direction}`,
        message: `Predicted yield ${direction} by ${(shift * 100).toFixed(1)}% to ${yieldResult.predicted_yield.toFixed(2)} ${yieldResult.unit || 't/ha'}.`,
        evidence: {
          previousYield: lastYieldEntry.estimate,
          currentYield: yieldResult.predicted_yield,
          shiftPct: shift,
        },
      });
      triggeredTypes.push('YIELD_SHIFT');
    }
  }

  // 8. HARVEST_WINDOW — GDD progress > 90% — high
  if (gddPct > 0.90) {
    eventsToCreate.push({
      fieldId: field._id,
      userId: field.userId,
      type: 'HARVEST_WINDOW',
      severity: 'high',
      title: 'Harvest window approaching',
      message: `Crop is ${Math.round(gddPct * 100)}% mature. Plan harvest soon.`,
      evidence: { gddPct },
    });
    triggeredTypes.push('HARVEST_WINDOW');
  }

  // Sequential rather than insertMany: each one has to check for a recent
  // twin first, and a handful of events per check is not worth parallelising.
  for (const doc of eventsToCreate) {
    await upsertEvent(doc);
  }

  return triggeredTypes;
}

function longestDryRun(rainfallArray) {
  let max = 0, current = 0;
  for (const rain of rainfallArray) {
    if (rain < 1) { current++; max = Math.max(max, current); }
    else current = 0;
  }
  return max;
}

module.exports = { detectAndCreateEvents, upsertEvent };
