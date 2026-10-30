import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Api, MatchRecord, Profile } from './api';
import { PlayerStats, avg3, emptyStats, statsByProfile } from './player-stats';
import { ProfileResult, Profiles, describeProfileError } from './profiles';

type SortKey = 'matches' | 'wins' | 'winRate' | 'v180' | 'avg' | 'name';

interface Row {
  profile: Profile;
  stats: PlayerStats;
  winRate: number | null;
  avg: number | null;
  first9: number | null;
  checkoutPct: number | null;
  avgLeg: number | null;
  per180: number | null;
}

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'matches', label: 'Matches' },
  { id: 'wins', label: 'Wins' },
  { id: 'winRate', label: 'Win %' },
  { id: 'v180', label: '180s' },
  { id: 'avg', label: 'Average' },
  { id: 'name', label: 'Name' },
];

@Component({
  selector: 'app-players',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <h2>Players</h2>
      <p class="hint">Saved players keep their stats across matches. Pick them when you start a game.</p>

      <form class="add" (submit)="$event.preventDefault(); add()">
        <input
          [value]="newName()"
          (input)="newName.set($any($event.target).value)"
          maxlength="30"
          placeholder="New player name"
          aria-label="New player name"
        />
        <button type="submit" class="primary" [disabled]="!newName().trim()">Add</button>
      </form>
      @if (error()) {
        <p class="warn">{{ error() }}</p>
      }
      @if (problemText() && problemText() !== error()) {
        <p class="warn">{{ problemText() }}{{ profiles.problem() === 'offline' ? ' Showing the last known list.' : '' }}</p>
      }
      @if (statsError()) {
        <p class="warn">Stats unavailable right now.</p>
      }

      @if (rows().length > 1) {
        <div class="sort" role="group" aria-label="Sort players by">
          <span class="muted">Sort by</span>
          @for (s of sorts; track s.id) {
            <button type="button" [class.on]="sort() === s.id" (click)="sort.set(s.id)">{{ s.label }}</button>
          }
        </div>
      }
    </section>

    @for (r of sorted(); track r.profile.id) {
      <section class="panel card">
        <div class="head">
          @if (editing() === r.profile.id) {
            <input
              class="grow"
              [value]="draft()"
              (input)="draft.set($any($event.target).value)"
              (keydown.enter)="saveRename(r.profile)"
              (keydown.escape)="editing.set(null)"
              maxlength="30"
              aria-label="Player name"
            />
            <button type="button" class="icon" (click)="saveRename(r.profile)" [disabled]="!draft().trim()" aria-label="Save name">✓</button>
            <button type="button" class="icon" (click)="editing.set(null)" aria-label="Cancel">✕</button>
          } @else {
            <h3 class="grow name">👤 {{ r.profile.name }}</h3>
            <button type="button" class="icon" (click)="startRename(r.profile)" [attr.aria-label]="'Rename ' + r.profile.name">✎</button>
            <button type="button" class="icon" (click)="remove(r.profile)" [attr.aria-label]="'Delete ' + r.profile.name">🗑</button>
          }
        </div>

        <div class="summary">
          <div><b>{{ r.stats.matches }}</b><span>Matches</span></div>
          <div><b>{{ r.stats.wins }}</b><span>Wins</span></div>
          <div><b>{{ pct(r.winRate) }}</b><span>Win rate</span></div>
        </div>

        @if (r.stats.matches === 0) {
          <p class="muted none">No matches yet.</p>
        } @else if (r.stats.x01Matches > 0) {
          <div class="visits" aria-label="Notable visits">
            <span class="chip" [class.zero]="!r.stats.visits180"><b>{{ r.stats.visits180 }} ×</b> 180</span>
            <span class="chip" [class.zero]="!r.stats.visits140"><b>{{ r.stats.visits140 }} ×</b> 140–179</span>
            <span class="chip" [class.zero]="!r.stats.visits100"><b>{{ r.stats.visits100 }} ×</b> 100–139</span>
          </div>
          <dl class="grid">
            <div><dt>3-dart average</dt><dd>{{ num(r.avg) }}</dd></div>
            <div><dt>First 9 average</dt><dd>{{ num(r.first9) }}</dd></div>
            <div>
              <dt>Checkout</dt>
              <dd>{{ pct(r.checkoutPct) }} <small>{{ r.stats.checkoutHits }}/{{ r.stats.checkoutAttempts }}</small></dd>
            </div>
            <div><dt>Highest checkout</dt><dd>{{ r.stats.highestCheckout || '–' }}</dd></div>
            <div><dt>Best leg</dt><dd>{{ r.stats.bestLeg ?? '–' }} <small>{{ r.stats.bestLeg ? 'darts' : '' }}</small></dd></div>
            <div><dt>Darts per leg won</dt><dd>{{ num(r.avgLeg) }}</dd></div>
            <div><dt>180s per match</dt><dd>{{ num(r.per180, 2) }}</dd></div>
            <div><dt>Highest visit</dt><dd>{{ r.stats.highestVisit || '–' }}</dd></div>
          </dl>
        }
      </section>
    } @empty {
      <section class="panel"><p class="muted">No saved players yet.</p></section>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 1rem; max-width: 640px; margin: 0 auto; padding: 1rem; }
    .panel { background: var(--surface); border-radius: 14px; padding: 1rem 1.25rem; }
    h2 { margin: 0 0 .5rem; font-size: 1.15rem; }
    .hint, .muted { color: var(--muted); margin: 0 0 .75rem; }
    .none { margin: .5rem 0 0; }
    .warn { color: #f5b942; margin: .5rem 0; }
    .add { display: flex; gap: .5rem; margin-bottom: .5rem; }
    .add input { flex: 1; min-width: 0; }
    .sort { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; margin-top: .75rem; }
    .sort .muted { margin: 0 .25rem 0 0; font-size: .85rem; }
    .sort button { padding: .4rem .8rem; min-height: 40px; }
    .head { display: flex; gap: .5rem; align-items: center; }
    .grow { flex: 1; min-width: 0; }
    .name { margin: 0; font-size: 1.15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icon { width: 3rem; min-height: 44px; padding: 0; flex: none; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; margin: .5rem 0; text-align: center; }
    .summary div { background: #ffffff0d; border-radius: 10px; padding: .4rem; display: flex; flex-direction: column; }
    .summary b { font-size: 1.5rem; font-variant-numeric: tabular-nums; }
    .summary span { color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; }
    .visits { display: flex; flex-wrap: wrap; gap: .4rem; margin: .5rem 0; }
    .chip { background: #ffffff14; border-radius: 999px; padding: .25rem .8rem; font-size: .95rem; }
    .chip b { color: var(--accent); font-variant-numeric: tabular-nums; }
    .chip.zero { opacity: .45; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: .4rem .75rem; margin: .5rem 0 0; }
    .grid div { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; padding: .3rem 0; border-top: 1px solid #0003; }
    dt { color: var(--muted); font-size: .85rem; }
    dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
    dd small { color: var(--muted); font-weight: 500; }
    @media (max-width: 480px) { :host { padding: .5rem; } .panel { padding: .75rem; } .grid { grid-template-columns: 1fr; } }
  `,
})
export class Players {
  protected readonly profiles = inject(Profiles);
  private readonly api = inject(Api);

  protected readonly sorts = SORTS;
  protected readonly sort = signal<SortKey>('matches');
  protected readonly newName = signal('');
  protected readonly error = signal('');
  protected readonly editing = signal<string | null>(null);
  protected readonly draft = signal('');

  private readonly matches = signal<MatchRecord[]>([]);
  protected readonly statsError = signal(false);

  protected readonly rows = computed<Row[]>(() => {
    const byId = statsByProfile(this.matches());
    return this.profiles.list().map((profile) => {
      const stats = byId.get(profile.id) ?? emptyStats();
      return {
        profile,
        stats,
        winRate: stats.matches ? stats.wins / stats.matches : null,
        avg: avg3(stats.points, stats.darts),
        first9: avg3(stats.first9Points, stats.first9Darts),
        checkoutPct: stats.checkoutAttempts ? stats.checkoutHits / stats.checkoutAttempts : null,
        avgLeg: stats.legsWon ? stats.legDartsTotal / stats.legsWon : null,
        per180: stats.x01Matches ? stats.visits180 / stats.x01Matches : null,
      };
    });
  });

  protected readonly sorted = computed(() => {
    const key = this.sort();
    const value = (r: Row): number => {
      switch (key) {
        case 'matches': return r.stats.matches;
        case 'wins': return r.stats.wins;
        case 'winRate': return r.winRate ?? -1;
        case 'v180': return r.stats.visits180;
        default: return r.avg ?? -1;
      }
    };
    const list = [...this.rows()];
    if (key === 'name') return list;
    return list.sort((a, b) => value(b) - value(a) || a.profile.name.localeCompare(b.profile.name));
  });

  constructor() {
    void this.profiles.refresh();
    this.api
      .matches()
      .then((m) => this.matches.set(m))
      .catch(() => this.statsError.set(true));
  }

  protected num(v: number | null, digits = 1): string {
    return v === null ? '–' : v.toFixed(digits);
  }

  protected pct(v: number | null): string {
    return v === null ? '–' : `${Math.round(v * 100)}%`;
  }

  protected async add(): Promise<void> {
    this.error.set('');
    const result = await this.profiles.add(this.newName().trim());
    if ('profile' in result) this.newName.set('');
    else this.error.set(this.message(result));
  }

  protected startRename(p: Profile): void {
    this.error.set('');
    this.draft.set(p.name);
    this.editing.set(p.id);
  }

  protected async saveRename(p: Profile): Promise<void> {
    const name = this.draft().trim();
    if (!name) return;
    if (name === p.name) return this.editing.set(null);
    const result = await this.profiles.rename(p.id, name);
    if ('profile' in result) {
      this.editing.set(null);
      this.error.set('');
    } else {
      this.error.set(this.message(result));
    }
  }

  protected async remove(p: Profile): Promise<void> {
    if (!confirm(`Delete player "${p.name}"? Played matches are kept, but the stats are no longer shown.`)) return;
    const result = await this.profiles.remove(p.id);
    if (result !== true) this.error.set(describeProfileError(result.error, result.status));
  }

  /** Why the list could not be loaded, empty when the server answered. */
  protected readonly problemText = computed(() => {
    const problem = this.profiles.problem();
    return problem ? describeProfileError(problem) : '';
  });

  private message(r: Exclude<ProfileResult, { profile: Profile }>): string {
    return describeProfileError(r.error, r.status);
  }
}
