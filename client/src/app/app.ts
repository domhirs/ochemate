import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BRAND } from './brand';
import { Game } from './game';
import { GameService, View } from './game.service';
import { History } from './history';
import { Home } from './home';
import { Players } from './players';
import { Settings } from './settings';
import { Setup } from './setup';
import { Theme } from './theme';

interface MenuItem {
  view: View;
  icon: string;
  label: string;
}

@Component({
  selector: 'app-root',
  imports: [Game, History, Home, Players, Settings, Setup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'menuOpen.set(false)' },
  template: `
    <header>
      <button type="button" class="logo" [attr.aria-label]="brand.name + ' home'" (click)="game.view.set('home')"><img class="mark" src="brand/mark.png" alt="" /><span class="word">{{ brand.wordmark.lead }}<b>{{ brand.wordmark.accent }}</b></span></button>
      <nav>
        @if (game.hasGame()) {
          <button type="button" [class.on]="game.view() === 'game'" (click)="game.view.set('game')">Game</button>
        }
        <button type="button" [class.on]="game.view() === 'setup'" (click)="game.view.set('setup')">New</button>
        <div class="burger">
          <button type="button" class="menu-btn" [class.on]="inMenuView()" aria-haspopup="menu" [attr.aria-expanded]="menuOpen()" aria-label="Menu" (click)="menuOpen.set(!menuOpen())">☰</button>
          @if (menuOpen()) {
            <div class="backdrop" (click)="menuOpen.set(false)"></div>
            <ul class="menu" role="menu" aria-label="Menu">
              @for (item of items; track item.view) {
                <li role="none">
                  <button type="button" role="menuitem" [class.on]="game.view() === item.view" (click)="open(item.view)"><span aria-hidden="true">{{ item.icon }}</span> {{ item.label }}</button>
                </li>
              }
            </ul>
          }
        </div>
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
        @case ('settings') {
          <app-settings />
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
    .burger { position: relative; }
    .backdrop { position: fixed; inset: 0; z-index: 20; }
    .menu { position: absolute; right: 0; top: calc(100% + .4rem); z-index: 21; list-style: none; margin: 0; padding: .35rem; min-width: 11rem; background: var(--surface); border: 1px solid var(--ghost-border); border-radius: 14px; box-shadow: 0 8px 24px var(--scrim); display: flex; flex-direction: column; gap: .25rem; }
    .menu button { width: 100%; text-align: left; min-height: 44px; padding: .5rem .8rem; }
    nav button { padding: .5rem 1rem; min-height: 44px; }
    nav .menu-btn { padding: .5rem .75rem; min-width: 44px; font-size: 1.25rem; line-height: 1; }
    @media (max-width: 480px) {
      header { padding: .5rem; gap: .4rem; }
      .word { display: none; }
      .logo { margin-left: 0; }
      nav { gap: .3rem; }
      nav button { padding: .5rem .7rem; }
      nav .menu-btn { padding: .5rem; }
    }
    @media (max-height: 500px) { header { padding: .25rem .75rem; } nav button { min-height: 38px; padding: .25rem .8rem; } }
    main { flex: 1; min-height: 0; overflow-y: auto; }
  `,
})
export class App {
  protected readonly brand = BRAND;
  protected readonly game = inject(GameService);
  // Injected for its side effect: the saved theme must be applied at startup, whichever view is open.
  private readonly theme = inject(Theme);

  protected readonly items: MenuItem[] = [
    { view: 'history', icon: '📜', label: 'History' },
    { view: 'players', icon: '👤', label: 'Players' },
    { view: 'settings', icon: '⚙️', label: 'Settings' },
  ];
  protected readonly menuOpen = signal(false);
  protected readonly inMenuView = computed(() => this.items.some((i) => i.view === this.game.view()));

  protected open(view: View): void {
    this.game.view.set(view);
    this.menuOpen.set(false);
  }
}
