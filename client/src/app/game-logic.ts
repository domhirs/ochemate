export type Mode = 'x01' | 'cricket' | 'atc';
export type OutMode = 'straight' | 'double' | 'master';

/** n: 1-20 or 25 (bull), m: multiplier 1-3 (bull max 2). m=0 is a miss (n=0). */
export interface Dart {
  n: number;
  m: 0 | 1 | 2 | 3;
}

export interface X01Options {
  start: number;
  doubleIn: boolean;
  out: OutMode;
  legs: number;
}

export interface MatchConfig {
  mode: Mode;
  players: string[];
  x01: X01Options;
}

export interface PlayerState {
  name: string;
  legs: number;
  /** x01: remaining. cricket: points. atc: index of the next target in ATC_SEQUENCE. */
  score: number;
  marks: Partial<Record<number, number>>;
  opened: boolean;
  darts: number;
  points: number;
  oneEighties: number;
  hundredPlus: number;
  highCheckout: number;
}

export interface TurnSummary {
  player: number;
  darts: Dart[];
  total: number;
  bust: boolean;
}

export interface GameState {
  config: MatchConfig;
  players: PlayerState[];
  current: number;
  turn: Dart[];
  turnStart: number;
  legStarter: number;
  leg: number;
  winner: number | null;
  lastTurn: TurnSummary | null;
}

export const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25];
export const ATC_SEQUENCE = [...Array.from({ length: 20 }, (_, i) => i + 1), 25];

export function defaultConfig(): MatchConfig {
  return {
    mode: 'x01',
    players: ['Player 1', 'Player 2'],
    x01: { start: 501, doubleIn: false, out: 'double', legs: 1 },
  };
}

export function newState(config: MatchConfig): GameState {
  const start = config.mode === 'x01' ? config.x01.start : 0;
  return {
    config,
    players: config.players.map((name) => ({
      name,
      legs: 0,
      score: start,
      marks: {},
      opened: false,
      darts: 0,
      points: 0,
      oneEighties: 0,
      hundredPlus: 0,
      highCheckout: 0,
    })),
    current: 0,
    turn: [],
    turnStart: start,
    legStarter: 0,
    leg: 1,
    winner: null,
    lastTurn: null,
  };
}

export function replay(config: MatchConfig, darts: Dart[]): GameState {
  const s = newState(config);
  for (const d of darts) applyDart(s, d);
  return s;
}

function validOut(out: OutMode, d: Dart): boolean {
  if (out === 'straight') return true;
  if (out === 'double') return d.m === 2;
  return d.m >= 2;
}

function endTurn(s: GameState, total: number, bust: boolean): void {
  s.lastTurn = { player: s.current, darts: s.turn, total, bust };
  s.turn = [];
  s.current = (s.current + 1) % s.players.length;
}

/** Mutates `s`. Callers replay from scratch instead of reverting, so undo is just popping a dart. */
export function applyDart(s: GameState, d: Dart): void {
  if (s.winner !== null) return;
  if (s.turn.length === 0) s.turnStart = s.players[s.current].score;
  s.turn.push(d);
  const p = s.players[s.current];
  p.darts++;
  if (s.config.mode === 'x01') applyX01(s, p, d);
  else if (s.config.mode === 'cricket') applyCricket(s, p, d);
  else applyAtc(s, p, d);
}

function applyX01(s: GameState, p: PlayerState, d: Dart): void {
  const o = s.config.x01;
  let scored = d.n * d.m;
  if (o.doubleIn && !p.opened) {
    if (d.m === 2) p.opened = true;
    else scored = 0;
  }
  const remaining = p.score - scored;
  const bust = remaining < 0 || (remaining === 1 && o.out !== 'straight') || (remaining === 0 && !validOut(o.out, d));

  if (bust) {
    p.score = s.turnStart;
    p.darts += 3 - s.turn.length;
    endTurn(s, 0, true);
    return;
  }
  p.score = remaining;
  const finished = remaining === 0;
  if (!finished && s.turn.length < 3) return;

  const total = s.turnStart - p.score;
  p.points += total;
  if (total === 180) p.oneEighties++;
  if (total >= 100) p.hundredPlus++;

  if (!finished) {
    endTurn(s, total, false);
    return;
  }
  p.highCheckout = Math.max(p.highCheckout, total);
  p.legs++;
  s.lastTurn = { player: s.current, darts: s.turn, total, bust: false };
  if (p.legs >= o.legs) {
    s.winner = s.current;
    s.turn = [];
    return;
  }
  s.leg++;
  s.legStarter = (s.legStarter + 1) % s.players.length;
  s.current = s.legStarter;
  s.turn = [];
  for (const q of s.players) {
    q.score = o.start;
    q.opened = false;
  }
}

function applyCricket(s: GameState, p: PlayerState, d: Dart): void {
  if (d.m > 0 && CRICKET_NUMBERS.includes(d.n)) {
    const have = p.marks[d.n] ?? 0;
    const closing = Math.min(d.m, Math.max(0, 3 - have));
    const extra = d.m - closing;
    p.marks[d.n] = Math.min(3, have + d.m);
    const open = s.players.some((q) => q !== p && (q.marks[d.n] ?? 0) < 3);
    if (extra > 0 && open) p.score += extra * d.n;
  }
  const allClosed = CRICKET_NUMBERS.every((n) => (p.marks[n] ?? 0) >= 3);
  const ahead = s.players.every((q) => q === p || p.score >= q.score);
  if (allClosed && ahead) {
    s.winner = s.current;
    s.lastTurn = { player: s.current, darts: s.turn, total: 0, bust: false };
    s.turn = [];
    return;
  }
  if (s.turn.length === 3) endTurn(s, 0, false);
}

function applyAtc(s: GameState, p: PlayerState, d: Dart): void {
  if (d.m > 0 && d.n === ATC_SEQUENCE[p.score]) p.score++;
  if (p.score >= ATC_SEQUENCE.length) {
    s.winner = s.current;
    s.lastTurn = { player: s.current, darts: s.turn, total: 0, bust: false };
    s.turn = [];
    return;
  }
  if (s.turn.length === 3) endTurn(s, 0, false);
}

export interface HistoryEntry {
  /** 1-based, counts every turn of every player. */
  turn: number;
  player: number;
  dart: Dart;
  /** Player score right after the dart (x01 remaining, cricket points, atc target index). */
  after: number;
  bust: boolean;
  /** This dart won the match. */
  win: boolean;
}

/** Every dart of the match with its outcome. Same replay as `replay`, so undo needs no extra bookkeeping. */
export function buildHistory(config: MatchConfig, darts: Dart[]): HistoryEntry[] {
  const s = newState(config);
  const out: HistoryEntry[] = [];
  let turn = 0;
  for (const dart of darts) {
    if (s.winner !== null) break;
    if (s.turn.length === 0) turn++;
    const player = s.current;
    const prev = s.lastTurn;
    applyDart(s, dart);
    out.push({
      turn,
      player,
      dart,
      after: s.players[player].score,
      bust: s.lastTurn !== prev && s.lastTurn!.bust,
      win: s.winner !== null,
    });
  }
  return out;
}

export function dartLabel(d: Dart): string {
  if (d.m === 0) return 'Miss';
  if (d.n === 25) return d.m === 2 ? 'Bull' : '25';
  return `${d.m === 3 ? 'T' : d.m === 2 ? 'D' : 'S'}${d.n}`;
}

export function threeDartAvg(p: PlayerState): number {
  return p.darts ? (p.points / p.darts) * 3 : 0;
}

// ---- Checkout suggestions -------------------------------------------------

const CHECKOUT_DARTS: Dart[] = [];
for (let n = 1; n <= 20; n++) for (const m of [1, 2, 3] as const) CHECKOUT_DARTS.push({ n, m });
CHECKOUT_DARTS.push({ n: 25, m: 1 }, { n: 25, m: 2 });

const GOOD_DOUBLES = new Set([20, 16, 8]);
const OK_DOUBLES = new Set([10, 12, 4, 18]);

/** Lower = nicer to throw. Keeps suggestions human: T20 + D16 rather than T13 + D1. */
function dartCost(d: Dart, last: boolean, out: OutMode): number {
  if (last) {
    if (out === 'straight') return d.m;
    if (d.m === 3) return 4;
    if (d.n === 25) return 2;
    return GOOD_DOUBLES.has(d.n) ? 1 : OK_DOUBLES.has(d.n) ? 2 : 3;
  }
  if (d.m === 3) return d.n >= 17 ? 1 : 3;
  if (d.n === 25) return d.m === 2 ? 2 : 3;
  return d.m === 1 ? 2 : 4;
}

const checkoutCache = new Map<string, Dart[] | null>();

export function checkoutRoute(remaining: number, dartsLeft: number, out: OutMode): Dart[] | null {
  if (remaining < 2 || remaining > 170 || dartsLeft < 1) return null;
  const key = `${remaining}|${dartsLeft}|${out}`;
  if (checkoutCache.has(key)) return checkoutCache.get(key)!;

  let best: Dart[] | null = null;
  let bestCost = Infinity;
  const minLeft = out === 'straight' ? 1 : 2;

  const search = (rem: number, left: number, path: Dart[], cost: number): void => {
    for (const d of CHECKOUT_DARTS) {
      const next = rem - d.n * d.m;
      const total = cost + dartCost(d, next === 0, out) + 10;
      if (next === 0) {
        if (validOut(out, d) && total < bestCost) {
          bestCost = total;
          best = [...path, d];
        }
      } else if (left > 1 && next >= minLeft && total < bestCost) {
        search(next, left - 1, [...path, d], total);
      }
    }
  };
  search(remaining, dartsLeft, [], 0);
  checkoutCache.set(key, best);
  return best;
}
