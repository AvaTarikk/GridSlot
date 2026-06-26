/**
 * @file forecast.service.ts
 * @description Statistical price forecasting for GridSlot congestion points.
 *
 * METHODOLOGY
 * -----------
 * This replaces ad-hoc decay/noise generation with a standard, explainable
 * time-series pipeline:
 *
 *   1. SEASONAL DECOMPOSITION (classical additive method)
 *      Clearing prices have a real day-of-week seasonal pattern — industrial
 *      demand (and therefore congestion pricing) is structurally lower on
 *      weekends. We estimate a seasonal index per day-of-week by averaging
 *      detrended observations falling on that weekday, then de-seasonalise
 *      the series before trend-fitting.
 *
 *   2. TREND ESTIMATION — OLS slope + Holt-smoothed level
 *      The trend (direction and cents/day) is estimated via ordinary least
 *      squares (OLS) regression over the full deseasonalized series. OLS
 *      weighs every observation equally, so it reflects the genuine overall
 *      direction of the series and cannot be flipped by a single noisy
 *      recent observation — unlike Holt's recursive trend update, which (in
 *      testing against synthetic data with an unambiguous 60-day uptrend)
 *      converged to a near-zero or even negative trend purely because of
 *      end-of-series noise outweighing 50+ days of consistent movement in
 *      the recursive smoothing pass. The series LEVEL (i.e. "where is the
 *      price right now") still uses Holt-style exponential smoothing, which
 *      is well-suited for tracking a current anchor point; only the trend
 *      slope itself comes from the more robust full-series OLS fit.
 *      Forecast h steps ahead: ŷ_{t+h} = level + h·trend
 *
 *   3. REASSEMBLY
 *      Forecast = Holt trend forecast + seasonal index for the target weekday.
 *
 *   4. CONFIDENCE INTERVALS
 *      Derived from the in-sample residual standard deviation (actual minus
 *      fitted-on-history) and widened with the square root of the forecast
 *      horizon — the standard convention for compounding forecast uncertainty
 *      in a random-walk-with-drift-style model, since per-step error variance
 *      accumulates additively and therefore the standard deviation scales
 *      with √h, not h or a flat constant.
 *
 *   5. SEVERITY CLASSIFICATION
 *      Buckets the forecasted price into GREEN / AMBER / RED using the
 *      point's own historical price TERCILES (33rd / 67th percentile) rather
 *      than a mean ± std heuristic, which breaks down for low-volatility
 *      points (a calm point's std can be tiny, misclassifying any slightly
 *      elevated day as the top band). Terciles are scale-invariant and
 *      always split history into three meaningfully-sized groups.
 *
 * WHY NOT ARIMA / Prophet / LSTM?
 * --------------------------------
 * Holt's method is the appropriate complexity level here: explainable in two
 * equations, no external forecasting library dependency, and statistically
 * sound for a series with trend + simple seasonality and ~90 days of history.
 * ARIMA needs stationarity testing/differencing and parameter search (p,d,q)
 * that isn't justified for daily aggregated mock-scale data; LSTM needs far
 * more training data than 90 daily points. This is documented as the
 * "MVP: rule-based/classical statistics, v3: ML" roadmap, consistent with
 * the existing 24h congestion.ts forecast module's documented roadmap.
 */

export interface HistoryPoint {
  date: string; // ISO yyyy-mm-dd
  clearing_price_cents: number;
  volume_mwh: number;
  trade_count: number;
}

export type Severity = 'GREEN' | 'AMBER' | 'RED';

/**
 * A HistoryPoint with severity attached. The input HistoryPoint type has no
 * severity field — raw trade/mock data doesn't carry a severity label, only
 * a price. Historical-day severity is derived here using the exact same
 * tercile thresholds applied to forecast days, so history and forecast stay
 * visually/semantically consistent (a €120 day is "RED" whether it's in the
 * past or the future, for this point).
 */
export interface AnnotatedHistoryPoint extends HistoryPoint {
  severity: Severity;
}

export interface ForecastPoint {
  date: string;
  predicted_price_cents: number;
  lower_bound_cents: number;
  upper_bound_cents: number;
  predicted_severity: Severity;
  confidence: number; // 0-100
}

export interface ForecastResult {
  history: AnnotatedHistoryPoint[];
  forecast: ForecastPoint[];
  stats: {
    avg_price_cents: number;
    peak_price_cents: number;
    low_price_cents: number;
    trend_7d_pct: number;
    total_volume_mwh: number;
    total_trades: number;
  };
  model_diagnostics: {
    method: string;
    alpha: number;
    residual_std_cents: number;
    seasonal_indices_cents: number[]; // index 0 = Sunday .. 6 = Saturday
    trend_direction: 'rising' | 'falling' | 'flat';
    trend_cents_per_day: number;
  };
}

/**
 * Computes day-of-week seasonal indices using classical decomposition:
 * detrend with a centered moving average, then average the detrended
 * values falling on each weekday. Indices are centered to sum to zero
 * across the week (so they adjust the trend up/down without shifting
 * the overall level).
 */
function computeSeasonalIndices(values: number[], dates: string[]): number[] {
  const WINDOW = 7;
  const half = Math.floor(WINDOW / 2);

  // Centered moving average as a simple trend estimate for detrending.
  // Falls back to the global mean at the series edges where a full window
  // isn't available.
  const globalMean = values.reduce((a, b) => a + b, 0) / values.length;
  const trendEstimate: number[] = values.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    if (end - start < WINDOW) return globalMean;
    const window = values.slice(start, end);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });

  const detrended = values.map((v, i) => v - trendEstimate[i]);

  const byWeekday: number[][] = Array.from({ length: 7 }, () => []);
  dates.forEach((d, i) => {
    const dow = new Date(d).getDay();
    byWeekday[dow].push(detrended[i]);
  });

  const rawIndices = byWeekday.map((group) =>
    group.length > 0 ? group.reduce((a, b) => a + b, 0) / group.length : 0
  );

  // Center so seasonal adjustments sum to zero (don't bias the overall level)
  const meanIndex = rawIndices.reduce((a, b) => a + b, 0) / rawIndices.length;
  return rawIndices.map((idx) => idx - meanIndex);
}

/**
 * Holt's linear (double exponential smoothing) trend model.
 *
 * NOTE ON TREND ROBUSTNESS: Holt's recursive trend update,
 *   b_t = β·(ℓ_t - ℓ_{t-1}) + (1-β)·b_{t-1}
 * is a weighted average that leans heavily on its own previous value. With a
 * conventional β (here 0.1), the *final* b_t can end up dominated by
 * whatever the last few residuals happened to do, even when the recursion
 * has had the whole series to converge — testing this implementation against
 * synthetic data with a clear, strong 60-day upward trend produced a final
 * trend estimate that was flat-to-negative, the opposite of the true signal,
 * because end-of-series noise outweighed 50+ days of consistent upward
 * movement in the recursive update. A single noisy step shouldn't be able to
 * flip the sign of a trend that's been positive for almost the entire series.
 *
 * Fix: use Holt's recursion for the LEVEL (it converges well and is the
 * correct anchor for "where is the series right now"), but estimate the
 * TREND via ordinary least squares (OLS) slope over the full deseasonalized
 * series instead. OLS uses every observation with equal-by-design weighting
 * (not recency-biased) and is the standard robust choice for "what is the
 * overall direction over this window" — exactly the question the forecast
 * needs answered, and it can't be flipped by a single late outlier the way
 * a single recursive smoothing pass can.
 */
function holtLinear(values: number[], alpha = 0.3) {
  if (values.length < 2) {
    const v = values[0] ?? 0;
    return { level: v, trend: 0, residuals: [0] };
  }

  // Level: standard exponential smoothing using the OLS trend (computed below)
  // as the recursion's drift term, so the level still tracks recent data
  // closely while the trend itself comes from the robust full-series fit.
  const trend = olsSlope(values);

  let level = values[0];
  const residuals: number[] = [0];
  for (let t = 1; t < values.length; t++) {
    const forecastForT = level + trend;
    residuals.push(values[t] - forecastForT);
    level = alpha * values[t] + (1 - alpha) * (level + trend);
  }

  return { level, trend, residuals };
}

/**
 * Ordinary least squares slope (cents per day) over an evenly-spaced series.
 * Standard closed-form: slope = Σ(x-x̄)(y-ȳ) / Σ(x-x̄)².
 */
function olsSlope(values: number[]): number {
  const n = values.length;
  const xMean = (n - 1) / 2; // x = 0..n-1
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    numerator += dx * (values[i] - yMean);
    denominator += dx * dx;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Classifies a price into GREEN/AMBER/RED using the historical distribution's
 * terciles (33rd/67th percentile) rather than mean±std, which is scale-
 * invariant and robust for both volatile and calm congestion points.
 */
function severityFromTerciles(price: number, sortedHistory: number[]): Severity {
  const n = sortedHistory.length;
  const p33 = sortedHistory[Math.floor(n * 0.33)];
  const p67 = sortedHistory[Math.floor(n * 0.67)];
  if (price >= p67) return 'RED';
  if (price <= p33) return 'GREEN';
  return 'AMBER';
}

/**
 * Produces a 14-day forecast for one congestion point from its full price
 * history, using seasonal decomposition + Holt's linear trend.
 *
 * @param history - chronological (oldest-first) daily price history
 * @param horizonDays - number of days to forecast forward (default 14)
 */
export function forecastCongestionPoint(history: HistoryPoint[], horizonDays = 14): ForecastResult {
  if (history.length < 14) {
    throw new Error('At least 14 days of history are required to fit a seasonal trend model');
  }

  const dates = history.map((h) => h.date);
  const prices = history.map((h) => h.clearing_price_cents);

  const seasonalIndices = computeSeasonalIndices(prices, dates);
  const deseasonalized = prices.map((p, i) => p - seasonalIndices[new Date(dates[i]).getDay()]);

  const { level, trend, residuals } = holtLinear(deseasonalized);

  // Residual std (skip the first unscored point) drives confidence intervals
  const scoredResiduals = residuals.slice(1);
  const residualMean = scoredResiduals.reduce((a, b) => a + b, 0) / scoredResiduals.length;
  const residualVariance =
    scoredResiduals.reduce((a, b) => a + (b - residualMean) ** 2, 0) / scoredResiduals.length;
  const residualStd = Math.sqrt(residualVariance);

  const lastDate = new Date(dates[dates.length - 1]);
  const sortedPrices = [...prices].sort((a, b) => a - b);

  const PRICE_FLOOR_CENTS = 1000; // sanity floor — prices shouldn't forecast to near-zero

  const forecast: ForecastPoint[] = Array.from({ length: horizonDays }, (_, i) => {
    const h = i + 1;
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + h);
    const dow = futureDate.getDay();

    const trendForecast = level + h * trend;
    const predicted = Math.max(PRICE_FLOOR_CENTS, Math.round(trendForecast + seasonalIndices[dow]));

    // Forecast error variance compounds with horizon for a drift-style model:
    // sd(h) = residualStd * sqrt(h). This is the standard random-walk-with-
    // drift confidence interval convention, not an arbitrary widening factor.
    const intervalWidth = residualStd * Math.sqrt(h) * 1.28; // 1.28 ≈ 80% interval (z-ish band, kept simple/explainable)
    const lower = Math.max(PRICE_FLOOR_CENTS, Math.round(predicted - intervalWidth));
    const upper = Math.round(predicted + intervalWidth);

    // Confidence decays with horizon (more uncertainty further out) but is
    // floored — we never claim near-zero confidence, matching the existing
    // 24h congestion forecast's documented floor convention.
    const confidence = Math.max(50, Math.round(95 - h * 2.8));

    return {
      date: futureDate.toISOString().slice(0, 10),
      predicted_price_cents: predicted,
      lower_bound_cents: lower,
      upper_bound_cents: upper,
      predicted_severity: severityFromTerciles(predicted, sortedPrices),
      confidence,
    };
  });

  // Trend stats for the response (7d vs prior 7d, matching the existing
  // dashboard convention so cards stay self-consistent)
  const last7 = prices.slice(-7);
  const prev7 = prices.slice(-14, -7);
  const last7Avg = last7.reduce((a, b) => a + b, 0) / last7.length;
  const prev7Avg = prev7.length ? prev7.reduce((a, b) => a + b, 0) / prev7.length : last7Avg;
  const trend7dPct = prev7Avg > 0 ? Math.round(((last7Avg - prev7Avg) / prev7Avg) * 1000) / 10 : 0;

  const trendDirection: 'rising' | 'falling' | 'flat' =
    Math.abs(trend) < residualStd * 0.05 ? 'flat' : trend > 0 ? 'rising' : 'falling';

  const annotatedHistory: AnnotatedHistoryPoint[] = history.map((h) => ({
    ...h,
    severity: severityFromTerciles(h.clearing_price_cents, sortedPrices),
  }));

  return {
    history: annotatedHistory,
    forecast,
    stats: {
      avg_price_cents: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      peak_price_cents: Math.max(...prices),
      low_price_cents: Math.min(...prices),
      trend_7d_pct: trend7dPct,
      total_volume_mwh: history.reduce((a, h) => a + h.volume_mwh, 0),
      total_trades: history.reduce((a, h) => a + h.trade_count, 0),
    },
    model_diagnostics: {
      method: 'seasonal_decomposition_ols_trend_v2',
      alpha: 0.3,
      residual_std_cents: Math.round(residualStd),
      seasonal_indices_cents: seasonalIndices.map((v) => Math.round(v)),
      trend_direction: trendDirection,
      trend_cents_per_day: Math.round(trend * 10) / 10,
    },
  };
}