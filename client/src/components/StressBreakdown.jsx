import { useState } from 'react';

/**
 * The stress factor is a multiplier that can knock tens of percent off a yield
 * estimate, so "0.612" on its own invites exactly one question. This shows the
 * three components, the measurement behind each, and the arithmetic that turns
 * the baseline into the displayed estimate.
 *
 * Note on the maths: the model produces each component as a *reduction*, sums
 * them, and subtracts the total from 1 — they are not multiplied together.
 * Rendering them as multipliers would imply arithmetic the model does not do.
 */

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function Row({ label, reduction, detail }) {
  // A negative reduction is a small bonus — rain above requirement.
  const isBonus = reduction < 0;
  const none = Math.abs(reduction) < 0.0005;

  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-200 dark:border-white/5 last:border-0">
      <span className="text-slate-500 dark:text-slate-500 dark:text-slate-400 text-xs w-20 flex-shrink-0">{label}</span>
      <span
        className={`text-xs font-semibold tabular-nums w-16 text-right flex-shrink-0 ${
          none ? 'text-slate-500 dark:text-slate-400' : isBonus ? 'text-green-700 dark:text-agri-400' : 'text-red-600 dark:text-red-400'
        }`}
      >
        {none ? 'none' : `${isBonus ? '+' : '−'}${pct(Math.abs(reduction))}`}
      </span>
      <span className="text-slate-500 dark:text-slate-400 text-xs flex-1 text-right">{detail}</span>
    </div>
  );
}

export default function StressBreakdown({ breakdown, stressFactor, baselineYield, estimate, unit = 't/ha' }) {
  const [open, setOpen] = useState(false);

  const hasFactor = stressFactor !== null && stressFactor !== undefined;
  const decimals = unit === 'nuts/ha' ? 0 : 2;
  const stressed = hasFactor && stressFactor < 0.999;

  if (!hasFactor) {
    return (
      <div className="glass-card p-4">
        <p className="text-slate-500 dark:text-slate-500 dark:text-slate-400 text-xs mb-1">Stress Factor</p>
        <p className="text-slate-500 dark:text-slate-400 font-semibold">—</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!breakdown}
        className="w-full text-left disabled:cursor-default cursor-pointer"
      >
        <p className="text-slate-500 dark:text-slate-500 dark:text-slate-400 text-xs mb-1 flex items-center gap-1">
          Stress Factor
          {breakdown && <span className="text-slate-500 dark:text-slate-500 text-[10px]">{open ? '▾ hide' : '▸ why?'}</span>}
        </p>
        <p className={`font-semibold ${stressFactor < 0.8 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-agri-400'}`}>
          {stressFactor.toFixed(3)}
        </p>
      </button>

      {/* Arithmetic, always visible — the number means nothing without it */}
      {baselineYield != null && estimate != null && (
        <p className="text-slate-500 dark:text-slate-400 text-xs mt-2 tabular-nums">
          ML baseline {baselineYield.toFixed(decimals)} {unit} × stress {stressFactor.toFixed(3)} ={' '}
          <span className="text-slate-700 dark:text-slate-300">{estimate.toFixed(decimals)} {unit}</span>
        </p>
      )}

      {open && breakdown && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/10">
          <Row
            label="Heat"
            reduction={breakdown.heat_factor}
            detail={`${breakdown.hot_days} days above ${breakdown.upper_temp_c}°C`}
          />
          <Row
            label="Water"
            reduction={breakdown.water_factor}
            detail={
              breakdown.water_expected_mm
                ? `rainfall ${Math.round((breakdown.total_rainfall_mm / breakdown.water_expected_mm) * 100)}% of what the crop needs by now`
                : 'no requirement set'
            }
          />
          <Row
            label="Dry spell"
            reduction={breakdown.dry_spell_factor}
            detail={`longest dry run ${breakdown.longest_dry_run_days} days (tolerates ${breakdown.dry_tolerance_days})`}
          />

          <p className="text-slate-500 dark:text-slate-400 text-xs mt-2 leading-relaxed">
            Penalties are added, then subtracted from 1.
            {breakdown.clamped && (
              <span className="text-amber-700 dark:text-amber-400/90">
                {' '}They totalled more than the model allows, so the factor is held at its 0.5 floor —
                treat this as “severely stressed”, not as a precise figure.
              </span>
            )}
          </p>

          {stressed && !breakdown.clamped && (
            <p className="text-slate-500 dark:text-slate-500 text-xs mt-1">
              Rainfall is measured without knowing whether the field is irrigated.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
