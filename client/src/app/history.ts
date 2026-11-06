import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Api, MatchRecord } from './api';
import { Dart, GameState, HistoryEntry, Mode, X01Options, buildHistory, dartLabel, replay, setsToWin, threeDartAvg } from './game-logic';
import { DartInput } from './dart-input';
import { isTraining } from './player-stats';

interface Row {
  id: string;
  finishedAt: string;
  mode: Mode;
  title: string;
  training: boolean;
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
  if (sets > 1) return `, first to ${sets} sets of ${o.legs} ${o.legs === 1 ? 'leg' : 'legs'}${o.tieBreak ? ', decider by 2 legs' : ''}`;
  return o.legs > 1 ? `, first to ${o.legs}` : '';
}

const MODE_TITLE: Record<Mode, string> = { x01: 'X01', cricket: 'Cricket', atc: 'Around the Clock' };

@Component({
  selector: 'app-history',
  imports: [DatePipe, DartInput],
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
        @if (stats().length) {
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
        }

        <section class="panel">
          <h2>Games</h2>
          @for (r of rows(); track r.id) {
            <div class="game">
              <div class="head">
                <strong>{{ r.title }}</strong>
                @if (r.training) {
                  <span class="tag">Training</span>
                }
                <span class="muted">{{ r.finishedAt | date: 'dd.MM.yyyy HH:mm' }}</span>
                <button type="button" class="ghost del" (click)="startEdit(r.id)" [disabled]="editId() === r.id">Edit</button>
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

    @if (editRow(); as er) {
      <div class="overlay" (click)="cancelEdit()">
        <div class="dialog" role="dialog" aria-label="Edit game" (click)="$event.stopPropagation()">
          <div class="mhead">
            <h2>Edit throws</h2>
            <button type="button" class="ghost" aria-label="Close" (click)="cancelEdit()">✕</button>
          </div>
          <p class="muted hint">{{ er.title }} · {{ er.finishedAt | date: 'dd.MM.yyyy HH:mm' }}</p>
              <div class="edit">
                <p class="muted hint">Tap a throw to change it. The game is replayed from the corrected throw.</p>
                @for (g of editGroups(); track g.turn) {
                  <div class="turn">
                    <span class="who">{{ g.player }}</span>
                    @for (e of g.entries; track e.index) {
                      <button type="button" class="chip" [class.sel]="selected() === e.index" [class.bust]="e.bust" (click)="selected.set(e.index)">{{ label(e.dart) }}</button>
                    }
                    @if (g.last.bust) {
                      <small class="warn">bust</small>
                    } @else if (g.last.win) {
                      <small class="win">wins</small>
                    } @else {
                      <small class="muted">→ {{ g.last.after }}</small>
                    }
                  </div>
                }
                @if (selected() !== null) {
                  <div class="picker">
                    <p class="muted hint">New value for throw {{ selected()! + 1 }} ({{ label(draft()[selected()!]) }})</p>
                    <app-dart-input [initial]="draft()[selected()!]" (picked)="setDart($event)" />
                    <button type="button" class="ghost" (click)="selected.set(null)">Cancel</button>
                  </div>
                }
                @if (editProblem(); as problem) {
                  <p class="warn">{{ problem }}</p>
                }
                <div class="actions">
                  <button type="button" class="ghost" (click)="cancelEdit()">Cancel</button>
                  <button type="button" (click)="saveEdit()" [disabled]="!!editProblem() || !dirty() || saving()">Save</button>
                </div>
              </div>
        </div>
      </div>
    }
  `,
  styles: `
    .wrap { max-width: 760px; margin: 0 auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
    .panel { background: var(--surface); border-radius: 14px; padding: 1rem 1.25rem; overflow-x: auto; }
    h2 { margin: 0 0 .75rem; font-size: 1.15rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: .5rem .4rem; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    th { color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; }
    .game { padding: .6rem 0; border-top: 1px solid var(--line); }
    .game:first-of-type { border-top: 0; }
    .head { display: flex; gap: .75rem; align-items: baseline; }
    .head .muted { margin-right: auto; }
    .del { padding: .2rem .6rem; }
    .overlay { position: fixed; inset: 0; background: var(--scrim); display: grid; place-items: center; padding: 1rem; z-index: 10; }
    .dialog { background: var(--surface); border-radius: 18px; padding: 1.25rem; max-width: 520px; width: 100%; max-height: 90dvh; overflow-y: auto; display: flex; flex-direction: column; gap: .5rem; }
    .mhead { display: flex; justify-content: space-between; align-items: center; }
    .mhead h2 { margin: 0; }
    .edit { display: flex; flex-direction: column; gap: .4rem; }
    .hint { margin: 0; font-size: .85rem; }
    .turn { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
    .who { min-width: 6rem; font-weight: 600; }
    .chip { padding: .3rem .6rem; min-width: 3rem; }
    .chip.sel { outline: 2px solid var(--accent); }
    .chip.bust { color: var(--warn); }
    .picker { display: flex; flex-direction: column; gap: .4rem; max-width: 340px; }
    .actions { display: flex; gap: .5rem; justify-content: flex-end; }
    .players { display: flex; gap: 1.25rem; flex-wrap: wrap; margin-top: .25rem; }
    .players small { color: var(--muted); margin-left: .25rem; }
    .win { color: var(--accent); font-weight: 700; }
    .muted { color: var(--muted); }
    .tag { font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); border: 1px solid var(--ghost-border); border-radius: 999px; padding: .05rem .5rem; }
    .warn { color: var(--warn); }
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
        training: isTraining(c),
        state: replay(c, r.darts),
      };
    }),
  );

  protected readonly stats = computed<PlayerStat[]>(() => {
    const map = new Map<string, PlayerStat>();
    for (const r of this.rows()) {
      if (r.training) continue;
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
  protected readonly label = dartLabel;

  protected readonly editId = signal<string | null>(null);
  protected readonly draft = signal<Dart[]>([]);
  protected readonly selected = signal<number | null>(null);
  protected readonly saving = signal(false);

  protected readonly editRow = computed(() => this.rows().find((r) => r.id === this.editId()) ?? null);
  private readonly editRecord = computed(() => this.records().find((r) => r.id === this.editId()) ?? null);
  private readonly editEntries = computed<HistoryEntry[]>(() => {
    const r = this.editRecord();
    return r ? buildHistory(r.config, this.draft()) : [];
  });

  protected readonly editGroups = computed(() => {
    const names = this.editRecord()?.config.players ?? [];
    const groups: { turn: number; player: string; entries: (HistoryEntry & { index: number })[]; last: HistoryEntry }[] = [];
    this.editEntries().forEach((e, index) => {
      const prev = groups[groups.length - 1];
      if (prev && prev.turn === e.turn) {
        prev.entries.push({ ...e, index });
        prev.last = e;
      } else {
        groups.push({ turn: e.turn, player: names[e.player], entries: [{ ...e, index }], last: e });
      }
    });
    return groups;
  });

  protected readonly editProblem = computed(() => {
    const e = this.editEntries();
    if (!e.length) return null;
    if (!e[e.length - 1].win) return 'With this change the game has no winner. Fix the following throws or cancel.';
    return null;
  });

  protected readonly dirty = computed(() => {
    const orig = this.editRecord()?.darts ?? [];
    const n = this.editEntries().length;
    return n !== orig.length || this.draft().slice(0, n).some((d, i) => d.n !== orig[i].n || d.m !== orig[i].m);
  });

  async ngOnInit(): Promise<void> {
    try {
      this.records.set(await this.api.matches());
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected startEdit(id: string): void {
    const r = this.records().find((x) => x.id === id);
    if (!r) return;
    this.editId.set(id);
    this.draft.set(r.darts.map((d) => ({ ...d })));
    this.selected.set(null);
  }

  protected cancelEdit(): void {
    this.editId.set(null);
    this.selected.set(null);
  }

  protected setDart(d: Dart): void {
    const i = this.selected();
    if (i === null) return;
    this.draft.update((l) => l.map((x, j) => (j === i ? { n: d.n, m: d.m } : x)));
    this.selected.set(null);
  }

  protected async saveEdit(): Promise<void> {
    const r = this.editRecord();
    if (!r || this.editProblem()) return;
    // Throws after the winning dart are not part of the game; drop them.
    const darts = this.draft().slice(0, this.editEntries().length);
    this.saving.set(true);
    try {
      await this.api.updateMatch(r.id, { config: r.config, darts });
      this.records.update((l) => l.map((x) => (x.id === r.id ? { ...x, darts } : x)));
      this.cancelEdit();
    } catch {
      alert('Could not save the change. Try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(id: string): Promise<void> {
    if (!confirm('Delete this game?')) return;
    await this.api.remove(id);
    this.records.update((l) => l.filter((r) => r.id !== id));
  }
}
