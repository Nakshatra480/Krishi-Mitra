const ACTION_STYLES = {
  APPLY:   { bg: 'bg-green-50/70 dark:bg-agri-900/60', border: 'border-green-300 dark:border-agri-700', text: 'text-green-800 dark:text-agri-400' },
  HARVEST: { bg: 'bg-amber-50/70 dark:bg-earth-50/5',  border: 'border-amber-300 dark:border-earth-600', text: 'text-amber-800 dark:text-earth-400' },
  WAIT:    { bg: 'bg-blue-50/70 dark:bg-blue-900/40', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-800 dark:text-blue-400'  },
  HOLD:    { bg: 'bg-red-50/70 dark:bg-red-900/30',  border: 'border-red-300 dark:border-red-800',  text: 'text-red-800 dark:text-red-400'   },
  NONE:    { bg: 'bg-slate-50 dark:bg-slate-800/40',border: 'border-slate-300 dark:border-slate-700',text: 'text-slate-700 dark:text-slate-400' },
};

/**
 * A blocked action is the safety layer doing its job, so it must not read as a
 * malfunction. The old wording described the outcome from the code's point of
 * view, which a reader takes as "the system broke"; these describe it from the
 * farmer's, where a block is a correct and reassuring result.
 */
function safetyStatus(advisory) {
  if (advisory.validatorPassed === false) {
    return {
      label: '🛡 Blocked by Safety Rule',
      className: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700/50',
    };
  }
  if (advisory.proposedAction && advisory.finalAction !== advisory.proposedAction) {
    return {
      label: '⚠ Changed by Challenger',
      className: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700/50',
    };
  }
  return {
    label: '✓ Safety Checks Passed',
    className: 'bg-green-100 text-green-800 border-green-300 dark:bg-agri-900/60 dark:text-agri-300 dark:border-agri-700/50',
  };
}

export default function AdvisoryPanel({ advisory, eventEvidence }) {
  if (!advisory) return null;

  const action = advisory.finalAction || 'NONE';
  const style = ACTION_STYLES[action] || ACTION_STYLES.NONE;
  const safety = safetyStatus(advisory);
  // An objection only earns the full callout when it actually moved the
  // decision; one discarded below threshold gets a single quiet line.
  const objection = advisory.challengerObjection;
  const hasObjection = objection && objection !== 'No objection';
  // The server records this directly. Records written before it existed fall
  // back to inferring it from whether the action moved.
  const objectionApplied = hasObjection && (
    advisory.objectionApplied === undefined
      ? advisory.finalAction !== advisory.proposedAction
      : advisory.objectionApplied === true
  );

  return (
    <div className={`glass-card p-5 border ${style.border} ${style.bg} fade-in`}>
      <div className="flex items-center gap-3 mb-4">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white text-base">Advisory / सलाह</h3>
          <p className={`text-sm font-bold ${style.text}`}>Final Action: {action}</p>
        </div>
        <span className={`ml-auto px-2.5 py-1 text-xs font-semibold rounded-lg border ${safety.className}`}>
          {safety.label}
        </span>
      </div>

      <div className="space-y-3 text-sm">
        {/* Proposed action */}
        <div>
          <p className="text-slate-600 dark:text-slate-400 text-xs font-medium mb-1">Proposed / प्रस्तावित</p>
          <p className="text-slate-900 dark:text-white font-semibold">{advisory.proposedAction || 'No proposal'}</p>
        </div>

        {/* Challenger objection — full callout only when it changed the action */}
        {objectionApplied && (
          <div className="bg-amber-50 dark:bg-yellow-900/20 border border-amber-200 dark:border-yellow-800/40 rounded-lg p-3">
            <p className="text-amber-800 dark:text-yellow-400 text-xs font-bold mb-1">Challenger Objection / चुनौती</p>
            <p className="text-slate-800 dark:text-slate-300 text-xs leading-relaxed">{objection}</p>
          </div>
        )}
        {hasObjection && !objectionApplied && (
          <p className="text-slate-500 text-xs">
            Challenger raised an objection — evidence below action threshold, proposal retained
          </p>
        )}

        {/* Decision reason */}
        <div className="bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-transparent rounded-lg p-3">
          <p className="text-slate-600 dark:text-slate-400 text-xs font-medium mb-1">Decision Reason / निर्णय का कारण</p>
          <p className="text-slate-800 dark:text-slate-300 text-xs leading-relaxed">{advisory.decisionReason}</p>
        </div>

        {/* Safety footer */}
        <div className="flex items-start gap-2 text-xs pt-1">
          <span className="text-green-700 dark:text-agri-400 font-bold flex-shrink-0">✓</span>
          <span className="text-slate-500 dark:text-slate-400">
            Safety check working as designed — deterministic code has final authority
          </span>
        </div>
      </div>
    </div>
  );
}
