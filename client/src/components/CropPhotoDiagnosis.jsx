import { useRef, useState } from 'react';
import { uploadPhoto } from '../api/fieldsApi';

/**
 * Crop photo diagnosis — the farmer's shortcut past describing a symptom in
 * words. Take a picture of the affected plant, get back what it looks like,
 * how bad it is, and where on the plant to look.
 *
 * The severity of each finding drives its colour, so the worst thing in the
 * photo is the first thing the eye lands on.
 */

const SEVERITY = {
  severe: {
    label: 'Severe',
    chip: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700/50',
    bar: 'bg-red-500',
  },
  moderate: {
    label: 'Moderate',
    chip: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700/50',
    bar: 'bg-amber-500',
  },
  low: {
    label: 'Low',
    chip: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700/40',
    bar: 'bg-yellow-500',
  },
  none: {
    label: 'Healthy',
    chip: 'bg-green-100 text-green-800 border-green-300 dark:bg-agri-900/60 dark:text-agri-300 dark:border-agri-700/50',
    bar: 'bg-green-500',
  },
};

const MAX_BYTES = 10 * 1024 * 1024;

function severityOf(key) {
  return SEVERITY[key] || SEVERITY.none;
}

function stageLabel(stage) {
  if (!stage || stage === 'unknown') return null;
  return stage.replace(/_/g, ' ');
}

export default function CropPhotoDiagnosis({ fieldId, onDiagnosed }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    setError('');
    setResult(null);

    if (!file.type.startsWith('image/')) {
      setError('कृपया कोई फ़ोटो चुनें / Please choose a photo');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('फ़ोटो बहुत बड़ी है (10MB तक) / Photo is too large (max 10MB)');
      return;
    }

    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const resp = await uploadPhoto(fieldId, formData);
      setResult(resp.data.data.visionResult);
      onDiagnosed?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Diagnosis failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPreview(null);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  const overall = result ? severityOf(result.overall_severity) : null;

  return (
    <div className="glass-card p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          फसल की जाँच फ़ोटो से / Photo Diagnosis
        </h3>
        {result && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white underline underline-offset-2 cursor-pointer"
          >
            नई फ़ोटो / New photo
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        // On a phone this opens the camera directly rather than the gallery.
        capture="environment"
        onChange={(e) => handleFile(e.target.files?.[0])}
        className="hidden"
        id="crop-photo-input"
      />

      {!preview && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full py-4 px-4 border-2 border-dashed border-slate-300 dark:border-white/15 rounded-xl text-slate-600 dark:text-slate-400 hover:border-green-600 dark:hover:border-agri-500 hover:text-green-700 dark:hover:text-agri-400 transition-colors cursor-pointer"
          >
            <span className="block text-sm font-semibold">रोगग्रस्त पौधे की फ़ोटो लें</span>
            <span className="block text-xs mt-0.5">Take a photo of the affected plant</span>
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Get close to the leaf or stem showing the problem, in daylight.
          </p>
        </>
      )}

      {preview && (
        <div className="flex gap-3">
          <img
            src={preview}
            alt="Uploaded crop"
            className="w-24 h-24 object-cover rounded-lg border border-slate-200 dark:border-white/10 flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <div className="spinner w-4 h-4" />
                जाँच हो रही है… / Analysing…
              </div>
            )}

            {!busy && result && !result.image_usable && (
              <div>
                <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded border bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600">
                  Could not read this photo
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {result.notes}
                </p>
              </div>
            )}

            {!busy && result && result.image_usable && (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${overall.chip}`}>
                    {overall.label}
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white capitalize">
                    {result.crop}
                  </span>
                  {result.confidence > 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {Math.round(result.confidence * 100)}% sure
                    </span>
                  )}
                  {stageLabel(result.stage) && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                      · {stageLabel(result.stage)}
                    </span>
                  )}
                </div>

                {/* Warn when the photo disagrees with the registered crop —
                    a diagnosis of the wrong plant is worse than none. */}
                {result.notes && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                    {result.notes}
                  </p>
                )}
              </div>
            )}

            {!busy && error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        </div>
      )}

      {!preview && error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>
      )}

      {/* Findings, worst first */}
      {!busy && result?.image_usable && result.problems?.length > 0 && (
        <ul className="mt-4 space-y-2">
          {result.problems.map((p, i) => {
            const s = severityOf(p.severity);
            return (
              <li
                key={`${p.name}-${i}`}
                className="border-l-2 pl-3 py-1 border-slate-200 dark:border-white/10"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white capitalize">
                    {p.name}
                  </span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${s.chip}`}>
                    {s.label}
                  </span>
                  {p.location && (
                    <span className="text-xs text-slate-600 dark:text-slate-400">on {p.location}</span>
                  )}
                </div>
                {p.coverage_pct > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="h-1 flex-1 max-w-[7rem] rounded bg-slate-200 dark:bg-white/10 overflow-hidden">
                      <div className={`h-full ${s.bar}`} style={{ width: `${Math.min(100, p.coverage_pct)}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                      ~{Math.round(p.coverage_pct)}% of crop
                    </span>
                  </div>
                )}
                {p.evidence && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{p.evidence}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!busy && result?.image_usable && result.problems?.length === 0 && (
        <p className="text-xs text-green-700 dark:text-agri-400 mt-3 font-medium">
          कोई समस्या नहीं दिखी / No visible problems in this photo
        </p>
      )}

      {result && (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
          AI diagnosis from one photo — confirm with your local agriculture officer before treating.
        </p>
      )}
    </div>
  );
}
