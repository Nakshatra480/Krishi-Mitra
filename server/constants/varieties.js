/**
 * Released varieties per crop.
 *
 * Single source of truth for the whole stack: the Field model validates against
 * it, the crop catalogue endpoint serves it, and the Add Field form builds its
 * dropdown from it. Keeping one table is what stops a wheat line (the IARI
 * "HD-" series) being offered for, or saved against, a rice field.
 *
 * A crop absent from this table has no curated list yet — variety stays free
 * text for those rather than blocking the farmer behind an empty dropdown.
 */
const CROP_VARIETIES = {
  rice: ['Sona Masuri (BPT-5204)', 'MTU-1010', 'Jyothi', 'IR-64', 'Sarjoo-52'],
  wheat: ['HD-2967', 'HD-3086', 'PBW-343', 'Lok-1'],
  maize: ['DHM-117', 'Ganga-5', 'HQPM-1'],
};

/** Varieties for a crop, or an empty array when the crop has no curated list. */
function varietiesFor(crop) {
  return CROP_VARIETIES[String(crop || '').toLowerCase()] || [];
}

/**
 * True when `variety` may be stored against `crop`. Anything on a crop with no
 * curated list is accepted — the table is a whitelist where one exists, not a
 * claim to know every variety in India.
 */
function isValidVariety(crop, variety) {
  const list = varietiesFor(crop);
  if (list.length === 0) return true;
  return list.includes(String(variety).trim());
}

module.exports = { CROP_VARIETIES, varietiesFor, isValidVariety };
