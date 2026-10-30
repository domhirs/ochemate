import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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
                </div>
              }
            }
          }
        </div>

        <div class="input">
          <div class="turn">
            <span class="who">{{ s.winner === null ? s.players[s.current].name : '' }}</span>
            @for (d of s.turn; track $index) {
              <span class="chip">{{ label(d) }}</span>
            }
            @for (_ of emptySlots(); track $index) {
              <span class="chip empty">–</span>
            }
            @if (s.lastTurn; as lt) {
              @if (s.turn.length === 0 && s.config.mode === 'x01' && s.winner === null) {
                <span class="last">Last: {{ s.players[lt.player].name }} {{ lt.bust ? 'BUST' : lt.total }}</span>
              }
            }
          </div>
          <app-dartboard (thrown)="game.throwDart($event)" />
          <div class="actions">
            <button type="button" (click)="game.undo()" [disabled]="!game.canUndo()">⟲ Undo</button>
            <button type="button" (click)="game.throwDart({ n: 0, m: 0 })">Miss</button>
          </div>
        </div>
      </div>

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
    :host { display: block; height: 100%; }
    .layout { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(0, 1.2fr); gap: 1rem; padding: 1rem; height: 100%; box-sizing: border-box; }
    @media (max-width: 800px) and (orientation: portrait) { .layout { grid-template-columns: 1fr; height: auto; } }
    .score { display: flex; flex-direction: column; gap: .75rem; overflow-y: auto; }
    .card { background: var(--surface); border: 3px solid transparent; border-radius: 14px; padding: .75rem 1rem; }
    .card.active { border-color: var(--accent); }
    .top { display: flex; justify-content: space-between; align-items: baseline; }
    .name { font-weight: 700; font-size: 1.1rem; }
    .legs { color: var(--accent); font-weight: 700; }
    .big { font-size: clamp(3rem, 9vw, 5.5rem); font-weight: 800; line-height: 1.05; font-variant-numeric: tabular-nums; }
    .meta { display: flex; gap: 1rem; color: var(--muted); font-size: .9rem; }
    .route { margin-top: .4rem; color: var(--accent); font-weight: 700; letter-spacing: .03em; }
    .bar { height: 8px; background: #0003; border-radius: 4px; margin: .25rem 0 .5rem; overflow: hidden; }
    .bar div { height: 100%; background: var(--accent); }
    .cricket { width: 100%; border-collapse: collapse; background: var(--surface); text-align: center; font-size: 1.6rem; }
    .cricket th, .cricket td { padding: .55rem .4rem; border-bottom: 1px solid #0003; }
    .cricket thead th { font-size: 1rem; }
    .cricket .pts { display: block; font-size: 1.8rem; color: var(--accent); }
    .cricket tbody th { color: var(--muted); font-size: 1.1rem; }
    .cricket .active { background: #ffffff10; }
    .cricket .closed { color: var(--accent); }
    .input { display: flex; flex-direction: column; gap: .5rem; min-height: 0; }
    app-dartboard { max-height: calc(100dvh - 11rem); aspect-ratio: 1; align-self: center; width: 100%; }
    .turn { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; min-height: 2.6rem; }
    .who { font-weight: 700; margin-right: auto; }
    .chip { background: var(--surface); padding: .35rem .8rem; border-radius: 999px; font-weight: 700; min-width: 3rem; text-align: center; }
    .chip.empty { opacity: .35; }
    .last { color: var(--muted); font-size: .85rem; flex-basis: 100%; }
    .actions { display: flex; gap: .5rem; }
    .actions button { flex: 1; padding: .9rem; font-size: 1.1rem; }
    .overlay { position: fixed; inset: 0; background: #000b; display: grid; place-items: center; padding: 1rem; z-index: 10; }
    .dialog { background: var(--surface); border-radius: 18px; padding: 1.5rem; max-width: 460px; width: 100%; }
    .dialog h2 { margin-top: 0; }
    .stats { display: flex; flex-direction: column; gap: .3rem; color: var(--muted); margin-bottom: 1rem; }
    .warn { color: #f5b942; }
    .row { display: flex; gap: .5rem; flex-wrap: wrap; }
    .row button { flex: 1; }
  `,
})
export class Game {
  protected readonly game = inject(GameService);
  protected readonly state = this.game.state;
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

  protected readonly emptySlots = computed(() => {
    const s = this.state();
    return s && s.winner === null ? Array(Math.max(0, 3 - s.turn.length)).fill(0) : [];
  });

  protected readonly avg = threeDartAvg;
  protected readonly label = (d: Dart): string => dartLabel(d);
  protected readonly mark = (n: number): string => MARKS[n];
  protected readonly target = (i: number): string => {
    const n = ATC_SEQUENCE[i];
    return n === undefined ? '✓' : n === 25 ? 'Bull' : String(n);
  };
}
