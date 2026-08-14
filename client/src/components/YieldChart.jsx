import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// What produced each estimate, in words a farmer recognises rather than the
// enum the pipeline stores.
const TRIGGER_LABELS = {
  registration: 'Field registered',
  scheduled_check: 'Scheduled check',
  routine_check: 'Routine check',
  heat_stress: 'Heat stress detected',
  dry_spell: 'Dry spell detected',
  heavy_rain: 'Heavy rain detected',
  hazard_alert: 'Hazard warning',
  yield_shift: 'Yield shift',
  stage_change: 'Stage change',
};

function triggerLabel(trigger) {
  if (!trigger) return null;
  // The pipeline can store several comma-joined triggers for one check.
  return trigger
    .split(',')
    .map((t) => TRIGGER_LABELS[t.trim()] || t.trim().replace(/_/g, ' '))
    .join(' · ');
}

const DATE_FORMAT = { day: '2-digit', month: 'short' };

// `unit` is the field's own yield unit — not every crop is tonnes/ha.
const CustomTooltip = ({ active, payload, unit = 't/ha' }) => {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const decimals = unit === 'nuts/ha' ? 0 : 2;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg shadow-lg text-sm">
      <p className="text-slate-600 dark:text-slate-400 text-xs font-medium">{point.fullDate}</p>
      <p className="text-green-700 dark:text-agri-400 font-bold text-sm">
        {point.yield?.toFixed(decimals)} {unit}
      </p>
      {point.trigger && (
        <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">{point.trigger}</p>
      )}
    </div>
  );
};

export default function YieldChart({ history, unit = 't/ha' }) {
  if (!history || history.length < 2) {
    return (
      <div className="glass-card p-4 text-center text-slate-500 dark:text-slate-400 text-sm py-8">
        <p className="font-medium">Estimate history will appear after the next check</p>
        <p className="text-xs mt-1">अगली जाँच के बाद अनुमान का इतिहास दिखेगा</p>
      </div>
    );
  }

  // Oldest first, so the line reads left to right however the API ordered it.
  const data = [...history]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((h) => ({
      date: new Date(h.date).toLocaleDateString('en-IN', DATE_FORMAT),
      fullDate: new Date(h.date).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric',
      }),
      yield: h.estimate,
      trigger: triggerLabel(h.trigger),
    }));

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Yield Evolution / उपज विकास</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            tick={{ fill: '#64748b', fontSize: 11 }}
            minTickGap={12}
          />
          <YAxis
            stroke="#94a3b8"
            tick={{ fill: '#64748b', fontSize: 11 }}
            unit={` ${unit}`}
            width={70}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip unit={unit} />} />
          <Line
            type="monotone"
            dataKey="yield"
            stroke="#16a34a"
            strokeWidth={2.5}
            dot={{ fill: '#16a34a', r: 4 }}
            activeDot={{ r: 6, fill: '#22c55e' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
