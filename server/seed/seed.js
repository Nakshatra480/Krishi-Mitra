/**
 * Seed script — inserts demo farmer, admin, and a demo rice field at Barabanki.
 * Idempotent: skips if demo farmer already exists.
 * Run: node seed/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (_) {}
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Field = require('../models/Field');
const { runFieldCheck } = require('../services/fieldCheckService');

const DEMO_FARMER = {
  name: 'Ram Prasad',
  phone: '9999999999',
  password: 'demo1234',
  role: 'farmer',
  language: 'hi',
  district: 'Barabanki',
  state: 'Uttar Pradesh',
};

const DEMO_ADMIN = {
  name: 'KVK Officer',
  phone: '8888888888',
  password: 'admin1234',
  role: 'admin',
  language: 'en',
  district: 'Lucknow',
  state: 'Uttar Pradesh',
};

const DAY_MS = 86400000;
// Relative, not a fixed calendar date. A hardcoded sowing date silently rots:
// once it is more than a season old the field check pulls a year of weather,
// so the crop reads as 250% mature and the stress layer counts two summers of
// hot days and a winter dry spell. 70 days puts rice mid-season whenever the
// seed is run, and lands the sowing month inside Kharif for a monsoon demo.
const DAYS_SINCE_SOWING = 70;
const DAYS_SINCE_SOIL_TEST = 40;

// Demo field: Rice, Barabanki, sown ~70 days ago (PRD §18)
const DEMO_FIELD = {
  name: 'Barabanki Rice Field',
  crop: 'rice',
  // A rice variety, and one actually grown in eastern UP — the demo field is
  // in Barabanki. Must stay inside CROP_VARIETIES.rice or the model rejects it.
  variety: 'Sarjoo-52',
  sowingDate: new Date(Date.now() - DAYS_SINCE_SOWING * DAY_MS),
  areaAcre: 2.5,
  location: {
    district: 'Barabanki',
    state: 'Uttar Pradesh',
    lat: 26.9255,
    lon: 81.2045,
  },
  soil: {
    nitrogen: 120,
    phosphorus: 45,
    potassium: 200,
    ph: 6.8,
    // Inside the 90-day freshness window, so the demo exercises the fertiliser
    // path rather than tripping the stale-soil-test HOLD rule every time.
    testedOn: new Date(Date.now() - DAYS_SINCE_SOIL_TEST * DAY_MS),
  },
};

// The yield estimate is supposed to move across a season as weather lands, but
// a freshly seeded field has a single data point and the chart renders as one
// flat dot. These entries give the demo field a season's worth of history —
// a mid-season heat event pulling the estimate down — so the chart shows the
// thing it exists to show. The live check appends today's real estimate on top.
const DEMO_YIELD_TRACK = [
  { dayOffset: 0, estimate: 2.45, trigger: 'registration' },
  { dayOffset: 14, estimate: 2.52, trigger: 'scheduled_check' },
  { dayOffset: 28, estimate: 2.38, trigger: 'heat_stress' },
  { dayOffset: 42, estimate: 2.15, trigger: 'heat_stress' },
  { dayOffset: 56, estimate: 2.08, trigger: 'scheduled_check' },
];

/**
 * Spread the track between sowing and today. Offsets that would land in the
 * future are pulled back onto the real elapsed span, so the chart stays
 * chronological however long ago the demo field was sown.
 */
function buildYieldHistory(sowingDate, track) {
  const start = sowingDate.getTime();
  const elapsedDays = Math.max(1, Math.floor((Date.now() - start) / 86400000));
  const span = Math.max(...track.map((t) => t.dayOffset)) || 1;

  const history = track.map((entry) => ({
    date: new Date(start + (Math.min(entry.dayOffset, span) / span) * (elapsedDays * 0.85) * 86400000),
    estimate: entry.estimate,
    trigger: entry.trigger,
  }));

  history.push({ date: new Date(), estimate: 2.0, trigger: 'scheduled_check' });
  return history;
}

async function seed() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('ERROR: MONGO_URI not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Farmer
  let farmer = await User.findOne({ phone: DEMO_FARMER.phone });
  if (!farmer) {
    const passwordHash = await bcrypt.hash(DEMO_FARMER.password, 12);
    farmer = await User.create({ ...DEMO_FARMER, passwordHash });
    console.log(`Created demo farmer: ${farmer.phone}`);
  } else {
    console.log(`Demo farmer already exists: ${farmer.phone}`);
  }

  // Admin
  let admin = await User.findOne({ phone: DEMO_ADMIN.phone });
  if (!admin) {
    const passwordHash = await bcrypt.hash(DEMO_ADMIN.password, 12);
    admin = await User.create({ ...DEMO_ADMIN, passwordHash });
    console.log(`Created demo admin: ${admin.phone}`);
  } else {
    console.log(`Demo admin already exists: ${admin.phone}`);
  }

  // Demo field
  let field = await Field.findOne({ userId: farmer._id, name: DEMO_FIELD.name });
  if (!field) {
    field = await Field.create({
      ...DEMO_FIELD,
      userId: farmer._id,
      yieldHistory: buildYieldHistory(DEMO_FIELD.sowingDate, DEMO_YIELD_TRACK),
    });
    console.log(`Created demo field: ${field.name} (${field.yieldHistory.length} yield history points)`);

    console.log('Running initial field check (may take a moment)...');
    try {
      const result = await runFieldCheck(field._id);
      console.log(`Initial check done. Stage: ${result.stage}, GDD: ${result.cumGdd}`);
    } catch (err) {
      console.warn(`Initial check failed (will retry on next scheduled run): ${err.message}`);
    }
  } else {
    console.log(`Demo field already exists: ${field.name}`);
  }

  await mongoose.disconnect();
  console.log('\nSeed complete!');
  console.log('Demo farmer → phone: 9999999999  password: demo1234');
  console.log('Demo admin  → phone: 8888888888  password: admin1234');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
