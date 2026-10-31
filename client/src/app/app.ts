import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { BRAND } from './brand';
import { Game } from './game';
import { GameService } from './game.service';
import { History } from './history';
import { Home } from './home';
import { Players } from './players';
import { Setup } from './setup';
import { Sound } from './sound';
import { THEMES, Theme } from './theme';

@Component({
  selector: 'app-root',
  imports: [Game, History, Home, Players, Setup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <button type="button" class="logo" [attr.aria-label]="brand.name + ' home'" (click)="game.view.set('home')"><img class="mark" src="brand/mark.png" alt="" /><span class="word">{{ brand.wordmark.lead }}<b>{{ brand.wordmark.accent }}</b></span></button>
      <nav>
        @if (game.hasGame()) {
          <button type="button" [class.on]="game.view() === 'game'" (click)="game.view.set('game')">Game</button>
        }
        <button type="button" [class.on]="game.view() === 'setup'" (click)="game.view.set('setup')">New</button>
        <button type="button" [class.on]="game.view() === 'history'" (click)="game.view.set('history')">History</button>
        <button type="button" class="people" [class.on]="game.view() === 'players'" aria-label="Players" (click)="game.view.set('players')"><span aria-hidden="true">👤</span><span class="lbl"> Players</span></button>
        <div class="themes">
          <button type="button" class="sound" aria-haspopup="listbox" [attr.aria-expanded]="themeMenu()" aria-label="Theme" title="Theme" (click)="themeMenu.set(!themeMenu())">{{ theme.current().icon }}</button>
          @if (themeMenu()) {
            <div class="backdrop" (click)="themeMenu.set(false)"></div>
            <ul class="menu" role="listbox" aria-label="Theme" (keydown.escape)="themeMenu.set(false)">
              @for (t of themes; track t.id) {
                <li role="option" [attr.aria-selected]="t.id === theme.id()">
                  <button type="button" [class.on]="t.id === theme.id()" (click)="pickTheme(t.id)"><span aria-hidden="true">{{ t.icon }}</span> {{ t.label }}</button>
                </li>
              }
            </ul>
          }
        </div>
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
    .logo { display: flex; align-items: center; gap: .5rem; font-family: var(--font-brand); font-weight: 800; font-style: italic; font-size: 1.15rem; letter-spacing: .02em; background: transparent; border: 0; padding: .25rem .5rem; margin-left: -.5rem; min-height: 44px; border-radius: 10px; }
    .logo .mark { height: 2rem; width: 2rem; }
    .word b { color: var(--accent); }
    nav { display: flex; gap: .4rem; }
    .themes { position: relative; }
    .backdrop { position: fixed; inset: 0; z-index: 20; }
    .menu { position: absolute; right: 0; top: calc(100% + .4rem); z-index: 21; list-style: none; margin: 0; padding: .35rem; min-width: 10rem; background: var(--surface); border: 1px solid var(--ghost-border); border-radius: 14px; box-shadow: 0 8px 24px var(--scrim); display: flex; flex-direction: column; gap: .25rem; }
    .menu button { width: 100%; text-align: left; min-height: 44px; padding: .5rem .8rem; }
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
  protected readonly brand = BRAND;
  protected readonly game = inject(GameService);
  protected readonly sound = inject(Sound);
  protected readonly theme = inject(Theme);
  protected readonly themes = THEMES;
  protected readonly themeMenu = signal(false);

  protected pickTheme(id: string): void {
    this.theme.set(id);
    this.themeMenu.set(false);
  }
}
