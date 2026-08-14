import { useEffect, useRef, useState } from 'react';
import { reverseGeocode, searchPlaces } from '../api/geoApi';
import { getCurrentPosition } from '../utils/geolocation';

/**
 * Field location, without asking a farmer for coordinates.
 *
 * Three ways in, in the order a farmer should meet them:
 *   1. one tap on "use my location" — GPS fills everything
 *   2. type a village name — for when the field is not where they are standing
 *   3. type lat/lon by hand — folded away, for staff and for when both fail
 *
 * Every path ends in the same confirmation card showing a place name, because
 * "Barabanki, Uttar Pradesh" is checkable by the person entering it and
 * "26.9255" is not.
 */

// Long enough that a farmer typing "Barabanki" fires one search, not nine.
const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;

// ~11 m. Far finer than the weather grid these coordinates feed, and it keeps
// the confirmation card readable.
const COORD_DECIMALS = 4;

function roundCoord(value) {
  return Number(Number(value).toFixed(COORD_DECIMALS));
}

function CrosshairIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <line x1="12" y1="1" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="23" />
      <line x1="1" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="23" y2="12" />
    </svg>
  );
}

function CheckIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

export default function LocationPicker({ value, onChange, inputClass }) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [accuracyM, setAccuracyM] = useState(null);
  const [placeLabel, setPlaceLabel] = useState('');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);

  const [showManual, setShowManual] = useState(false);
  const [showNameFields, setShowNameFields] = useState(false);

  const hasCoords = value.lat !== '' && value.lon !== '';
  // Coordinates alone are not enough to save the field, and they are the half
  // the farmer cannot supply from memory — so say so the moment we know.
  const namesMissing = hasCoords && (!value.district || !value.state);
  // Open on demand, but never leave a farmer stuck behind a collapsed section
  // holding the only fields still blocking them.
  const nameFieldsOpen = showNameFields || namesMissing;

  const requestId = useRef(0);

  async function handleUseMyLocation() {
    setLocating(true);
    setGeoError('');
    setSearchError('');
    try {
      const pos = await getCurrentPosition();
      const lat = roundCoord(pos.lat);
      const lon = roundCoord(pos.lon);
      setAccuracyM(pos.accuracyM ? Math.round(pos.accuracyM) : null);

      // Coordinates land first: even if naming fails the farmer keeps the part
      // that actually drives the weather model.
      let next = { ...value, lat, lon };
      onChange(next);

      try {
        const resp = await reverseGeocode(lat, lon);
        const loc = resp.data.data.location;
        setPlaceLabel(loc.place || '');
        next = {
          ...next,
          district: loc.district || next.district,
          state: loc.state || next.state,
        };
        onChange(next);
        if (!loc.district || !loc.state) setShowNameFields(true);
      } catch {
        setShowNameFields(true);
        setGeoError(
          'स्थान मिल गया, पर जिला अपने आप नहीं भर पाया — नीचे भरें / Location found, but the district could not be filled in — please enter it below'
        );
      }
    } catch (err) {
      setGeoError(err.message);
    } finally {
      setLocating(false);
    }
  }

  // Debounced village search. requestId guards against an early, slow response
  // overwriting the results of a later query.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      setSearched(false);
      setSearchError('');
      return undefined;
    }

    const id = ++requestId.current;
    setSearching(true);
    setSearchError('');

    const timer = setTimeout(async () => {
      try {
        const resp = await searchPlaces(trimmed);
        if (id !== requestId.current) return;
        setResults(resp.data.data.places);
      } catch {
        if (id !== requestId.current) return;
        setResults([]);
        setSearchError('खोज अभी काम नहीं कर रही / Search is unavailable right now');
      } finally {
        if (id === requestId.current) {
          setSearching(false);
          setSearched(true);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  function handlePickPlace(place) {
    setPlaceLabel(place.name);
    setAccuracyM(null);
    setGeoError('');
    onChange({
      ...value,
      lat: roundCoord(place.lat),
      lon: roundCoord(place.lon),
      district: place.district,
      state: place.state,
    });
    setQuery('');
    setResults([]);
    setSearched(false);
    setShowNameFields(!place.district || !place.state);
  }

  function handleClear() {
    setPlaceLabel('');
    setAccuracyM(null);
    setGeoError('');
    setShowNameFields(false);
    onChange({ district: '', state: '', lat: '', lon: '' });
  }

  function updateField(key, val) {
    onChange({ ...value, [key]: val });
  }

  return (
    <div className="space-y-5">
      {/* Chosen location — the same card however it was chosen */}
      {hasCoords ? (
        <div className="rounded-xl border border-agri-700/60 bg-agri-900/25 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-agri-400 shrink-0"><CheckIcon /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-agri-400 font-medium">स्थान चुना गया / Location set</p>
              <p className="text-white font-semibold truncate mt-0.5">
                {placeLabel || value.district || 'आपका स्थान / Your location'}
              </p>
              {(value.district || value.state) && (
                <p className="text-sm text-slate-300 truncate">
                  {[value.district, value.state].filter(Boolean).join(', ')}
                </p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                {value.lat}, {value.lon}
                {accuracyM != null && <span> · ±{accuracyM} m</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="text-sm text-slate-400 hover:text-white underline underline-offset-2 shrink-0 cursor-pointer"
            >
              बदलें / Change
            </button>
          </div>

          {!nameFieldsOpen && (
            <button
              type="button"
              onClick={() => setShowNameFields(true)}
              className="mt-3 text-sm text-slate-400 hover:text-white underline underline-offset-2 cursor-pointer"
            >
              सही करें / Correct district or state
            </button>
          )}

          {namesMissing && (
            <p className="mt-3 text-sm text-amber-400">
              जिला और राज्य भरना ज़रूरी है / District and state are still needed
            </p>
          )}

          {nameFieldsOpen && (
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label htmlFor="loc-district" className="block text-sm text-slate-300 mb-1">
                  जिला / District <span className="text-red-400">*</span>
                </label>
                <input
                  id="loc-district"
                  type="text"
                  value={value.district}
                  onChange={(e) => updateField('district', e.target.value)}
                  placeholder="Barabanki"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="loc-state" className="block text-sm text-slate-300 mb-1">
                  राज्य / State <span className="text-red-400">*</span>
                </label>
                <input
                  id="loc-state"
                  type="text"
                  value={value.state}
                  onChange={(e) => updateField('state', e.target.value)}
                  placeholder="Uttar Pradesh"
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locating}
            className="w-full py-4 px-4 bg-agri-600 hover:bg-agri-500 disabled:opacity-60 text-white rounded-xl font-semibold transition-colors cursor-pointer shadow-lg hover:shadow-agri-500/20 active:scale-[0.99] flex items-center justify-center gap-3"
          >
            {locating ? <div className="spinner w-5 h-5" /> : <CrosshairIcon />}
            {locating ? 'स्थान लिया जा रहा है… / Getting location…' : 'मेरा स्थान इस्तेमाल करें / Use my location'}
          </button>
          <p className="text-xs text-slate-500 -mt-3 text-center">
            खेत पर खड़े होकर दबाएँ / Tap this while standing at your field
          </p>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-slate-500">या / or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div>
            <label htmlFor="place-search" className="block text-sm text-slate-300 mb-1">
              अपना गाँव या शहर खोजें / Search your village or town
            </label>
            <input
              id="place-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Barabanki, Ludhiana, Warangal…"
              className={inputClass}
              autoComplete="off"
            />

            {searching && <p className="text-xs text-slate-500 mt-2">खोज रहे हैं… / Searching…</p>}
            {searchError && <p className="text-xs text-amber-400 mt-2">{searchError}</p>}
            {!searching && !searchError && searched && results.length === 0 && (
              <p className="text-xs text-slate-500 mt-2">
                कुछ नहीं मिला — दूसरा नाम आज़माएँ / No matches — try a nearby town
              </p>
            )}

            {results.length > 0 && (
              <ul className="mt-2 border border-white/10 rounded-lg divide-y divide-white/5 overflow-hidden">
                {results.map((place) => (
                  <li key={`${place.name}-${place.district}-${place.lat}-${place.lon}`}>
                    <button
                      type="button"
                      onClick={() => handlePickPlace(place)}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <span className="block text-white text-sm font-medium">{place.name}</span>
                      <span className="block text-xs text-slate-400">
                        {[place.subDistrict, place.district, place.state].filter(Boolean).join(', ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {geoError && (
        <div className="bg-amber-900/30 border border-amber-800/60 text-amber-300 px-4 py-3 rounded-lg text-sm">
          {geoError}
        </div>
      )}

      {/* Manual coordinates stay available but out of the way — the old form
          asked every farmer for these; now only staff and rescue cases see them. */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowManual((s) => !s)}
          className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 cursor-pointer"
        >
          {showManual ? 'छिपाएँ / Hide' : 'निर्देशांक खुद भरें / Enter coordinates manually'}
        </button>

        {showManual && (
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label htmlFor="loc-lat" className="block text-sm text-slate-300 mb-1">अक्षांश / Latitude</label>
              <input
                id="loc-lat"
                type="number"
                step="0.0001"
                value={value.lat}
                onChange={(e) => updateField('lat', e.target.value)}
                placeholder="26.9255"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="loc-lon" className="block text-sm text-slate-300 mb-1">देशांतर / Longitude</label>
              <input
                id="loc-lon"
                type="number"
                step="0.0001"
                value={value.lon}
                onChange={(e) => updateField('lon', e.target.value)}
                placeholder="81.2045"
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
