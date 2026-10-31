import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BRAND } from './brand';
import { GameService } from './game.service';
import { Legal } from './legal';

@Component({
  selector: 'app-home',
  imports: [Legal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <img class="mark" src="brand/mark.png" alt="" />
      <h1>{{ brand.wordmark.lead }}<b>{{ brand.wordmark.accent }}</b></h1>
      <p class="tag">{{ brand.tagline }}</p>
    </section>

    <div class="actions">
      @if (game.hasGame()) {
        <button type="button" class="primary big" (click)="game.view.set('game')">Resume game</button>
        <button type="button" class="big" (click)="game.view.set('setup')">New game</button>
      } @else {
        <button type="button" class="primary big" (click)="game.view.set('setup')">New game</button>
      }
      <div class="pair">
        <button type="button" (click)="game.view.set('history')"><span aria-hidden="true">📜</span> History</button>
        <button type="button" (click)="game.view.set('players')"><span aria-hidden="true">👤</span> Players</button>
      </div>
    </div>

    <p class="modes">X01 · Cricket · Around the Clock</p>

    <app-legal />
  `,
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5rem; min-height: 100%; max-width: 420px; margin: 0 auto; padding: 1.5rem 1rem; text-align: center; }
    .mark { width: clamp(4rem, 20vmin, 7rem); height: auto; }
    h1 { margin: .25rem 0 0; font-size: clamp(2.2rem, 10vmin, 3.5rem); letter-spacing: .02em; font-family: var(--font-brand); font-style: italic; font-weight: 800; color: var(--text-strong); }
    h1 b { color: var(--accent); }
    .tag { margin: .5rem 0 0; color: var(--muted); }
    .actions { display: flex; flex-direction: column; gap: .75rem; width: 100%; }
    .big { padding: 1.1rem; font-size: 1.25rem; }
    .pair { display: flex; gap: .75rem; }
    .pair button { flex: 1; min-height: 52px; }
    .modes { margin: 0; color: var(--muted); font-size: .85rem; letter-spacing: .06em; }
    @media (max-height: 500px) { :host { flex-direction: row; flex-wrap: wrap; gap: 1rem; max-width: 760px; } .hero { flex: 1 1 14rem; } .actions { flex: 1 1 14rem; } .modes, app-legal { width: 100%; } }
  `,
})
export class Home {
  protected readonly brand = BRAND;
  protected readonly game = inject(GameService);
}
