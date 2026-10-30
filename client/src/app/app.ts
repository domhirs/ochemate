import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Game } from './game';
import { GameService } from './game.service';
import { History } from './history';
import { Home } from './home';
import { Players } from './players';
import { Setup } from './setup';
import { Sound } from './sound';
import { Theme } from './theme';

@Component({
  selector: 'app-root',
  imports: [Game, History, Home, Players, Setup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <button type="button" class="logo" aria-label="dartzn home" (click)="game.view.set('home')">🎯<span class="word"> dartzn</span></button>
      <nav>
        @if (game.hasGame()) {
          <button type="button" [class.on]="game.view() === 'game'" (click)="game.view.set('game')">Game</button>
        }
        <button type="button" [class.on]="game.view() === 'setup'" (click)="game.view.set('setup')">New</button>
        <button type="button" [class.on]="game.view() === 'history'" (click)="game.view.set('history')">History</button>
        <button type="button" class="people" [class.on]="game.view() === 'players'" aria-label="Players" (click)="game.view.set('players')"><span aria-hidden="true">👤</span><span class="lbl"> Players</span></button>
        <button type="button" class="sound" [attr.aria-label]="'Switch to ' + theme.next().label + ' theme'" [attr.title]="'Switch to ' + theme.next().label + ' theme'" (click)="theme.cycle()">{{ theme.current().icon }}</button>
        <button type="button" class="sound" [attr.aria-pressed]="sound.enabled()" [attr.aria-label]="sound.enabled() ? 'Sound on' : 'Sound off'" (click)="sound.toggle()">{{ sound.enabled() ? '🔊' : '🔇' }}</button>
      </nav>
    </header>
    <main>
      @switch (game.view()) {
        @case ('home') {
          <app-home />
        }
        @case ('setup') {
          <app-setup />
        }
        @case ('game') {
          <app-game />
        }
        @case ('history') {
          <app-history />
        }
        @case ('players') {
          <app-players />
        }
      }
    </main>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100dvh; }
    header { display: flex; align-items: center; justify-content: space-between; padding: .5rem 1rem; background: var(--surface); }
    .logo { font-weight: 800; font-size: 1.1rem; background: transparent; border: 0; padding: .25rem .5rem; margin-left: -.5rem; min-height: 44px; border-radius: 10px; }
    nav { display: flex; gap: .4rem; }
    nav button { padding: .5rem 1rem; min-height: 44px; }
    nav .sound { padding: .5rem .75rem; min-width: 44px; }
    @media (max-width: 480px) {
      header { padding: .5rem; gap: .4rem; }
      .word { display: none; }
      .logo { margin-left: 0; }
      nav { gap: .3rem; }
      nav button { padding: .5rem .7rem; }
      nav .sound { padding: .5rem; }
      .lbl { display: none; }
      nav .people { padding: .5rem; min-width: 44px; }
    }
    @media (max-height: 500px) { header { padding: .25rem .75rem; } nav button { min-height: 38px; padding: .25rem .8rem; } }
    main { flex: 1; min-height: 0; overflow-y: auto; }
  `,
})
export class App {
  protected readonly game = inject(GameService);
  protected readonly sound = inject(Sound);
  protected readonly theme = inject(Theme);
}
