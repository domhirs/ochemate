import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Dartboard } from './dartboard';
import { GameService } from './game.service';
import { ATC_SEQUENCE, CRICKET_NUMBERS, Dart, checkoutRoute, dartLabel, threeDartAvg } from './game-logic';

const MARKS = ['', '/', '✕', '⊗'];

@Component({
  selector: 'app-game',
  imports: [Dartboard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as s) {
      <div class="layout">
        <div class="side">
        <div class="score">
          @switch (s.config.mode) {
            @case ('x01') {
              @for (p of s.players; track $index; let i = $index) {
                <div class="card" [class.active]="i === s.current && s.winner === null">
                  <div class="top">
                    <span class="name">{{ p.name }}</span>
                    @if (s.config.x01.legs > 1) {
                      <span class="legs">Legs {{ p.legs }}</span>
                    }
                  </div>
                  <div class="big">{{ p.score }}</div>
                  <div class="meta">
                    <span>Avg {{ avg(p).toFixed(1) }}</span>
                    <span>Darts {{ p.darts }}</span>
                    @if (p.oneEighties) {
                      <span>180 ×{{ p.oneEighties }}</span>
                    }
                  </div>
                  <div class="throws" [class.bust]="throws()[i].bust">
                    @for (l of throws()[i].labels; track $index) {
                      <span class="chip" [class.empty]="l === null">{{ l ?? '–' }}</span>
                    }
                  </div>
                  @if (i === s.current && s.winner === null && checkout(); as route) {
                    <div class="route">{{ route }}</div>
                  }
                </div>
              }
            }
            @case ('cricket') {
              <table class="cricket">
                <thead>
                  <tr>
                    <th></th>
                    @for (p of s.players; track $index; let i = $index) {
                      <th [class.active]="i === s.current && s.winner === null">
                        {{ p.name }}<span class="pts">{{ p.score }}</span>
                      </th>
                    }
                  </tr>
                  <tr class="throws">
                    <th></th>
                    @for (p of s.players; track $index; let i = $index) {
                      <td [class.active]="i === s.current && s.winner === null" [class.bust]="throws()[i].bust">
                        @for (l of throws()[i].labels; track $index) {
                          <span class="chip" [class.empty]="l === null">{{ l ?? '–' }}</span>
                        }
                      </td>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (n of cricketNumbers; track n) {
                    <tr>
                      <th>{{ n === 25 ? 'Bull' : n }}</th>
                      @for (p of s.players; track $index; let i = $index) {
                        <td [class.closed]="(p.marks[n] ?? 0) >= 3" [class.active]="i === s.current && s.winner === null">
                          {{ mark(p.marks[n] ?? 0) }}
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            }
            @case ('atc') {
              @for (p of s.players; track $index; let i = $index) {
                <div class="card" [class.active]="i === s.current && s.winner === null">
                  <div class="top"><span class="name">{{ p.name }}</span></div>
                  <div class="big">{{ target(p.score) }}</div>
                  <div class="bar"><div [style.width.%]="(p.score / atcLength) * 100"></div></div>
                  <div class="meta"><span>Darts {{ p.darts }}</span></div>
                  <div class="throws">
                    @for (l of throws()[i].labels; track $index) {
                      <span class="chip" [class.empty]="l === null">{{ l ?? '–' }}</span>
                    }
                  </div>
                </div>
              }
            }
          }
        </div>
          <div class="actions">
            <button type="button" (click)="game.undo()" [disabled]="!game.canUndo()">⟲ Undo</button>
            <button type="button" (click)="game.throwDart({ n: 0, m: 0 })">Miss</button>
            <button type="button" class="icon" aria-label="Game history" (click)="showHistory.set(true)">☰</button>
          </div>
        </div>

        <div class="input">
          <div class="board"><app-dartboard (thrown)="game.throwDart($event)" /></div>
        </div>
      </div>

      @if (showHistory()) {
        <div class="overlay" (click)="showHistory.set(false)">
          <div class="dialog history" role="dialog" aria-label="Game history" (click)="$event.stopPropagation()">
            <div class="head">
              <h2>History</h2>
              <button type="button" class="icon" aria-label="Close history" (click)="showHistory.set(false)">✕</button>
            </div>
            @if (game.history().length === 0) {
              <p class="muted">No darts thrown yet.</p>
            }
            <ol>
              @for (e of reversed(); track e.index) {
                <li [class.bust]="e.bust">
                  <span class="t">#{{ e.turn }}</span>
                  <span class="p">{{ s.players[e.player].name }}</span>
                  <span class="d">{{ label(e.dart) }}</span>
                  <span class="r">
                    @if (e.bust) { BUST }
                    @else if (e.win) { 🎯 Win }
                    @else if (s.config.mode === 'x01') { {{ e.after }} left }
                    @else if (s.config.mode === 'cricket') { {{ e.after }} pts }
                  </span>
                </li>
              }
            </ol>
          </div>
        </div>
      }

      @if (s.winner !== null) {
        <div class="overlay">
          <div class="dialog">
            <h2>🎯 {{ s.players[s.winner].name }} wins!</h2>
            <div class="stats">
              @for (p of s.players; track $index) {
                @if (s.config.mode === 'x01') {
                  <span>{{ p.name }}: avg {{ avg(p).toFixed(1) }}, darts {{ p.darts }}, best out {{ p.highCheckout || '–' }}</span>
                } @else {
                  <span>{{ p.name }}: darts {{ p.darts }}</span>
                }
              }
            </div>
            @if (game.saveOk() === false) {
              <p class="warn">Server unreachable. Result is kept on this device and sent later.</p>
            }
            <div class="row">
              <button type="button" (click)="game.undo()">⟲ Undo last dart</button>
              <button type="button" (click)="game.rematch()">Rematch</button>
              <button type="button" class="primary" (click)="game.leave()">New game</button>
            </div>
          </div>
        </div>
      }
    }
  `,
  styles: `
    :host { display: block; height: 100%; --board-min: 420px; }
    .layout { display: grid; grid-template-columns: minmax(0, .75fr) minmax(0, 1.5fr); gap: .75rem; padding: 1rem; height: 100%; }
    .side { display: flex; flex-direction: column; gap: .5rem; min-height: 0; min-width: 0; }
    .score { display: flex; flex-direction: column; gap: .5rem; overflow-y: auto; min-height: 0; flex: 1; }
    .card { background: var(--surface); border: 3px solid transparent; border-radius: 12px; padding: .4rem .75rem; }
    .card.active { border-color: var(--accent); }
    .top { display: flex; justify-content: space-between; align-items: baseline; }
    .name { font-weight: 700; font-size: 1rem; }
    .legs { color: var(--accent); font-weight: 700; }
    .big { font-size: clamp(1.8rem, min(6vw, 8dvh), 3.2rem); font-weight: 800; line-height: 1.05; font-variant-numeric: tabular-nums; }
    .meta { display: flex; gap: 1rem; color: var(--muted); font-size: .8rem; }
    .route { margin-top: .2rem; font-size: .9rem; color: var(--accent); font-weight: 700; letter-spacing: .03em; }
    .bar { height: 8px; background: #0003; border-radius: 4px; margin: .25rem 0 .5rem; overflow: hidden; }
    .bar div { height: 100%; background: var(--accent); }
    .cricket { width: 100%; border-collapse: collapse; background: var(--surface); text-align: center; font-size: 1.2rem; }
    .cricket th, .cricket td { padding: .3rem .3rem; border-bottom: 1px solid #0003; }
    .cricket thead th { font-size: .9rem; }
    .cricket .pts { display: block; font-size: 1.3rem; color: var(--accent); }
    .cricket tbody th { color: var(--muted); font-size: 1rem; }
    .cricket .active { background: #ffffff10; }
    .cricket .closed { color: var(--accent); }
    .input { display: flex; flex-direction: column; gap: .5rem; min-height: 0; min-width: 0; }
    .board { flex: 1; min-height: 0; container-type: size; display: grid; overflow: auto; }
    /* Floor keeps small segments tappable; capped by width so it never scrolls sideways. margin:auto centres without clipping on overflow. */
    app-dartboard { --size: max(min(100cqw, 100cqh), min(var(--board-min), 100cqw)); width: var(--size); height: var(--size); margin: auto; }
    div.throws { display: flex; gap: .3rem; flex-wrap: wrap; margin-top: .25rem; }
    .chip { background: #ffffff14; padding: .1rem .55rem; border-radius: 999px; font-weight: 700; font-size: .85rem; min-width: 2.4rem; text-align: center; }
    .chip.empty { opacity: .35; }
    .bust .chip:not(.empty) { color: #f5624d; }
    .cricket .throws td { padding: .2rem; border-bottom: 1px solid #0003; }
    .cricket .chip { display: inline-block; margin: .1rem; font-size: .75rem; min-width: 0; padding: .05rem .4rem; }
    .actions { display: flex; gap: .5rem; flex: none; }
    .actions button { flex: 1; padding: .9rem; font-size: 1.1rem; min-height: 44px; }
    .actions .icon { flex: none; width: 44px; padding: 0; }
    .history .head { display: flex; justify-content: space-between; align-items: center; }
    .history .head h2 { margin: 0; }
    .history .head .icon { min-width: 44px; min-height: 44px; }
    .history ol { list-style: none; margin: .5rem 0 0; padding: 0; }
    .history li { display: grid; grid-template-columns: 2.5rem 1fr auto 6rem; gap: .5rem; padding: .4rem 0; border-bottom: 1px solid #0003; align-items: baseline; }
    .history .t { color: var(--muted); font-size: .8rem; }
    .history .d { font-weight: 700; }
    .history .r { color: var(--muted); text-align: right; font-size: .9rem; }
    .history .bust .r { color: #f5624d; font-weight: 700; }
    .muted { color: var(--muted); }
    .overlay { position: fixed; inset: 0; background: #000b; display: grid; place-items: center; padding: 1rem; z-index: 10; }
    .dialog { background: var(--surface); border-radius: 18px; padding: 1.5rem; max-width: 460px; width: 100%; max-height: 90dvh; overflow-y: auto; }
    .dialog h2 { margin-top: 0; }
    .stats { display: flex; flex-direction: column; gap: .3rem; color: var(--muted); margin-bottom: 1rem; }
    .warn { color: #f5b942; }
    .row { display: flex; gap: .5rem; flex-wrap: wrap; }
    .row button { flex: 1; }

    /* Overrides below must stay last: same specificity as the base rules above. */
    @media (max-aspect-ratio: 1/1) {
      .layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: .5rem; padding: .5rem; }
      .side { gap: .4rem; }
      .score { flex-direction: row; flex-wrap: wrap; flex: none; max-height: 28dvh; align-content: flex-start; gap: .5rem; }
      .card { flex: 1 1 8rem; padding: .3rem .6rem; }
      .cricket { font-size: clamp(.9rem, 2.8dvh, 1.2rem); }
      .cricket th, .cricket td { padding: .25rem; }
      .cricket .pts { font-size: clamp(1rem, 2.8dvh, 1.3rem); }
    }
    @media (max-height: 500px) {
      .layout { gap: .5rem; padding: .5rem; }
      .card { padding: .25rem .6rem; }
      .actions button { padding: .6rem; }
      .cricket th, .cricket td { padding: .2rem; }
      .dialog { padding: 1rem; }
      .dialog h2 { margin-bottom: .5rem; }
    }
  `,
})
export class Game {
  protected readonly game = inject(GameService);
  protected readonly state = this.game.state;
  protected readonly showHistory = signal(false);
  protected readonly reversed = computed(() => this.game.history().map((e, index) => ({ ...e, index })).reverse());
  protected readonly cricketNumbers = CRICKET_NUMBERS;
  protected readonly atcLength = ATC_SEQUENCE.length;

  protected readonly checkout = computed(() => {
    const s = this.state();
    if (!s || s.config.mode !== 'x01') return null;
    const p = s.players[s.current];
    if (s.config.x01.doubleIn && !p.opened) return null;
    const route = checkoutRoute(p.score, 3 - s.turn.length, s.config.x01.out);
    return route ? route.map(dartLabel).join('  ') : null;
  });

  /** Per player: darts of their latest turn. Stays until that player throws again. */
  protected readonly throws = computed(() => {
    const s = this.state()!;
    const history = this.game.history();
    return s.players.map((_, p) => {
      const mine = history.filter((e) => e.player === p);
      const last = mine.length ? mine[mine.length - 1].turn : -1;
      const entries = mine.filter((e) => e.turn === last);
      const labels: (string | null)[] = entries.map((e) => dartLabel(e.dart));
      while (labels.length < 3) labels.push(null);
      return { labels, bust: entries.some((e) => e.bust) };
    });
  });

  protected readonly avg = threeDartAvg;
  protected readonly label = (d: Dart): string => dartLabel(d);
  protected readonly mark = (n: number): string => MARKS[n];
  protected readonly target = (i: number): string => {
    const n = ATC_SEQUENCE[i];
    return n === undefined ? '✓' : n === 25 ? 'Bull' : String(n);
  };
}
