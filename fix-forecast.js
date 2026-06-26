/**
 * fix-forecast.js
 *
 * Regenerates the `forecast` array for every congestion point in
 * mock-data/price-history.json.
 *
 * THE BUG:
 * The original forecast was generated as a pure decay from the last
 * historical price toward zero (predicted[i] = predicted[i-1] * decay + noise),
 * with no anchor to the point's own historical average. Every point — RED,
 * AMBER, or GREEN — ends up sliding down to a low floor and flatlining there
 * by day 3-4, regardless of how congested it actually is.
 *
 * THE FIX:
 * Each forecast day now mean-reverts toward that specific point's own
 * recent (last 30 days) average price, with day-to-day random-walk noise
 * scaled to the point's own historical volatility (its stddev). Severity-
 * appropriate bounds keep RED points elevated/volatile, AMBER roughly flat,
 * GREEN low — matching what's already true in each point's `history` array,
 * instead of one shared decay curve applied to everyone.
 *
 * Usage:
 *   node fix-forecast.js
 *   (run from repo root, or adjust FILE_PATH below)
 */

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.resolve(process.cwd(), 'mock-data/price-history.json');

// Deterministic seeded random so re-running gives consistent (not flickering) results
function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  // Convert to [0,1)
  return (Math.abs(h % 100000)) / 100000;
}

function gaussianNoise(seed, std) {
  // Box-Muller using two seeded uniforms derived from the seed
  const u1 = Math.max(1e-6, seededRandom(seed + 'a'));
  const u2 = seededRandom(seed + 'b');
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * std;
}

/**
 * Derives severity thresholds from the point's own historical data, by finding
 * the price boundaries between its actual GREEN/AMBER/RED days. This avoids the
 * bug where thresholding on ±0.5*std misclassifies low-volatility points (where
 * std is tiny) as RED for any price that's even slightly above their own mean.
 */
function severityThresholds(history) {
  const bySeverity = { GREEN: [], AMBER: [], RED: [] };
  for (const d of history) {
    if (bySeverity[d.severity]) bySeverity[d.severity].push(d.clearing_price_cents);
  }
  const avgOf = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const greenAvg = avgOf(bySeverity.GREEN);
  const amberAvg = avgOf(bySeverity.AMBER);
  const redAvg = avgOf(bySeverity.RED);

  // Boundaries sit halfway between adjacent observed-severity averages.
  // Fall back to overall avg/std-based spacing if a severity band never occurred.
  const allPrices = history.map(d => d.clearing_price_cents);
  const overallAvg = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
  const variance = allPrices.reduce((a, b) => a + (b - overallAvg) ** 2, 0) / allPrices.length;
  const overallStd = Math.sqrt(variance) || overallAvg * 0.1;

  const greenAmberBoundary =
    greenAvg !== null && amberAvg !== null ? (greenAvg + amberAvg) / 2 : overallAvg - overallStd * 0.4;
  const amberRedBoundary =
    amberAvg !== null && redAvg !== null ? (amberAvg + redAvg) / 2 : overallAvg + overallStd * 0.4;

  return { greenAmberBoundary, amberRedBoundary };
}

function severityFromPrice(price, thresholds) {
  if (price >= thresholds.amberRedBoundary) return 'RED';
  if (price <= thresholds.greenAmberBoundary) return 'GREEN';
  return 'AMBER';
}

function fixPoint(point) {
  const history = point.history;
  const recent = history.slice(-30);
  const prices = recent.map(d => d.clearing_price_cents);

  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((a, b) => a + (b - avg) ** 2, 0) / prices.length;
  const std = Math.max(Math.sqrt(variance), avg * 0.03); // floor: at least 3% of avg
  const thresholds = severityThresholds(recent);

  const lastPrice = history[history.length - 1].clearing_price_cents;
  const lastDate = new Date(history[history.length - 1].date);

  const DAYS = 14; // always generate a full 14-day forecast horizon
  const newForecast = [];

  // Each day is sampled independently around a target center, rather than carried
  // forward as a running random walk. The target blends the last actual price
  // (more influence on day 1) with the point's own historical average (more
  // influence further out) — so day 1 looks like a continuation of recent reality,
  // while later days oscillate around the point's true average, the same way the
  // historical `history` array oscillates day to day instead of smoothly decaying.
  for (let i = 0; i < DAYS; i++) {
    const date = new Date(lastDate);
    date.setDate(date.getDate() + i + 1);
    const dateStr = date.toISOString().slice(0, 10);

    const seedKey = `${point.congestion_point_id}-${i}`;

    // Blend weight shifts from "anchored on last price" (day 1) to "anchored on
    // historical average" (day 14), so there's no abrupt jump but also no decay-to-zero
    const blendToAvg = Math.min(1, i / 6); // fully blended into avg by day ~6
    const center = lastPrice * (1 - blendToAvg) + avg * blendToAvg;

    // Independent noise per day (not compounding) — same style of day-to-day
    // swings as the real history, scaled to this point's own volatility.
    // Noise widens slightly with horizon so later days (fully blended to `avg`)
    // keep oscillating like real history instead of settling near-flat.
    const noise = gaussianNoise(seedKey, std * (0.85 + i * 0.02));

    const predicted = Math.max(1500, Math.round(center + noise));

    // Confidence still decays with horizon, but bounded sensibly (55%-92%)
    const confidence = Math.max(55, Math.round(92 - i * 2.6));

    // Uncertainty band widens with horizon, scaled off historical volatility
    const bandWidth = std * (0.6 + i * 0.05);
    const lower = Math.max(1000, Math.round(predicted - bandWidth));
    const upper = Math.round(predicted + bandWidth);

    newForecast.push({
      date: dateStr,
      predicted_price_cents: predicted,
      lower_bound_cents: lower,
      upper_bound_cents: upper,
      predicted_severity: severityFromPrice(predicted, thresholds),
      confidence,
    });
  }

  point.forecast = newForecast;

  // Recompute stats.trend_7d_pct off real history so it's consistent too
  if (point.stats) {
    const last7 = prices.slice(-7);
    const prev7 = prices.slice(-14, -7);
    if (last7.length && prev7.length) {
      const last7Avg = last7.reduce((a, b) => a + b, 0) / last7.length;
      const prev7Avg = prev7.reduce((a, b) => a + b, 0) / prev7.length;
      point.stats.trend_7d_pct = Math.round(((last7Avg - prev7Avg) / prev7Avg) * 1000) / 10;
    }
  }

  return point;
}

function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`File not found at ${FILE_PATH}`);
    console.error('Run this script from your repo root, or edit FILE_PATH at the top of the script.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));

  const fixed = data.map(fixPoint);

  // Backup original before overwriting
  const backupPath = FILE_PATH.replace('.json', `.backup.${Date.now()}.json`);
  fs.copyFileSync(FILE_PATH, backupPath);
  console.log(`Backed up original to: ${backupPath}`);

  fs.writeFileSync(FILE_PATH, JSON.stringify(fixed, null, 2));
  console.log(`Fixed forecast arrays for ${fixed.length} congestion points.`);
  console.log(`Wrote: ${FILE_PATH}`);

  // Print a sample so you can sanity-check immediately
  console.log('\nSample (first point, first 5 forecast days):');
  console.log(JSON.stringify(fixed[0].forecast.slice(0, 5), null, 2));
}

main();
