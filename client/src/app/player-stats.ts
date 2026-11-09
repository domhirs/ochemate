import { MatchRecord } from './api';
import { Dart, MatchConfig, Mode, applyDart, checkoutRoutes, newState } from './game-logic';

export interface PlayerStats {
  matches: number;
  wins: number;
  /** x01 matches only: the rest of the numbers come from x01 visits. */
  x01Matches: number;
  visits180: number;
  /** 140 to 179. */
  visits140: number;
  /** 100 to 139. */
  visits100: number;
  highestVisit: number;
  points: number;
  darts: number;
  first9Points: number;
  first9Darts: number;
  /** Visits that started on a finishable score (3-dart checkout exists). */
  checkoutAttempts: number;
  checkoutHits: number;
  highestCheckout: number;
  legsWon: number;
  /** Darts needed for each leg won; best leg is the minimum. */
  legDartsTotal: number;
  bestLeg: number | null;
}

export function emptyStats(): PlayerStats {
  return {
    matches: 0,
    wins: 0,
    x01Matches: 0,
    visits180: 0,
    visits140: 0,
    visits100: 0,
    highestVisit: 0,
    points: 0,
    darts: 0,
    first9Points: 0,
    first9Darts: 0,
    checkoutAttempts: 0,
    checkoutHits: 0,
    highestCheckout: 0,
    legsWon: 0,
    legDartsTotal: 0,
    bestLeg: null,
  };
}

/** One completed turn of an x01 player. A bust counts as three darts and scores nothing. */
export interface Visit {
  player: number;
  total: number;
  darts: number;
  bust: boolean;
  /** Turn started on a score that can be checked out with three darts. */
  attempt: boolean;
  legWon: boolean;
  /** Darts this player needed in the leg when it was won, else 0. */
  legDarts: number;
  /** Position of this visit within the player's leg, starting at 0. */
  indexInLeg: number;
  /** Remaining score when the visit started. */
  startScore: number;
}

/** One dart and the x01 situation it was thrown in (remaining is 0 outside x01). */
export interface ThrowRecord {
  player: number;
  dart: Dart;
  remaining: number;
  /** x01 double-in: the player had already opened (always true without double-in). */
  opened: boolean;
  /** This dart won the leg. */
  finished: boolean;
}

export interface MatchAnalysis {
  winner: number | null;
  visits: Visit[];
  throws: ThrowRecord[];
}

/** Replays the darts once and records every dart and every x01 visit. Cricket and Around the Clock have no visits. */
export function analyzeMatch(config: MatchConfig, darts: Dart[]): MatchAnalysis {
  const s = newState(config);
  const visits: Visit[] = [];
  const throws: ThrowRecord[] = [];
  const isX01 = config.mode === 'x01';
  const legDarts = config.players.map(() => 0);
  const legVisits = config.players.map(() => 0);
  let attempt = false;
  let startScore = 0;

  for (const dart of darts) {
    if (s.winner !== null) break;
    const prevLast = s.lastTurn;
    const prevLeg = s.leg;
    const thrower = s.current;
    const p = s.players[thrower];
    const open = !config.x01.doubleIn || p.opened;
    if (isX01 && s.turn.length === 0) {
      attempt = open && p.score >= 2 && p.score <= 170 && checkoutRoutes(p.score, 3, config.x01.out, 1).length > 0;
      startScore = p.score;
    }
    const remaining = isX01 ? p.score : 0;
    applyDart(s, dart);
    const finished = s.leg !== prevLeg || (s.winner !== null && s.lastTurn !== prevLast && !s.lastTurn!.bust);
    throws.push({ player: thrower, dart, remaining, opened: open, finished });
    if (!isX01 || s.lastTurn === prevLast) continue;

    const lt = s.lastTurn!;
    const legWon = !lt.bust && (s.leg !== prevLeg || s.winner !== null);
    const visitDarts = lt.bust ? 3 : lt.darts.length;
    legDarts[lt.player] += visitDarts;
    visits.push({
      player: lt.player,
      total: lt.bust ? 0 : lt.total,
      darts: visitDarts,
      bust: lt.bust,
      attempt,
      legWon,
      legDarts: legWon ? legDarts[lt.player] : 0,
      indexInLeg: legVisits[lt.player]++,
      startScore,
    });
    if (s.leg !== prevLeg) {
      legDarts.fill(0);
      legVisits.fill(0);
    }
  }
  return { winner: s.winner, visits, throws };
}

function addMatch(stats: PlayerStats, config: MatchConfig, a: MatchAnalysis, index: number): void {
  stats.matches++;
  if (a.winner === index) stats.wins++;
  if (config.mode !== 'x01') return;
  stats.x01Matches++;

  for (const v of a.visits) {
    if (v.player !== index) continue;
    stats.darts += v.darts;
    stats.points += v.total;
    if (v.total === 180) stats.visits180++;
    else if (v.total >= 140) stats.visits140++;
    else if (v.total >= 100) stats.visits100++;
    stats.highestVisit = Math.max(stats.highestVisit, v.total);
    if (v.indexInLeg < 3) {
      stats.first9Points += v.total;
      stats.first9Darts += v.darts;
    }
    if (v.attempt) {
      stats.checkoutAttempts++;
      if (v.legWon) stats.checkoutHits++;
    }
    if (v.legWon) {
      stats.highestCheckout = Math.max(stats.highestCheckout, v.total);
      stats.legsWon++;
      stats.legDartsTotal += v.legDarts;
      stats.bestLeg = stats.bestLeg === null ? v.legDarts : Math.min(stats.bestLeg, v.legDarts);
    }
  }
}

/** A game with a single player is training: it never counts towards match stats. */
export type StatsKind = 'match' | 'training';

export const isTraining = (config: MatchConfig): boolean => config.players.length === 1;

const ofKind = (m: MatchRecord, kind: StatsKind): boolean => isTraining(m.config) === (kind === 'training');

/** Stats per saved player id, from every game of that kind that links the player. Guests are ignored. */
export function statsByProfile(matches: MatchRecord[], kind: StatsKind = 'match'): Map<string, PlayerStats> {
  const out = new Map<string, PlayerStats>();
  for (const m of matches) {
    const ids = m.config.playerIds;
    if (!ids?.some((id) => id) || !ofKind(m, kind)) continue;
    const analysis = analyzeMatch(m.config, m.darts);
    ids.forEach((id, i) => {
      if (!id) return;
      let stats = out.get(id);
      if (!stats) out.set(id, (stats = emptyStats()));
      addMatch(stats, m.config, analysis, i);
    });
  }
  return out;
}

export const avg3 = (points: number, darts: number): number | null => (darts ? (points / darts) * 3 : null);

/** Training sessions per saved player id. */
export function trainingCounts(matches: MatchRecord[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of matches) {
    const id = m.config.playerIds?.[0];
    if (id && isTraining(m.config)) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

export interface VisitRange {
  label: string;
  min: number;
  max: number;
  count: number;
}

/** Inclusive bounds, highest first. Busts are counted apart. */
const RANGES: [string, number, number][] = [
  ['180', 180, 180],
  ['140–179', 140, 179],
  ['100–139', 100, 139],
  ['80–99', 80, 99],
  ['60–79', 60, 79],
  ['40–59', 40, 59],
  ['0–39', 0, 39],
];

export interface DoubleStat {
  /** 1-20, or 25 for the bull. */
  n: number;
  attempts: number;
  hits: number;
}

export interface LegPoint {
  /** Visit number in the leg, starting at 1. */
  visit: number;
  avg: number;
  samples: number;
}

export interface AdvancedStats {
  base: PlayerStats;
  /** x01 visits, busts included. */
  visits: number;
  busts: number;
  ranges: VisitRange[];
  /** Every dart in every mode, misses included. */
  throws: number;
  misses: number;
  /** Hits per board field, key `n:m`. */
  board: Map<string, number>;
  /** Darts at a finishing double, by double (double-out x01 only). */
  doubles: DoubleStat[];
  /** 3-dart average per visit in the leg, scoring visits only. */
  legCurve: LegPoint[];
  /** Visits started above 170, where every dart is meant to score. */
  scoring: { visits: number; sixtyPlus: number; tonPlus: number };
}

export const boardKey = (n: number, m: number): string => `${n}:${m}`;

/** Fewer visits than this at a position of the leg make the curve too noisy to draw. */
const MIN_CURVE_SAMPLES = 5;

/** The double a dart must hit to finish from `remaining`, or null when no single double does. */
export function finishingDouble(remaining: number): number | null {
  if (remaining === 50) return 25;
  return remaining >= 2 && remaining <= 40 && remaining % 2 === 0 ? remaining / 2 : null;
}

/** Narrows the games an advanced stats run looks at. Matches without a finish time never pass a `since` bound. */
export interface StatsFilter {
  mode: Mode | 'all';
  /** Only games finished at or after this time (ms since epoch). */
  since: number | null;
}

export const NO_FILTER: StatsFilter = { mode: 'all', since: null };

const finishedMs = (m: MatchRecord): number | null => {
  const t = m.finishedAt ? Date.parse(m.finishedAt) : NaN;
  return Number.isNaN(t) ? null : t;
};

const passes = (m: MatchRecord, f: StatsFilter): boolean => {
  if (f.mode !== 'all' && m.config.mode !== f.mode) return false;
  if (f.since === null) return true;
  const t = finishedMs(m);
  return t !== null && t >= f.since;
};

export interface TrendPoint {
  /** Finish time, ms since epoch. */
  t: number;
  /** 3-dart average of this game. */
  avg: number;
  /** Dart-weighted 3-dart average over this and the previous games (moving average). */
  ma: number;
}

export interface Trend {
  points: TrendPoint[];
  /** Average of the last `days` against the `days` before, null when either side has too little data. */
  change: { days: number; recent: number; before: number; recentGames: number; beforeGames: number } | null;
}

/** Games in the moving average window. */
export const TREND_WINDOW = 10;
/** Fewer x01 games than this in a window make the comparison meaningless. */
const MIN_TREND_GAMES = 3;

/** 3-dart average per x01 game over time with a moving average, and the change over the last `days` days. */
export function avgTrend(matches: MatchRecord[], profileId: string, kind: StatsKind, days = 90, now = Date.now()): Trend {
  const games: { t: number; points: number; darts: number }[] = [];
  for (const m of matches) {
    const t = finishedMs(m);
    if (t === null || m.config.mode !== 'x01' || !ofKind(m, kind)) continue;
    const index = m.config.playerIds?.indexOf(profileId) ?? -1;
    if (index < 0) continue;
    let points = 0;
    let darts = 0;
    for (const v of analyzeMatch(m.config, m.darts).visits) {
      if (v.player !== index) continue;
      points += v.total;
      darts += v.darts;
    }
    if (darts) games.push({ t, points, darts });
  }
  games.sort((a, b) => a.t - b.t);

  const sum = (g: { points: number; darts: number }[]) => avg3(g.reduce((n, x) => n + x.points, 0), g.reduce((n, x) => n + x.darts, 0));
  const points = games.map((g, i) => ({
    t: g.t,
    avg: avg3(g.points, g.darts)!,
    ma: sum(games.slice(Math.max(0, i - TREND_WINDOW + 1), i + 1))!,
  }));

  const span = days * 86_400_000;
  const recent = games.filter((x) => x.t >= now - span);
  const before = games.filter((x) => x.t >= now - 2 * span && x.t < now - span);
  const change =
    recent.length >= MIN_TREND_GAMES && before.length >= MIN_TREND_GAMES
      ? { days, recent: sum(recent)!, before: sum(before)!, recentGames: recent.length, beforeGames: before.length }
      : null;
  return { points, change };
}

/** Everything the advanced stats page shows for one saved player, from games of one kind. */
export function advancedStats(
  matches: MatchRecord[],
  profileId: string,
  kind: StatsKind,
  filter: StatsFilter = NO_FILTER,
): AdvancedStats {
  const base = emptyStats();
  const board = new Map<string, number>();
  const doubles = new Map<number, DoubleStat>();
  const ranges = RANGES.map(([label, min, max]) => ({ label, min, max, count: 0 }));
  const curve: { points: number; darts: number; samples: number }[] = [];
  let visits = 0;
  let busts = 0;
  let throws = 0;
  let misses = 0;
  const scoring = { visits: 0, sixtyPlus: 0, tonPlus: 0 };

  for (const m of matches) {
    if (!ofKind(m, kind) || !passes(m, filter)) continue;
    const index = m.config.playerIds?.indexOf(profileId) ?? -1;
    if (index < 0) continue;
    const a = analyzeMatch(m.config, m.darts);
    addMatch(base, m.config, a, index);
    const doubleOut = m.config.mode === 'x01' && m.config.x01.out === 'double';

    for (const t of a.throws) {
      if (t.player !== index) continue;
      throws++;
      if (t.dart.m === 0) misses++;
      else board.set(boardKey(t.dart.n, t.dart.m), (board.get(boardKey(t.dart.n, t.dart.m)) ?? 0) + 1);
      const target = doubleOut && t.opened ? finishingDouble(t.remaining) : null;
      if (target === null) continue;
      let d = doubles.get(target);
      if (!d) doubles.set(target, (d = { n: target, attempts: 0, hits: 0 }));
      d.attempts++;
      if (t.finished) d.hits++;
    }

    for (const v of a.visits) {
      if (v.player !== index) continue;
      visits++;
      if (v.bust) busts++;
      else ranges.find((r) => v.total >= r.min && v.total <= r.max)!.count++;
      // Only visits that could not finish: setup and checkout darts would drag the curve down.
      if (v.startScore <= 170) continue;
      scoring.visits++;
      if (v.total >= 60) scoring.sixtyPlus++;
      if (v.total >= 100) scoring.tonPlus++;
      const c = (curve[v.indexInLeg] ??= { points: 0, darts: 0, samples: 0 });
      c.points += v.total;
      c.darts += v.darts;
      c.samples++;
    }
  }

  const legCurve: LegPoint[] = [];
  for (let i = 0; i < curve.length; i++) {
    const c = curve[i];
    if (!c || c.samples < MIN_CURVE_SAMPLES) break;
    legCurve.push({ visit: i + 1, avg: avg3(c.points, c.darts)!, samples: c.samples });
  }

  return {
    base,
    visits,
    busts,
    ranges,
    throws,
    misses,
    board,
    doubles: [...doubles.values()].sort((x, y) => y.attempts - x.attempts || y.n - x.n),
    legCurve,
    scoring,
  };
}
