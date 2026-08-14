const express = require('express');
const authenticate = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse, errorResponse } = require('../utils/response');
const geocodingService = require('../services/geocodingService');

const router = express.Router();

// Both routes proxy a third-party service, so keep them behind auth — an open
// geocoding relay is an easy thing for someone else to point their app at.
router.use(authenticate);

// GET /geo/reverse?lat=&lon= — a phone's GPS fix turned into district + state
router.get(
  '/reverse',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);

    if (!geocodingService.isValidLat(lat) || !geocodingService.isValidLon(lon)) {
      return errorResponse(res, 'Valid lat and lon query params are required', 400);
    }

    try {
      const location = await geocodingService.reverseGeocode(lat, lon);
      return successResponse(res, { location });
    } catch (err) {
      // The coordinates are already in hand and are the only part the weather
      // model needs; a naming failure must not block field creation, so answer
      // with blanks and let the farmer confirm the district themselves.
      console.error('[geo] reverse lookup failed:', err.message);
      return successResponse(res, {
        location: { district: '', state: '', place: '', country: '', countryCode: '' },
        degraded: true,
      });
    }
  })
);

// GET /geo/search?q= — village or town name turned into coordinates
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const query = (req.query.q || '').trim();
    if (!query) {
      return errorResponse(res, 'Query param q is required', 400);
    }

    try {
      const places = await geocodingService.searchPlaces(query);
      return successResponse(res, { places });
    } catch (err) {
      console.error('[geo] place search failed:', err.message);
      return errorResponse(res, 'Place search is unavailable right now', 503);
    }
  })
);

module.exports = router;
