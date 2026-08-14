/**
 * One-time cleanup for events created before the de-duplication guard existed.
 *
 * Keeps the newest event per (fieldId, type, calendar day) and deletes the
 * rest. Safe to run more than once — after the first pass there is nothing
 * left to collapse.
 *
 *   node scripts/dedupEvents.js           # report only
 *   node scripts/dedupEvents.js --apply   # actually delete
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Event = require('../models/Event');

// STAGE_CHANGE is excluded for the same reason the runtime guard skips it: two
// stage transitions in one day are two real events, not a duplicate.
const EXEMPT_TYPES = ['STAGE_CHANGE'];

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('ERROR: MONGO_URI not set.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log(`Connected. Mode: ${apply ? 'APPLY (will delete)' : 'dry run (report only)'}`);

  const events = await Event.find({ type: { $nin: EXEMPT_TYPES } })
    .select('_id fieldId type createdAt')
    .sort({ createdAt: -1 })
    .lean();

  // Sorted newest first, so the first occurrence of each key is the keeper.
  const seen = new Set();
  const doomed = [];

  for (const ev of events) {
    const key = `${ev.fieldId}|${ev.type}|${dayKey(ev.createdAt)}`;
    if (seen.has(key)) doomed.push(ev._id);
    else seen.add(key);
  }

  console.log(`Scanned ${events.length} events across ${seen.size} unique field/type/day groups.`);
  console.log(`Duplicates found: ${doomed.length}`);

  if (doomed.length === 0) {
    console.log('Nothing to clean up.');
  } else if (apply) {
    const result = await Event.deleteMany({ _id: { $in: doomed } });
    console.log(`Deleted ${result.deletedCount} duplicate events.`);
  } else {
    console.log('Dry run — re-run with --apply to delete them.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('dedupEvents failed:', err.message);
  process.exit(1);
});
