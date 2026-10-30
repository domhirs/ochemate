import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Api, MatchRecord } from './api';
import { GameState, Mode, X01Options, replay, setsToWin, threeDartAvg } from './game-logic';

interface Row {
  id: string;
  finishedAt: string;
  mode: Mode;
  title: string;
  state: GameState;
}

interface PlayerStat {
  name: string;
  games: number;
  wins: number;
  x01Darts: number;
  x01Points: number;
  oneEighties: number;
  bestOut: number;
}

function formatTarget(o: X01Options): string {
  const sets = setsToWin(o);
  if (sets > 1) return `, first to ${sets} sets of ${o.legs} ${o.legs === 1 ? 'leg' : 'legs'}`;
  return o.legs > 1 ? `, first to ${o.legs}` : '';
}

const MODE_TITLE: Record<Mode, string> = { x01: 'X01', cricket: 'Cricket', atc: 'Around the Clock' };

@Component({
  selector: 'app-history',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      @if (error()) {
        <p class="warn">Could not load history from the server.</p>
      } @else if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (!rows().length) {
        <p class="muted">No finished games yet.</p>
      } @else {
        <section class="panel">
          <h2>Players</h2>
          <table>
            <thead>
              <tr><th>Player</th><th>Games</th><th>Wins</th><th>X01 avg</th><th>180s</th><th>Best out</th></tr>
            </thead>
            <tbody>
              @for (p of stats(); track p.name) {
                <tr>
                  <td>{{ p.name }}</td>
                  <td>{{ p.games }}</td>
                  <td>{{ p.wins }}</td>
                  <td>{{ p.x01Darts ? ((p.x01Points / p.x01Darts) * 3).toFixed(1) : '–' }}</td>
                  <td>{{ p.oneEighties }}</td>
                  <td>{{ p.bestOut || '–' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h2>Games</h2>
          @for (r of rows(); track r.id) {
            <div class="game">
              <div class="head">
                <strong>{{ r.title }}</strong>
                <span class="muted">{{ r.finishedAt | date: 'dd.MM.yyyy HH:mm' }}</span>
                <button type="button" class="ghost del" (click)="remove(r.id)" aria-label="Delete game">✕</button>
              </div>
              <div class="players">
                @for (p of r.state.players; track $index; let i = $index) {
                  <span [class.win]="i === r.state.winner">
                    {{ p.name }}
                    @if (r.mode === 'x01') {
                      <small>avg {{ avg(p).toFixed(1) }}</small>
                    }
                  </span>
                }
              </div>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .wrap { max-width: 760px; margin: 0 auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
    .panel { background: var(--surface); border-radius: 14px; padding: 1rem 1.25rem; overflow-x: auto; }
    h2 { margin: 0 0 .75rem; font-size: 1.15rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: .5rem .4rem; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    th { color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; }
    .game { padding: .6rem 0; border-top: 1px solid #ffffff14; }
    .game:first-of-type { border-top: 0; }
    .head { display: flex; gap: .75rem; align-items: baseline; }
    .head .muted { margin-right: auto; }
    .del { padding: .2rem .6rem; }
    .players { display: flex; gap: 1.25rem; flex-wrap: wrap; margin-top: .25rem; }
    .players small { color: var(--muted); margin-left: .25rem; }
    .win { color: var(--accent); font-weight: 700; }
    .muted { color: var(--muted); }
    .warn { color: #f5b942; }
  `,
})
export class History implements OnInit {
  private readonly api = inject(Api);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  private readonly records = signal<MatchRecord[]>([]);

  protected readonly rows = computed<Row[]>(() =>
    this.records().map((r) => {
      const c = r.config;
      const detail = c.mode === 'x01' ? `${c.x01.start}${formatTarget(c.x01)}` : '';
      return {
        id: r.id,
        finishedAt: r.finishedAt ?? '',
        mode: c.mode,
        title: `${MODE_TITLE[c.mode]} ${detail}`.trim(),
        state: replay(c, r.darts),
      };
    }),
  );

  protected readonly stats = computed<PlayerStat[]>(() => {
    const map = new Map<string, PlayerStat>();
    for (const r of this.rows()) {
      r.state.players.forEach((p, i) => {
        const s = map.get(p.name) ?? {
          name: p.name,
          games: 0,
          wins: 0,
          x01Darts: 0,
          x01Points: 0,
          oneEighties: 0,
          bestOut: 0,
        };
        s.games++;
        if (i === r.state.winner) s.wins++;
        if (r.mode === 'x01') {
          s.x01Darts += p.darts;
          s.x01Points += p.points;
          s.oneEighties += p.oneEighties;
          s.bestOut = Math.max(s.bestOut, p.highCheckout);
        }
        map.set(p.name, s);
      });
    }
    return [...map.values()].sort((a, b) => b.wins - a.wins || b.games - a.games);
  });

  protected readonly avg = threeDartAvg;

  async ngOnInit(): Promise<void> {
    try {
      this.records.set(await this.api.matches());
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async remove(id: string): Promise<void> {
    if (!confirm('Delete this game?')) return;
    await this.api.remove(id);
    this.records.update((l) => l.filter((r) => r.id !== id));
  }
}
