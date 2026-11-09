import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Api, MatchRecord } from './api';
import { Heatmap } from './charts/heatmap';
import { LineChart } from './charts/line-chart';
import { Radar } from './charts/radar';
import { TrendChart } from './charts/trend-chart';
import { GameService } from './game.service';
import { Mode } from './game-logic';
import { AdvancedStats, StatsFilter, StatsKind, TREND_WINDOW, advancedStats, avg3, avgTrend, boardKey } from './player-stats';
import { Profiles } from './profiles';
import { takeaways } from './takeaways';

const MODES: { id: Mode | 'all'; label: string }[] = [
  { id: 'all', label: 'All modes' },
  { id: 'x01', label: 'X01' },
  { id: 'cricket', label: 'Cricket' },
  { id: 'atc', label: 'Around the Clock' },
];

const PERIODS: { days: number | null; label: string }[] = [
  { days: null, label: 'All time' },
  { days: 90, label: '90 days' },
  { days: 30, label: '30 days' },
];

const DAY = 86_400_000;

const HITS: { label: string; n: number; m: number }[] = [
  { label: 'T20', n: 20, m: 3 },
  { label: 'T19', n: 19, m: 3 },
  { label: 'T18', n: 18, m: 3 },
  { label: 'T17', n: 17, m: 3 },
  { label: 'T16', n: 16, m: 3 },
  { label: 'T15', n: 15, m: 3 },
  { label: 'Single bull', n: 25, m: 1 },
  { label: 'Bull', n: 25, m: 2 },
];

@Component({
  selector: 'app-player-detail',
  imports: [Heatmap, LineChart, Radar, TrendChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div class="head">
        <button type="button" class="ghost back" (click)="game.view.set('players')">← Players</button>
        <h2 class="grow">{{ name() }}</h2>
      </div>
      <div class="kind" role="group" aria-label="Games to show">
        <button type="button" [class.on]="kind() === 'match'" (click)="kind.set('match')">Matches <small>{{ matchCount() }}</small></button>
        <button type="button" [class.on]="kind() === 'training'" (click)="kind.set('training')">Training <small>{{ trainingCount() }}</small></button>
      </div>
      <div class="chips" role="group" aria-label="Game mode">
        @for (m of modes; track m.id) {
          <button type="button" [class.on]="mode() === m.id" (click)="mode.set(m.id)">{{ m.label }}</button>
        }
      </div>
      <div class="chips" role="group" aria-label="Period">
        @for (p of periods; track p.label) {
          <button type="button" [class.on]="period() === p.days" (click)="period.set(p.days)">{{ p.label }}</button>
        }
      </div>
      @if (error()) {
        <p class="warn">Stats unavailable right now.</p>
      }
    </section>

    @if (loading()) {
      <section class="panel"><p class="muted">Loading…</p></section>
    } @else if (stats(); as s) {
      @if (!s.base.matches) {
        <section class="panel">
          <p class="muted">{{ filtered() ? 'No games for this filter.' : kind() === 'match' ? 'No matches yet.' : 'No training yet. Start a game with only this player to train.' }}</p>
        </section>
      } @else {
        <section class="panel">
          <div class="tiles">
            <div><b>{{ s.base.matches }}</b><span>{{ kind() === 'match' ? 'Matches' : 'Sessions' }}</span></div>
            @if (kind() === 'match') {
              <div><b>{{ pct(s.base.wins, s.base.matches) }}</b><span>Win rate</span></div>
            }
            <div><b>{{ num(avg()) }}</b><span>3-dart avg</span></div>
            <div><b>{{ num(first9()) }}</b><span>First 9</span></div>
            <div><b>{{ pct(s.base.checkoutHits, s.base.checkoutAttempts) }}</b><span>Checkout</span></div>
            <div><b>{{ s.throws }}</b><span>Darts</span></div>
          </div>
        </section>

        @if (mode() !== 'cricket' && mode() !== 'atc') {
          <section class="panel">
            <h3>Trend</h3>
            <p class="muted sub">X01 3-dart average per game, moving average over the last {{ window }} games. Ignores the period.</p>
            @if (trend().change; as c) {
              <div class="delta" [class.up]="c.recent >= c.before" [class.down]="c.recent < c.before">
                <b>{{ c.recent >= c.before ? '▲' : '▼' }} {{ signed(c.recent - c.before) }}</b>
                <span>last {{ c.days }} days: {{ c.recent.toFixed(1) }} ({{ c.recentGames }} games) · before: {{ c.before.toFixed(1) }} ({{ c.beforeGames }} games)</span>
              </div>
            } @else {
              <p class="muted">Change needs at least 3 X01 games in each of the last two 90-day periods.</p>
            }
            @if (trend().points.length >= 2) {
              <app-trend-chart [points]="trend().points" />
            } @else {
              <p class="muted">Not enough X01 games yet.</p>
            }
          </section>
        }

        <section class="panel">
          <h3>Takeaways</h3>
          @if (notes().strengths.length || notes().weaknesses.length) {
            <div class="notes">
              <div>
                <h4 class="good">▲ Strengths</h4>
                <ul>
                  @for (t of notes().strengths; track t) {
                    <li>{{ t }}</li>
                  } @empty {
                    <li class="muted">Nothing stands out yet.</li>
                  }
                </ul>
              </div>
              <div>
                <h4 class="bad">▼ Weaknesses</h4>
                <ul>
                  @for (t of notes().weaknesses; track t) {
                    <li>{{ t }}</li>
                  } @empty {
                    <li class="muted">Nothing stands out yet.</li>
                  }
                </ul>
              </div>
            </div>
          } @else {
            <p class="muted">Play a few more games for takeaways.</p>
          }
        </section>

        <div class="cols">
          @if (s.visits) {
            <section class="panel">
              <h3>Visits</h3>
              <p class="muted sub">{{ s.visits }} X01 visits</p>
              <table class="ranges">
                <tbody>
                  @for (r of s.ranges; track r.label) {
                    <tr>
                      <th scope="row">{{ r.label }}</th>
                      <td class="bar"><span [style.width.%]="share(r.count, maxRange())"></span></td>
                      <td class="n">{{ r.count }}</td>
                      <td class="p">{{ pct(r.count, s.visits) }}</td>
                    </tr>
                  }
                  <tr class="bust">
                    <th scope="row">Bust</th>
                    <td class="bar"><span [style.width.%]="share(s.busts, maxRange())"></span></td>
                    <td class="n">{{ s.busts }}</td>
                    <td class="p">{{ pct(s.busts, s.visits) }}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          }

          <section class="panel">
            <h3>Hits</h3>
            <p class="muted sub">All modes, per 100 darts</p>
            <div class="hits">
              @for (h of hits(); track h.label) {
                <div [class.zero]="!h.count"><b>{{ h.count }}</b><span>{{ h.label }}</span><small>{{ h.rate }}</small></div>
              }
            </div>
          </section>

          <section class="panel">
            <h3>Where the darts land</h3>
            <p class="muted sub">Every dart in every mode. Tap a field.</p>
            <app-heatmap [board]="s.board" [throws]="s.throws" [misses]="s.misses" />
          </section>

          <section class="panel">
            <h3>Doubles</h3>
            <p class="muted sub">Hit rate of darts thrown at a finishing double (double out)</p>
            @if (s.doubles.length) {
              <app-radar [doubles]="s.doubles" />
            } @else {
              <p class="muted">No darts at a finishing double yet.</p>
            }
          </section>

          <section class="panel wide">
            <h3>Scoring through the leg</h3>
            <p class="muted sub">3-dart average by visit in the leg, visits above 170 left only</p>
            @if (s.legCurve.length >= 2) {
              <app-line-chart [points]="s.legCurve" [average]="avg()" />
            } @else {
              <p class="muted">Not enough X01 legs yet.</p>
            }
          </section>
        </div>
      }
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 1rem; max-width: 960px; margin: 0 auto; padding: 1rem; }
    .panel { background: var(--surface); border-radius: 14px; padding: 1rem 1.25rem; min-width: 0; }
    .head { display: flex; gap: .75rem; align-items: center; }
    .grow { flex: 1; min-width: 0; }
    h2 { margin: 0; font-size: 1.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    h3 { margin: 0 0 .25rem; font-size: 1.05rem; }
    h4 { margin: 0 0 .4rem; font-size: .9rem; text-transform: uppercase; letter-spacing: .06em; }
    .back { min-height: 44px; padding: .5rem .9rem; flex: none; }
    .kind { display: flex; gap: .4rem; margin-top: .75rem; }
    .kind button { flex: 1; min-height: 44px; padding: .4rem .8rem; }
    .chips { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .5rem; }
    .chips button { min-height: 44px; padding: .4rem .8rem; }
    .delta { display: flex; flex-direction: column; margin-bottom: .75rem; }
    .delta b { font-size: 1.4rem; font-variant-numeric: tabular-nums; }
    .delta span { color: var(--muted); font-size: .85rem; }
    .delta.up b { color: var(--accent); }
    .delta.down b { color: var(--warn); }
    .kind small { color: var(--muted); margin-left: .3rem; font-variant-numeric: tabular-nums; }
    .muted { color: var(--muted); }
    .sub { margin: 0 0 .75rem; font-size: .85rem; }
    .warn { color: var(--warn); margin: .5rem 0 0; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr)); gap: .5rem; text-align: center; }
    .tiles div { background: var(--fill); border-radius: 10px; padding: .5rem .25rem; display: flex; flex-direction: column; }
    .tiles b { font-size: 1.5rem; font-variant-numeric: tabular-nums; }
    .tiles span { color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; }
    .notes { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .notes ul { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: .35rem; }
    .good { color: var(--accent); }
    .bad { color: var(--warn); }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .wide { grid-column: 1 / -1; }
    .ranges { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    .ranges th { text-align: left; font-weight: 600; padding: .3rem .5rem .3rem 0; white-space: nowrap; width: 4.5rem; }
    .ranges td { padding: .3rem 0; }
    .ranges .bar span { display: block; height: .75rem; min-width: 2px; border-radius: 0 4px 4px 0; background: var(--chart); }
    .ranges .bust .bar span { background: var(--muted); }
    .ranges .n { text-align: right; width: 3rem; font-weight: 700; }
    .ranges .p { text-align: right; width: 3.5rem; color: var(--muted); }
    .hits { display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem; text-align: center; }
    .hits div { background: var(--fill); border-radius: 10px; padding: .5rem .25rem; display: flex; flex-direction: column; }
    .hits b { font-size: 1.3rem; color: var(--accent); font-variant-numeric: tabular-nums; }
    .hits span { font-size: .8rem; font-weight: 600; }
    .hits small { color: var(--muted); font-variant-numeric: tabular-nums; }
    .hits .zero { opacity: .45; }
    @media (max-width: 720px) { .cols { grid-template-columns: 1fr; } }
    @media (max-width: 480px) {
      :host { padding: .5rem; gap: .5rem; }
      .panel { padding: .75rem; }
      .notes { grid-template-columns: 1fr; }
      .hits { grid-template-columns: repeat(2, 1fr); }
    }
  `,
})
export class PlayerDetail {
  protected readonly game = inject(GameService);
  private readonly api = inject(Api);
  private readonly profiles = inject(Profiles);

  protected readonly kind = signal<StatsKind>('match');
  protected readonly modes = MODES;
  protected readonly periods = PERIODS;
  protected readonly window = TREND_WINDOW;
  protected readonly mode = signal<Mode | 'all'>('all');
  protected readonly period = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  private readonly matches = signal<MatchRecord[]>([]);

  private readonly id = computed(() => this.game.statsProfileId() ?? '');
  protected readonly name = computed(() => this.profiles.list().find((p) => p.id === this.id())?.name ?? 'Player');

  protected readonly filtered = computed(() => this.mode() !== 'all' || this.period() !== null);

  private readonly filter = computed<StatsFilter>(() => {
    const days = this.period();
    return { mode: this.mode(), since: days === null ? null : Date.now() - days * DAY };
  });

  private readonly both = computed(() => ({
    match: advancedStats(this.matches(), this.id(), 'match', this.filter()),
    training: advancedStats(this.matches(), this.id(), 'training', this.filter()),
  }));

  protected readonly trend = computed(() => avgTrend(this.matches(), this.id(), this.kind()));

  protected readonly matchCount = computed(() => this.both().match.base.matches);
  protected readonly trainingCount = computed(() => this.both().training.base.matches);
  protected readonly stats = computed<AdvancedStats>(() => this.both()[this.kind()]);
  private readonly other = computed<AdvancedStats>(() => this.both()[this.kind() === 'match' ? 'training' : 'match']);

  protected readonly avg = computed(() => avg3(this.stats().base.points, this.stats().base.darts));
  protected readonly first9 = computed(() => avg3(this.stats().base.first9Points, this.stats().base.first9Darts));
  protected readonly notes = computed(() => takeaways(this.stats(), this.kind(), this.other()));
  protected readonly maxRange = computed(() => Math.max(this.stats().busts, ...this.stats().ranges.map((r) => r.count)));

  protected readonly hits = computed(() => {
    const s = this.stats();
    return HITS.map((h) => {
      const count = s.board.get(boardKey(h.n, h.m)) ?? 0;
      return { label: h.label, count, rate: s.throws ? ((count / s.throws) * 100).toFixed(1) : '–' };
    });
  });

  constructor() {
    if (!this.game.statsProfileId()) this.game.view.set('players');
    void this.profiles.refresh();
    this.api
      .matches()
      .then((m) => {
        this.matches.set(m);
        // Open on training when the player has no matches but has trained.
        if (!this.both().match.base.matches && this.both().training.base.matches) this.kind.set('training');
      })
      .catch(() => this.error.set(true))
      .finally(() => this.loading.set(false));
  }

  protected num(v: number | null): string {
    return v === null ? '–' : v.toFixed(1);
  }

  protected signed(v: number): string {
    return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
  }

  protected pct(part: number, whole: number): string {
    return whole ? `${Math.round((part / whole) * 100)}%` : '–';
  }

  protected share(part: number, whole: number): number {
    return whole ? (part / whole) * 100 : 0;
  }
}
