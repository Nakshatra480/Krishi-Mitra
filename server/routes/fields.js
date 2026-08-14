const express = require('express');
const multer = require('multer');
const Field = require('../models/Field');
const authenticate = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse, errorResponse } = require('../utils/response');
const { runFieldCheck } = require('../services/fieldCheckService');
const { CROP_VARIETIES, isValidVariety } = require('../constants/varieties');
const { getFieldWeather } = require('../services/weatherService');
const pythonClient = require('../services/pythonClient');

const gddEngine = require('../services/gddEngine');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Crop catalogue is public: the field-creation form needs it before the user
// has an account, and it contains no user data. Varieties ride along so the
// form's dropdown and the model's validation read from the same table.
router.get('/crops', (req, res) => {
  const crops = Object.entries(gddEngine.CROP_PARAMS).map(([value, params]) => ({
    value,
    label: value.replace(/\b\w/g, (c) => c.toUpperCase()),
    family: params.family,
    unit: params.unit,
    perennial: params.perennial,
  }));
  return successResponse(res, { crops, varieties: CROP_VARIETIES });
});

router.use(authenticate);

// POST /fields — create field and run first check immediately
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, crop, variety, sowingDate, areaAcre, location, soil } = req.body;

    if (!name || !crop || !sowingDate || !areaAcre || !location) {
      return errorResponse(res, 'name, crop, sowingDate, areaAcre, and location are required', 400);
    }
    // Accept any crop the model knows, under any alias or casing the UI sends.
    const cropKey = gddEngine.canonicalCrop(crop);
    if (!gddEngine.CROP_PARAMS[cropKey]) {
      return errorResponse(
        res,
        `Unsupported crop "${crop}". See GET /fields/crops for the supported list.`,
        400
      );
    }
    if (!location.district || !location.state || location.lat == null || location.lon == null) {
      return errorResponse(res, 'location.district, state, lat, lon are required', 400);
    }

    const field = await Field.create({
      userId: req.user._id,
      name,
      crop: cropKey,
      variety,
      sowingDate: new Date(sowingDate),
      areaAcre: Number(areaAcre),
      location,
      soil: soil || {},
    });

    // Run first check immediately (non-blocking on failure)
    try {
      await runFieldCheck(field._id);
    } catch (err) {
      console.error(`[fields] Initial check failed for ${field._id}:`, err.message);
    }

    const updated = await Field.findById(field._id);
    return successResponse(res, { field: updated }, 201);
  })
);

// GET /fields — farmer's own fields
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const fields = await Field.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return successResponse(res, { fields });
  })
);

// GET /fields/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const field = await Field.findOne({ _id: req.params.id, userId: req.user._id });
    if (!field) return errorResponse(res, 'Field not found', 404);
    return successResponse(res, { field });
  })
);

// PUT /fields/:id
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const allowed = ['name', 'variety', 'soil'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const existing = await Field.findOne({ _id: req.params.id, userId: req.user._id });
    if (!existing) return errorResponse(res, 'Field not found', 404);

    // findOneAndUpdate skips pre-save middleware, so the model's variety rule
    // has to be applied here too or this route becomes the way around it.
    if (updates.variety && !isValidVariety(existing.crop, updates.variety)) {
      return errorResponse(
        res,
        `Variety ${updates.variety} is not valid for crop ${existing.crop}`,
        400
      );
    }

    const field = await Field.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      updates,
      { new: true }
    );
    if (!field) return errorResponse(res, 'Field not found', 404);
    return successResponse(res, { field });
  })
);

// DELETE /fields/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const field = await Field.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!field) return errorResponse(res, 'Field not found', 404);
    return successResponse(res, { message: 'Field deleted' });
  })
);

// POST /fields/:id/check — run full pipeline
router.post(
  '/:id/check',
  asyncHandler(async (req, res) => {
    const field = await Field.findOne({ _id: req.params.id, userId: req.user._id });
    if (!field) return errorResponse(res, 'Field not found', 404);

    const result = await runFieldCheck(field._id);
    return successResponse(res, result);
  })
);

// POST /fields/:id/photo — upload crop photo → DeepSeek vision
router.post(
  '/:id/photo',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const field = await Field.findOne({ _id: req.params.id, userId: req.user._id });
    if (!field) return errorResponse(res, 'Field not found', 404);
    if (!req.file) return errorResponse(res, 'Photo file required', 400);

    let visionResult = null;
    try {
      visionResult = await pythonClient.vision(req.file.buffer, req.file.mimetype);
    } catch (err) {
      console.error('[fields/photo] Vision failed:', err.message);
    }

    // Store photo metadata (URL = placeholder; production would use object storage)
    field.photos.push({
      url: `data:${req.file.mimetype};base64,placeholder`,
      uploadedAt: new Date(),
      detectedCrop: visionResult?.crop || null,
      detectedStage: visionResult?.stage || null,
      problems: visionResult?.problems || [],
    });
    await field.save();

    return successResponse(res, { visionResult, photosCount: field.photos.length });
  })
);

// POST /fields/:id/harvest — mark field as harvested
router.post(
  '/:id/harvest',
  asyncHandler(async (req, res) => {
    const { actualYield } = req.body;
    const field = await Field.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { status: 'harvested', actualYield: actualYield || null },
      { new: true }
    );
    if (!field) return errorResponse(res, 'Field not found', 404);
    return successResponse(res, { field });
  })
);

// GET /fields/:id/weather — return cached weather for a field
router.get(
  '/:id/weather',
  asyncHandler(async (req, res) => {
    const field = await Field.findOne({ _id: req.params.id, userId: req.user._id });
    if (!field) return errorResponse(res, 'Field not found', 404);

    const weather = await getFieldWeather(
      field._id.toString(),
      field.location.lat,
      field.location.lon,
      field.sowingDate
    );
    return successResponse(res, { weather });
  })
);

module.exports = router;
