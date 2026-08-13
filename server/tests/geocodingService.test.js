const test = require('node:test');
const assert = require('node:assert');

const {
  parseReverse,
  parseNominatim,
  parseSearch,
  cleanDistrict,
  stripDiacritics,
  isValidLat,
  isValidLon,
} = require('../services/geocodingService');

// Trimmed from a live BigDataCloud response for 26.9255, 81.2045 — the exact
// coordinates the old form used as its placeholder.
const BARABANKI_REVERSE = {
  countryName: 'India',
  countryCode: 'IN',
  principalSubdivision: 'Uttar Pradesh',
  city: 'Nawabganj',
  locality: 'Nawabganj',
  localityInfo: {
    administrative: [
      { name: 'India', adminLevel: 2, description: 'country in South Asia' },
      { name: 'Uttar Pradesh', adminLevel: 4, description: 'state in northern India' },
      { name: 'Barabanki district', adminLevel: 5, description: 'district of Uttar Pradesh, India' },
      { name: 'Nawabganj', adminLevel: 6, description: 'human settlement in Barabanki district' },
      { name: 'Nawabganj tehsil', adminLevel: 6, description: 'tehsil in Barabanki district' },
    ],
  },
};

test('parseReverse pulls district from adminLevel 5, not the tehsil below it', () => {
  const out = parseReverse(BARABANKI_REVERSE);
  assert.strictEqual(out.district, 'Barabanki');
  assert.strictEqual(out.state, 'Uttar Pradesh');
  assert.strictEqual(out.place, 'Nawabganj');
  assert.strictEqual(out.countryCode, 'IN');
});

test('parseReverse falls back to the locality when no district level is present', () => {
  const out = parseReverse({
    principalSubdivision: 'Punjab',
    locality: 'Kotkapura',
    localityInfo: { administrative: [{ name: 'Punjab', adminLevel: 4 }] },
  });
  assert.strictEqual(out.district, 'Kotkapura');
  assert.strictEqual(out.state, 'Punjab');
  // The village name would only repeat the district, so it is left out.
  assert.strictEqual(out.place, '');
});

test('parseReverse survives an empty or malformed payload', () => {
  for (const payload of [null, undefined, {}, { localityInfo: {} }]) {
    const out = parseReverse(payload);
    assert.strictEqual(out.district, '');
    assert.strictEqual(out.state, '');
  }
});

// Trimmed from a live Open-Meteo response for "Nawabganj" — note the
// Bangladesh hits, which an Indian farmer must never be offered.
const NAWABGANJ_SEARCH = {
  results: [
    {
      name: 'Nawābganj', latitude: 24.59, longitude: 88.27, country_code: 'BD',
      admin1: 'Rajshahi Division', admin2: 'Chapai Nababganj District', feature_code: 'PPL',
    },
    {
      name: 'Nawābganj', latitude: 26.87, longitude: 81.19, country_code: 'IN',
      admin1: 'Uttar Pradesh', admin2: 'Barabanki', admin3: 'Nawabganj', feature_code: 'PPL',
    },
    {
      name: 'Nawābganj', latitude: 28.53, longitude: 79.63, country_code: 'IN',
      admin1: 'Uttar Pradesh', admin2: 'Bareilly district', admin3: 'Nawabganj', feature_code: 'PPL',
    },
    {
      name: 'Nawabganj Airport', latitude: 26.88, longitude: 81.2, country_code: 'IN',
      admin1: 'Uttar Pradesh', admin2: 'Barabanki', feature_code: 'AIRP',
    },
  ],
};

test('parseSearch keeps Indian populated places and drops the rest', () => {
  const places = parseSearch(NAWABGANJ_SEARCH);

  assert.strictEqual(places.length, 2, 'Bangladesh hit and airport should be filtered out');
  assert.deepStrictEqual(
    places.map((p) => p.district),
    ['Barabanki', 'Bareilly']
  );
  // Diacritics the farmer never typed are stripped for display.
  assert.ok(places.every((p) => p.name === 'Nawabganj'));
  assert.strictEqual(places[0].state, 'Uttar Pradesh');
  // admin3 here only repeats the place name, so it is not shown twice.
  assert.strictEqual(places[0].subDistrict, '');
  assert.strictEqual(typeof places[0].lat, 'number');
});

test('parseSearch collapses duplicates of the same settlement', () => {
  const places = parseSearch({
    results: [
      { name: 'Sirsa', latitude: 29.53, longitude: 75.02, country_code: 'IN', admin1: 'Haryana', admin2: 'Sirsa', feature_code: 'PPL' },
      { name: 'Sirsa', latitude: 29.54, longitude: 75.03, country_code: 'IN', admin1: 'Haryana', admin2: 'Sirsa district', feature_code: 'PPLA2' },
    ],
  });
  assert.strictEqual(places.length, 1);
});

test('parseSearch rejects rows without usable coordinates', () => {
  const places = parseSearch({
    results: [
      { name: 'Nowhere', latitude: null, longitude: 75.0, country_code: 'IN', feature_code: 'PPL' },
      { name: 'Nowhere2', country_code: 'IN', feature_code: 'PPL' },
    ],
  });
  assert.strictEqual(places.length, 0);
});

test('parseSearch handles an empty result set', () => {
  assert.deepStrictEqual(parseSearch({}), []);
  assert.deepStrictEqual(parseSearch({ results: [] }), []);
});

// Trimmed from a live Nominatim response for "Sirsa" — the district boundary,
// the city inside it and the tehsil all share one name.
const SIRSA_NOMINATIM = [
  {
    name: 'Sirsa', class: 'boundary', type: 'administrative', lat: '29.4', lon: '75.1',
    address: { state_district: 'Sirsa', state: 'Haryana' },
  },
  {
    name: 'Sirsa', class: 'place', type: 'city', lat: '29.5353', lon: '75.0263',
    address: { county: 'Sirsa', state_district: 'Sirsa', state: 'Haryana' },
  },
];

test('parseNominatim prefers the settlement over the boundary of the same name', () => {
  const places = parseNominatim(SIRSA_NOMINATIM);

  assert.strictEqual(places.length, 1, 'the three Sirsa rows describe one place');
  // The city centre, not the district centroid tens of kilometres away.
  assert.strictEqual(places[0].lat, 29.5353);
  assert.strictEqual(places[0].lon, 75.0263);
  assert.strictEqual(places[0].district, 'Sirsa');
  assert.strictEqual(places[0].state, 'Haryana');
  // The tehsil only repeats the district here, so it is not shown twice.
  assert.strictEqual(places[0].subDistrict, '');
});

test('parseNominatim keeps same-named places in different districts apart', () => {
  const places = parseNominatim([
    {
      name: 'Nawabganj', class: 'boundary', type: 'administrative', lat: '26.87', lon: '81.19',
      address: { county: 'Nawabganj', state_district: 'Barabanki', state: 'Uttar Pradesh' },
    },
    {
      name: 'Nawabganj', class: 'boundary', type: 'administrative', lat: '28.53', lon: '79.63',
      address: { county: 'Nawabganj', state_district: 'Bareilly', state: 'Uttar Pradesh' },
    },
    {
      name: 'Nawabganj', class: 'place', type: 'village', lat: '26.2', lon: '87.1',
      address: { county: 'Narpatganj', state_district: 'Araria District', state: 'Bihar' },
    },
  ]);

  assert.strictEqual(places.length, 3);
  assert.deepStrictEqual(
    places.map((p) => p.district),
    // The Bihar village outranks the two boundaries and sorts first; its
    // district keeps the provider's "District" suffix off.
    ['Araria', 'Barabanki', 'Bareilly']
  );
  assert.strictEqual(places[0].subDistrict, 'Narpatganj');
});

test('parseNominatim discards non-place results and bad coordinates', () => {
  const places = parseNominatim([
    { name: 'Sirsa Medical Store', class: 'shop', type: 'chemist', lat: '29.5', lon: '75.0', address: {} },
    { name: 'Broken', class: 'place', type: 'village', lat: 'abc', lon: '75.0', address: {} },
    { name: 'NoCoords', class: 'place', type: 'village', address: {} },
  ]);
  assert.deepStrictEqual(places, []);
});

test('parseNominatim survives a non-array payload', () => {
  assert.deepStrictEqual(parseNominatim(null), []);
  assert.deepStrictEqual(parseNominatim({ error: 'nope' }), []);
});

test('cleanDistrict strips the provider suffix but not real names', () => {
  assert.strictEqual(cleanDistrict('Ludhiana district'), 'Ludhiana');
  assert.strictEqual(cleanDistrict('Bareilly District'), 'Bareilly');
  assert.strictEqual(cleanDistrict('Barabanki'), 'Barabanki');
  // "District" inside a name is left alone — only a trailing suffix goes.
  assert.strictEqual(cleanDistrict('District Bazar'), 'District Bazar');
});

test('stripDiacritics normalises transliterated place names', () => {
  assert.strictEqual(stripDiacritics('Nawābganj'), 'Nawabganj');
  assert.strictEqual(stripDiacritics('Bāra Bankī'), 'Bara Banki');
  assert.strictEqual(stripDiacritics(''), '');
});

test('coordinate validators reject out-of-range and non-numeric input', () => {
  assert.ok(isValidLat(26.9255));
  assert.ok(isValidLon(81.2045));
  assert.ok(!isValidLat(91));
  assert.ok(!isValidLat(NaN));
  assert.ok(!isValidLon(181));
  assert.ok(!isValidLon(Number('abc')));
});
