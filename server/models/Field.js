const mongoose = require('mongoose');
const cropParams = require('../data/cropParams.json');
const { isValidVariety } = require('../constants/varieties');

const SUPPORTED_CROPS = new Set(Object.keys(cropParams.crops));

const SoilSchema = new mongoose.Schema(
  {
    nitrogen: Number,
    phosphorus: Number,
    potassium: Number,
    ph: Number,
    testedOn: Date,
  },
  { _id: false }
);

const LocationSchema = new mongoose.Schema(
  {
    district: { type: String, required: true },
    state: { type: String, required: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
  },
  { _id: false }
);

const CurrentStateSchema = new mongoose.Schema(
  {
    stage: {
      type: String,
      enum: ['seedling', 'vegetative', 'flowering', 'grain_filling', 'mature'],
      default: 'seedling',
    },
    cumGdd: { type: Number, default: 0 },
    gddPct: { type: Number, default: 0 },
    predictedHarvestDate: Date,
    yieldEstimate: Number,
    yieldRangeLow: Number,
    yieldRangeHigh: Number,
    // Yields are not all in tonnes/ha (coconut is nuts/ha), and a prediction
    // built from a coarse fallback must not be displayed as a firm number.
    yieldUnit: { type: String, default: 't/ha' },
    yieldConfidence: {
      type: String,
      enum: ['high', 'medium', 'low', 'very_low'],
    },
    stressFactor: Number,
    // The unadjusted statistical prediction, kept alongside the stressed one so
    // the screen can show the arithmetic: baseline x stress = estimate.
    baselineYield: Number,
    // Components and the counts behind them (hot days, rainfall vs need,
    // longest dry run), straight from the stress model. Mixed because the
    // model owns the shape.
    stressBreakdown: { type: mongoose.Schema.Types.Mixed, default: null },
    lastCheckedAt: Date,
  },
  { _id: false }
);

const YieldHistorySchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    estimate: Number,
    trigger: String,
  },
  { _id: false }
);

// One diagnosed problem. Severity and location are what make the finding
// actionable — "leaf rust, moderate, on lower leaves" tells a farmer where to
// look and how worried to be; a bare "leaf rust" does not.
const PhotoProblemSchema = new mongoose.Schema(
  {
    name: String,
    severity: { type: String, enum: ['low', 'moderate', 'severe'], default: 'low' },
    location: String,
    coveragePct: Number,
    evidence: String,
  },
  { _id: false }
);

const PhotoSchema = new mongoose.Schema(
  {
    url: String,
    uploadedAt: { type: Date, default: Date.now },
    detectedCrop: String,
    detectedStage: String,
    confidence: Number,
    problems: { type: [PhotoProblemSchema], default: [] },
    overallSeverity: {
      type: String,
      enum: ['none', 'low', 'moderate', 'severe'],
      default: 'none',
    },
    // False when the photo was blurred, dark, or not a crop at all. The UI
    // shows the reason rather than an empty, falsely reassuring result.
    imageUsable: { type: Boolean, default: true },
    notes: String,
  },
  { _id: false }
);

const FieldSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Field name is required'],
      trim: true,
      maxlength: 100,
    },
    // Any crop the yield model was trained on, not just the original three.
    // Stored canonicalised (lowercase dataset key) so lookups stay stable.
    crop: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (value) => SUPPORTED_CROPS.has(value),
        message: (props) => `${props.value} is not a supported crop`,
      },
    },
    variety: { type: String, trim: true },
    sowingDate: { type: Date, required: true },
    areaAcre: { type: Number, required: true, min: 0.1 },
    location: { type: LocationSchema, required: true },
    soil: { type: SoilSchema, default: () => ({}) },
    current: { type: CurrentStateSchema, default: () => ({}) },
    yieldHistory: { type: [YieldHistorySchema], default: [] },
    photos: { type: [PhotoSchema], default: [] },
    status: {
      type: String,
      enum: ['active', 'harvested'],
      default: 'active',
    },
    actualYield: Number,
  },
  { timestamps: true }
);

FieldSchema.index({ userId: 1, status: 1 });

/**
 * A variety belongs to exactly one crop, so a wheat line saved against a rice
 * field is a data error, not a preference. Enforced here rather than only in
 * the form so the API and the seed script are held to the same rule.
 */
FieldSchema.pre('save', function checkVariety(next) {
  if (this.variety && !isValidVariety(this.crop, this.variety)) {
    return next(new Error(`Variety ${this.variety} is not valid for crop ${this.crop}`));
  }
  return next();
});

module.exports = mongoose.model('Field', FieldSchema);
