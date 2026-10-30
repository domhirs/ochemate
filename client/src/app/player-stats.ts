import { MatchRecord } from './api';
import { Dart, MatchConfig, applyDart, checkoutRoutes, newState } from './game-logic';

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
}

export interface MatchAnalysis {
  winner: number | null;
  visits: Visit[];
}

/** Replays the darts once and records every x01 visit. Cricket and Around the Clock only report the winner. */
export function analyzeMatch(config: MatchConfig, darts: Dart[]): MatchAnalysis {
  const s = newState(config);
  const visits: Visit[] = [];
  const isX01 = config.mode === 'x01';
  const legDarts = config.players.map(() => 0);
  const legVisits = config.players.map(() => 0);
  let attempt = false;

  for (const dart of darts) {
    if (s.winner !== null) break;
    const prevLast = s.lastTurn;
    const prevLeg = s.leg;
    if (isX01 && s.turn.length === 0) {
      const p = s.players[s.current];
      const open = !config.x01.doubleIn || p.opened;
      attempt = open && p.score >= 2 && p.score <= 170 && checkoutRoutes(p.score, 3, config.x01.out, 1).length > 0;
    }
    applyDart(s, dart);
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
    });
    if (s.leg !== prevLeg) {
      legDarts.fill(0);
      legVisits.fill(0);
    }
  }
  return { winner: s.winner, visits };
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

/** Stats per saved player id, from every match that links the player. Guests are ignored. */
export function statsByProfile(matches: MatchRecord[]): Map<string, PlayerStats> {
  const out = new Map<string, PlayerStats>();
  for (const m of matches) {
    const ids = m.config.playerIds;
    if (!ids?.some((id) => id)) continue;
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
