import { AdvancedStats, LegPoint, StatsKind, avg3, boardKey } from './player-stats';

export interface Takeaways {
  strengths: string[];
  weaknesses: string[];
}

/** Below these sample sizes a rule stays silent instead of guessing. */
const MIN_DARTS = 30;
const MIN_DOUBLE_ATTEMPTS = 10;
const MIN_PER_DOUBLE = 5;
const MIN_CHECKOUTS = 10;
const MIN_SEGMENT_DARTS = 30;
const MIN_SCORING_VISITS = 15;

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const fix = (v: number): string => v.toFixed(1);
const weighted = (ps: LegPoint[]): number => ps.reduce((s, p) => s + p.avg * p.samples, 0) / ps.reduce((s, p) => s + p.samples, 0);
const doubleName = (n: number): string => (n === 25 ? 'Bull' : `D${n}`);

/** Darts that landed in the segment of `n`, any ring. */
function segment(adv: AdvancedStats, n: number): number {
  return [1, 2, 3].reduce((sum, m) => sum + (adv.board.get(boardKey(n, m)) ?? 0), 0);
}

/**
 * Rule-based strengths and weaknesses. `other` is the same player's stats from the other kind
 * (training when looking at matches and the other way round), used to compare the two.
 */
export function takeaways(adv: AdvancedStats, kind: StatsKind, other: AdvancedStats | null): Takeaways {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const b = adv.base;
  const avg = avg3(b.points, b.darts);

  // Visits 1-3 against 4-6 only: later visits come from few, long legs and are mostly noise.
  // Visits 4-6 above 170 come from legs that started badly, so they drift up towards the mean:
  // a drop is a real signal, a rise is not reported.
  const curve = adv.legCurve;
  if (curve.length >= 4) {
    const early = weighted(curve.slice(0, 3));
    const late = weighted(curve.slice(3, 6));
    if (early - late >= 8) weaknesses.push(`Scoring fades in long legs: ${fix(early)} in visits 1–3, ${fix(late)} in visits 4–6.`);
  }

  const sc = adv.scoring;
  if (sc.visits >= MIN_SCORING_VISITS) {
    const ton = sc.tonPlus / sc.visits;
    const sixty = sc.sixtyPlus / sc.visits;
    if (ton >= 0.25) strengths.push(`Heavy scorer: ${pct(ton)} of scoring visits are 100 or more.`);
    if (sixty >= 0.7) strengths.push(`Consistent: ${pct(sixty)} of scoring visits reach 60.`);
    else if (sixty < 0.35) weaknesses.push(`Only ${pct(sixty)} of scoring visits reach 60. Steady 60s win more legs than the odd ton.`);
  }

  const attempts = adv.doubles.reduce((s, d) => s + d.attempts, 0);
  if (attempts >= MIN_DOUBLE_ATTEMPTS) {
    const hits = adv.doubles.reduce((s, d) => s + d.hits, 0);
    const rate = hits / attempts;
    if (rate >= 0.35) strengths.push(`Reliable on the doubles: ${pct(rate)} of darts at a finishing double go in.`);
    else if (rate < 0.15) weaknesses.push(`Doubles are the bottleneck: ${pct(rate)} of darts at a finishing double go in.`);
    const rated = adv.doubles.filter((d) => d.attempts >= MIN_PER_DOUBLE).map((d) => ({ ...d, rate: d.hits / d.attempts }));
    if (rated.length >= 2) {
      rated.sort((x, y) => y.rate - x.rate || y.attempts - x.attempts);
      const best = rated[0];
      const worst = rated[rated.length - 1];
      if (best.rate - rate >= 0.1) strengths.push(`${doubleName(best.n)} is your best double: ${best.hits} of ${best.attempts} (${pct(best.rate)}). Set up for it.`);
      if (rate - worst.rate >= 0.1) weaknesses.push(`${doubleName(worst.n)} rarely goes in: ${worst.hits} of ${worst.attempts} (${pct(worst.rate)}). Try to leave a different double.`);
    }
  }

  if (b.checkoutAttempts >= MIN_CHECKOUTS) {
    const rate = b.checkoutHits / b.checkoutAttempts;
    if (rate >= 0.4) strengths.push(`Clinical finisher: ${pct(rate)} of visits on a finish close the leg.`);
    else if (rate < 0.15) weaknesses.push(`Finishing costs legs: ${pct(rate)} of visits on a finish close the leg.`);
  }

  // 1 lies clockwise of the 20 (to the right as seen from the oche), 5 counter-clockwise.
  const s20 = segment(adv, 20);
  const s1 = segment(adv, 1);
  const s5 = segment(adv, 5);
  const top = s20 + s1 + s5;
  if (top >= MIN_SEGMENT_DARTS) {
    const off = (s1 + s5) / top;
    if (off >= 0.4) {
      const side = s1 >= 2 * s5 ? ', mostly right into the 1' : s5 >= 2 * s1 ? ', mostly left into the 5' : '';
      weaknesses.push(`${pct(off)} of darts around the top miss the 20${side}.`);
    } else if (off <= 0.2) {
      strengths.push(`Tight grouping on the 20: only ${pct(off)} drift into the 1 or 5.`);
    }
  }

  const g20 = top;
  const g19 = segment(adv, 19) + segment(adv, 7) + segment(adv, 3);
  if (g20 >= MIN_SEGMENT_DARTS && g19 >= MIN_SEGMENT_DARTS) {
    const t20 = (adv.board.get(boardKey(20, 3)) ?? 0) / g20;
    const t19 = (adv.board.get(boardKey(19, 3)) ?? 0) / g19;
    if (t19 - t20 >= 0.05) strengths.push(`Your T19 (${pct(t19)}) is more reliable than your T20 (${pct(t20)}). Switch when the 20 is blocked or not going in.`);
  }

  const otherAvg = other ? avg3(other.base.points, other.base.darts) : null;
  if (avg !== null && otherAvg !== null && b.darts >= MIN_DARTS && other!.base.darts >= MIN_DARTS) {
    const matchAvg = kind === 'match' ? avg : otherAvg;
    const trainAvg = kind === 'match' ? otherAvg : avg;
    const gap = trainAvg - matchAvg;
    if (gap >= 5) weaknesses.push(`Match average ${fix(matchAvg)} is ${fix(gap)} below training (${fix(trainAvg)}). Pressure costs points.`);
    else if (gap <= -2) strengths.push(`Raises the game in matches: ${fix(matchAvg)} against ${fix(trainAvg)} in training.`);
  }

  return { strengths, weaknesses };
}
