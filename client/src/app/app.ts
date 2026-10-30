import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Game } from './game';
import { GameService } from './game.service';
import { History } from './history';
import { Setup } from './setup';

@Component({
  selector: 'app-root',
  imports: [Game, History, Setup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <span class="logo">🎯 Darts</span>
      <nav>
        @if (game.hasGame()) {
          <button type="button" [class.on]="game.view() === 'game'" (click)="game.view.set('game')">Game</button>
        }
        <button type="button" [class.on]="game.view() === 'setup'" (click)="game.view.set('setup')">New</button>
        <button type="button" [class.on]="game.view() === 'history'" (click)="game.view.set('history')">History</button>
      </nav>
    </header>
    <main>
      @switch (game.view()) {
        @case ('setup') {
          <app-setup />
        }
        @case ('game') {
          <app-game />
        }
        @case ('history') {
          <app-history />
        }
      }
    </main>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100dvh; }
    header { display: flex; align-items: center; justify-content: space-between; padding: .5rem 1rem; background: var(--surface); }
    .logo { font-weight: 800; font-size: 1.1rem; }
    nav { display: flex; gap: .4rem; }
    nav button { padding: .5rem 1rem; min-height: 44px; }
    @media (max-height: 500px) { header { padding: .25rem .75rem; } nav button { min-height: 38px; padding: .25rem .8rem; } }
    main { flex: 1; min-height: 0; overflow-y: auto; }
  `,
})
export class App {
  protected readonly game = inject(GameService);
}
