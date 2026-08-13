/**
 * Geocoding service — the farmer never types coordinates.
 *
 *   reverse : a GPS fix from the phone  → district + state
 *   search  : a village/town name typed → coordinates + district + state
 *
 * Both providers are free and keyless, so the app carries no maps billing and
 * no API key to leak. Open-Meteo is already our weather source; BigDataCloud
 * is the only free reverse geocoder that works without a key.
 *
 * Results are cached hard. District boundaries do not move, farmers cluster
 * into the same few districts, and the coordinates only ever feed Open-Meteo's
 * ~10 km weather grid — so a coarse key gives a high hit rate and keeps every
 * deployment comfortably inside the free tiers.
 */
const axios = require('axios');

const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OPEN_METEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';

// Nominatim's usage policy requires an honest User-Agent naming the app.
const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT || 'KrishiMitra/1.0 (+https://github.com/Nakshatra480/Krishi-Mitra)';

// The same policy caps us at one request per second, shared across the whole
// deployment. Slots are booked in advance so concurrent farmers queue instead
// of bursting; anyone who would wait longer than the cap skips to Open-Meteo.
const NOMINATIM_MIN_GAP_MS = 1100;
const NOMINATIM_MAX_WAIT_MS = 3000;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_ENTRIES = 2000;
const REQUEST_TIMEOUT_MS = 10000;

// Rounding the cache key to 2 decimals (~1.1 km) is far finer than the weather
// grid these coordinates feed, so neighbouring fields share one lookup.
const COORD_PRECISION = 2;

const MAX_SEARCH_RESULTS = 8;
const MIN_QUERY_LENGTH = 3;

// Only populated places and administrative areas — keeps airports, railway
// stations and farmhouses out of a list meant for "which village are you in?".
const PLACE_FEATURE_PREFIXES = ['PPL', 'ADM'];

const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  // Plain FIFO eviction: the map is small and every entry is equally cheap to
  // re-fetch, so tracking usage would cost more than it saves.
  if (cache.size >= MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function isValidLat(lat) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

function isValidLon(lon) {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

/**
 * "Nawābganj" → "Nawabganj". Place names come back with macrons the farmer
 * did not type and cannot read back; strip them so the list matches the query.
 */
function stripDiacritics(name) {
  if (!name) return '';
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Both providers label Indian districts "Ludhiana district" / "Bareilly
 * District". Farmers write "Ludhiana", and so does the rest of the app.
 */
function cleanDistrict(name) {
  return stripDiacritics(name).replace(/\s+districts?$/i, '').trim();
}

function cleanPlace(name) {
  return stripDiacritics(name).trim();
}

/**
 * The tehsil/block is only worth showing when it tells the farmer something
 * the name and district have not already said — otherwise the row reads
 * "Kotkapura Tahsil, Kotkapura Tahsil, Faridkot".
 */
function usefulSubDistrict(subDistrict, name, district) {
  const cleaned = cleanDistrict(subDistrict);
  if (!cleaned) return '';
  if (cleaned.toLowerCase() === name.toLowerCase()) return '';
  if (cleaned.toLowerCase() === district.toLowerCase()) return '';
  return cleaned;
}

/**
 * Pull district + state out of a BigDataCloud reverse-geocode payload.
 *
 * Across Indian samples the administrative hierarchy is consistent:
 * adminLevel 4 is the state, adminLevel 5 the district, adminLevel 6 the
 * city/tehsil. We prefer level 5 and fall back to anything self-describing as
 * a district, then to the locality, so a partial answer still beats nothing.
 */
function parseReverse(payload) {
  const admin = payload?.localityInfo?.administrative || [];

  const districtEntry =
    admin.find((a) => a.adminLevel === 5) ||
    admin.find((a) => /district/i.test(a.name || '') || /^district of/i.test(a.description || ''));

  const stateEntry = admin.find((a) => a.adminLevel === 4);

  const district = cleanDistrict(districtEntry?.name || payload?.city || payload?.locality || '');
  const state = cleanPlace(payload?.principalSubdivision || stateEntry?.name || '');
  const place = cleanPlace(payload?.locality || payload?.city || '');

  return {
    district,
    state,
    // Shown back to the farmer as "you are here" — the village reads as
    // recognisable in a way the district alone does not.
    place: place && place !== district ? place : '',
    country: payload?.countryName || '',
    countryCode: payload?.countryCode || '',
  };
}

/**
 * Rank Nominatim hits so the settlement wins over the boundary that shares its
 * name. Searching "Sirsa" returns the district polygon, the city and the
 * tehsil; the city's centre is where the farmer actually is, the district's
 * centroid can sit tens of kilometres away.
 */
function nominatimRank(row) {
  if (row.class === 'place') {
    return ['village', 'town', 'city', 'hamlet'].includes(row.type) ? 0 : 1;
  }
  return 2;
}

/**
 * Shape Nominatim hits into the flat form the picker renders.
 *
 * Indian addresses put the district in `state_district` and the tehsil/block
 * in `county` — except for the many rows where only `county` is filled, which
 * is why it is the fallback rather than a separate field.
 */
function parseNominatim(payload) {
  const rows = (Array.isArray(payload) ? payload : []).filter(
    (r) => (r.class === 'place' || r.class === 'boundary') && r.lat && r.lon
  );

  // Stable sort: Nominatim's own relevance order survives inside each rank.
  const ordered = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => nominatimRank(a.row) - nominatimRank(b.row) || a.index - b.index)
    .map(({ row }) => row);

  const seen = new Set();
  const places = [];

  for (const row of ordered) {
    const address = row.address || {};
    const name = cleanPlace(row.name || (row.display_name || '').split(',')[0]);
    if (!name) continue;

    const district = cleanDistrict(address.state_district || address.county || '');
    const state = cleanPlace(address.state || '');
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!isValidLat(lat) || !isValidLon(lon)) continue;

    const key = `${name}|${district}|${state}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    places.push({
      name,
      district,
      state,
      subDistrict: usefulSubDistrict(address.county || '', name, district),
      lat,
      lon,
    });

    if (places.length >= MAX_SEARCH_RESULTS) break;
  }

  return places;
}

/**
 * Shape Open-Meteo geocoding hits into the flat form the picker renders.
 * India first — the same village names exist across the border in Bangladesh
 * and Pakistan, and an Indian farmer wants the Indian one.
 */
function parseSearch(payload) {
  const results = payload?.results || [];

  const usable = results.filter(
    (r) =>
      r.country_code === 'IN' &&
      Number.isFinite(r.latitude) &&
      Number.isFinite(r.longitude) &&
      PLACE_FEATURE_PREFIXES.some((prefix) => (r.feature_code || '').startsWith(prefix))
  );

  const seen = new Set();
  const places = [];

  for (const r of usable) {
    const name = cleanPlace(r.name);
    const district = cleanDistrict(r.admin2 || r.admin1 || '');
    const state = cleanPlace(r.admin1 || '');

    // Open-Meteo returns the same settlement under several feature codes; one
    // row per name+district is all a farmer can meaningfully choose between.
    const key = `${name}|${district}|${state}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    places.push({
      name,
      district,
      state,
      // admin3 is the tehsil/block — the detail that separates two identically
      // named villages in the same district.
      subDistrict: usefulSubDistrict(r.admin3 || '', name, district),
      lat: r.latitude,
      lon: r.longitude,
    });

    if (places.length >= MAX_SEARCH_RESULTS) break;
  }

  return places;
}

async function reverseGeocode(lat, lon) {
  if (!isValidLat(lat) || !isValidLon(lon)) {
    throw Object.assign(new Error('lat and lon must be valid coordinates'), { status: 400 });
  }

  const key = `rev:${lat.toFixed(COORD_PRECISION)},${lon.toFixed(COORD_PRECISION)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const resp = await axios.get(REVERSE_URL, {
    params: { latitude: lat, longitude: lon, localityLanguage: 'en' },
    timeout: REQUEST_TIMEOUT_MS,
  });

  const parsed = parseReverse(resp.data);
  cacheSet(key, parsed);
  return parsed;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let nextNominatimSlot = 0;

/**
 * Books the next free slot in the 1-req/sec budget and returns how long to
 * wait for it, or null when the queue is already too long to be worth joining.
 */
function claimNominatimSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextNominatimSlot - now);
  if (wait > NOMINATIM_MAX_WAIT_MS) return null;
  nextNominatimSlot = Math.max(now, nextNominatimSlot) + NOMINATIM_MIN_GAP_MS;
  return wait;
}

async function searchViaNominatim(query) {
  const wait = claimNominatimSlot();
  if (wait === null) return null;
  if (wait > 0) await sleep(wait);

  const resp = await axios.get(NOMINATIM_URL, {
    params: {
      q: query,
      countrycodes: 'in',
      format: 'json',
      addressdetails: 1,
      limit: MAX_SEARCH_RESULTS * 2,
    },
    headers: { 'User-Agent': NOMINATIM_USER_AGENT },
    timeout: REQUEST_TIMEOUT_MS,
  });

  return parseNominatim(resp.data);
}

async function searchViaOpenMeteo(query) {
  const resp = await axios.get(OPEN_METEO_URL, {
    // Ask for more than we show: the India + populated-place filters discard a
    // good share of every response.
    params: { name: query, count: 30, language: 'en', format: 'json' },
    timeout: REQUEST_TIMEOUT_MS,
  });

  return parseSearch(resp.data);
}

/**
 * Nominatim first, Open-Meteo second.
 *
 * Open-Meteo is the same family as our weather source and has no rate limit,
 * but its Indian coverage is thin — "Barabanki" finds a village in Odisha and
 * misses the Uttar Pradesh district of that name entirely. Nominatim finds
 * both, so it leads and Open-Meteo catches the cases where the rate budget is
 * spent or the service is down.
 */
async function searchPlaces(query) {
  const trimmed = (query || '').trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const key = `search:${trimmed.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  let places = null;
  try {
    places = await searchViaNominatim(trimmed);
  } catch (err) {
    console.error('[geo] nominatim search failed:', err.message);
  }

  // An empty answer is not the same as a failed one, but both are worth a
  // second opinion before telling a farmer their village does not exist.
  if (!places || places.length === 0) {
    places = await searchViaOpenMeteo(trimmed);
  }

  cacheSet(key, places);
  return places;
}

module.exports = {
  reverseGeocode,
  searchPlaces,
  isValidLat,
  isValidLon,
  // Exported for tests — the parsers hold all the provider-shape knowledge.
  parseReverse,
  parseNominatim,
  parseSearch,
  cleanDistrict,
  stripDiacritics,
};
