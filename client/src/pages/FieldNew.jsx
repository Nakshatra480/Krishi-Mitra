import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createField, getCropCatalog } from '../api/fieldsApi';
import { cropLabel } from '../constants/crops';
import LocationPicker from '../components/LocationPicker';

// Shown as large buttons; the rest of the catalogue lives in the dropdown below.
const QUICK_PICKS = ['rice', 'wheat', 'maize', 'cotton(lint)', 'sugarcane', 'potato'];

/**
 * Returns the first thing wrong with the chosen location, or '' when it is
 * ready. Matched to what the server requires so a field never fails on submit
 * for something we could have said two steps earlier.
 */
function locationError(location) {
  const lat = Number(location.lat);
  const lon = Number(location.lon);

  if (location.lat === '' || location.lon === '') {
    return 'कृपया अपना स्थान चुनें / Please set your location';
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return 'निर्देशांक सही नहीं हैं / The coordinates are not valid';
  }
  if (!location.district?.trim() || !location.state?.trim()) {
    return 'कृपया जिला और राज्य भरें / Please enter district and state';
  }
  return '';
}

export default function FieldNew() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [crops, setCrops] = useState([]);

  useEffect(() => {
    getCropCatalog()
      .then((resp) => setCrops(resp.data.data.crops))
      .catch(() => {
        // Offline or server down: fall back to the quick picks so the form
        // still works rather than presenting an empty crop list.
        setCrops(QUICK_PICKS.map((value) => ({ value, label: cropLabel(value) })));
      });
  }, []);

  const [form, setForm] = useState({
    name: '', crop: '', variety: '',
    sowingDate: '', areaAcre: '',
    location: { district: '', state: '', lat: '', lon: '' },
    soil: { nitrogen: '', phosphorus: '', potassium: '', ph: '', testedOn: '' },
  });

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const updateSoil = (key, val) => setForm((f) => ({ ...f, soil: { ...f.soil, [key]: val } }));

  async function handleSubmit() {
    // Last line of defence: the location can still be edited after step 2, and
    // a rejected submit here would lose the whole form.
    const locationMessage = locationError(form.location);
    if (locationMessage) {
      setError(locationMessage);
      setStep(2);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        areaAcre: Number(form.areaAcre),
        location: {
          district: form.location.district.trim(),
          state: form.location.state.trim(),
          lat: Number(form.location.lat),
          lon: Number(form.location.lon),
        },
        soil: {
          nitrogen: Number(form.soil.nitrogen) || undefined,
          phosphorus: Number(form.soil.phosphorus) || undefined,
          potassium: Number(form.soil.potassium) || undefined,
          ph: Number(form.soil.ph) || undefined,
          testedOn: form.soil.testedOn || undefined,
        },
      };
      const resp = await createField(payload);
      navigate(`/fields/${resp.data.data.field._id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create field');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 transition-colors text-sm font-medium";

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-sans">नया खेत जोड़ें / Add New Field</h1>
        <div className="flex gap-2 mt-4">
          {['Crop', 'Location', 'Soil'].map((label, i) => (
            <div key={label} className={`flex-1 h-2 rounded-full transition-colors ${step > i ? 'bg-green-600' : step === i + 1 ? 'bg-green-500' : 'bg-slate-200 dark:bg-white/10'}`} />
          ))}
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-sm font-semibold mt-2">Step {step} of 3</p>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm mb-4 font-medium">{error}</div>}

      {/* Step 1: Crop */}
      {step === 1 && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white">फसल की जानकारी / Crop Details</h2>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">खेत का नाम / Field Name <span className="text-red-500">*</span></label>
            <input id="field-name" type="text" value={form.name} onChange={(e) => { update('name', e.target.value); if (error) setError(''); }} placeholder="e.g. North Field" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">फसल / Crop <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 gap-3">
              {QUICK_PICKS.map((value) => (
                <button key={value} type="button" onClick={() => { update('crop', value); if (error) setError(''); }}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${form.crop === value ? 'border-green-600 bg-green-50 text-green-800 font-bold dark:border-agri-500 dark:bg-agri-900/40 dark:text-agri-400 shadow-xs' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-400 dark:hover:border-white/30'}`}>
                  <span className="text-xs">{cropLabel(value)}</span>
                </button>
              ))}
            </div>
            <label htmlFor="crop-select" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mt-4 mb-1.5">
              या कोई और फसल चुनें / Or choose another crop
              {crops.length > 0 && <span className="text-slate-500 font-normal"> ({crops.length} available)</span>}
            </label>
            <select
              id="crop-select"
              value={form.crop || ''}
              onChange={(e) => {
                update('crop', e.target.value);
                if (error) setError('');
              }}
              className={`${inputClass} cursor-pointer`}
            >
              <option value="">— select crop —</option>
              {crops.map((c) => (
                <option key={c.value} value={c.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {cropLabel(c.value)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">किस्म / Variety (Optional)</label>
              <input type="text" value={form.variety} onChange={(e) => update('variety', e.target.value)} placeholder="e.g. Swarna, HD-2967" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">बुवाई तिथि / Sowing Date <span className="text-red-500">*</span></label>
              <input id="sowing-date" type="date" value={form.sowingDate} onChange={(e) => { update('sowingDate', e.target.value); if (error) setError(''); }} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">क्षेत्र (एकड़) / Area (acres) <span className="text-red-500">*</span></label>
            <input id="area-acre" type="number" step="0.1" min="0.1" value={form.areaAcre} onChange={(e) => { update('areaAcre', e.target.value); if (error) setError(''); }} placeholder="e.g. 2.5" className={inputClass} />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!form.name.trim()) {
                setError('कृपया खेत का नाम भरें / Please enter a Field Name');
                document.getElementById('field-name')?.focus();
                return;
              }
              if (!form.crop) {
                setError('कृपया फसल चुनें / Please select a Crop');
                return;
              }
              if (!form.sowingDate) {
                setError('कृपया बुवाई तिथि चुनें / Please select a Sowing Date');
                document.getElementById('sowing-date')?.focus();
                return;
              }
              if (!form.areaAcre || Number(form.areaAcre) <= 0) {
                setError('कृपया मान्य क्षेत्र दर्ज करें / Please enter a valid Area (acres)');
                document.getElementById('area-acre')?.focus();
                return;
              }
              setError('');
              setStep(2);
            }}
            className="w-full py-3.5 bg-green-700 hover:bg-green-600 text-white rounded-xl font-bold text-sm transition-colors cursor-pointer shadow-lg shadow-green-700/20 active:scale-[0.99] mt-2"
          >
            Next: Location →
          </button>
        </div>
      )}

      {/* Step 2: Location */}
      {step === 2 && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white">स्थान / Location</h2>
          <LocationPicker
            value={form.location}
            onChange={(location) => { setForm((f) => ({ ...f, location })); if (error) setError(''); }}
            inputClass={inputClass}
          />
          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(1)} className="flex-1 py-3 border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">← Back</button>
            <button
              type="button"
              onClick={() => {
                const message = locationError(form.location);
                if (message) {
                  setError(message);
                  return;
                }
                setError('');
                setStep(3);
              }}
              className="flex-1 py-3 bg-green-700 hover:bg-green-600 text-white rounded-xl font-bold transition-colors shadow-md shadow-green-700/20"
            >Next: Soil →</button>
          </div>
        </div>
      )}

      {/* Step 3: Soil (optional) */}
      {step === 3 && (
        <div className="glass-card p-6 space-y-5">
          <div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">मिट्टी परीक्षण / Soil Test</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 font-medium">Optional — skip if no soil test data available</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['nitrogen', 'नाइट्रोजन N (kg/ha)', '120'],
              ['phosphorus', 'फॉस्फोरस P (kg/ha)', '45'],
              ['potassium', 'पोटेशियम K (kg/ha)', '200'],
              ['ph', 'pH', '6.8'],
            ].map(([key, label, placeholder]) => (
              <div key={key}>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>
                <input type="number" step="0.1" value={form.soil[key]} onChange={(e) => updateSoil(key, e.target.value)} placeholder={placeholder} className={inputClass} />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">परीक्षण तिथि / Test Date</label>
            <input type="date" value={form.soil.testedOn} onChange={(e) => updateSoil('testedOn', e.target.value)} className={inputClass} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(2)} className="flex-1 py-3 border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">← Back</button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-3.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-md shadow-green-700/20"
            >
              {loading ? <><div className="spinner w-4 h-4" /> Creating & checking...</> : 'Create Field'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
