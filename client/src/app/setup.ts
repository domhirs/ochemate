import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Profile } from './api';
import { GameService } from './game.service';
import { Profiles, describeProfileError } from './profiles';
import { MatchConfig, Mode, OutMode, setsToWin } from './game-logic';

interface Row {
  name: string;
  /** Saved profile id, null for a guest. */
  id: string | null;
}

@Component({
  selector: 'app-setup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <h2>Game</h2>
      <div class="seg">
        @for (m of modes; track m.id) {
          <button type="button" [class.on]="mode() === m.id" (click)="mode.set(m.id)">{{ m.label }}</button>
        }
      </div>

      @if (mode() === 'x01') {
        <h3>Start score</h3>
        <div class="seg">
          @for (s of [301, 501, 701]; track s) {
            <button type="button" [class.on]="start() === s" (click)="start.set(s)">{{ s }}</button>
          }
        </div>
        <h3>Out</h3>
        <div class="seg">
          @for (o of outs; track o.id) {
            <button type="button" [class.on]="out() === o.id" (click)="out.set(o.id)">{{ o.label }}</button>
          }
        </div>
        <h3>In</h3>
        <div class="seg">
          <button type="button" [class.on]="!doubleIn()" (click)="doubleIn.set(false)">Straight in</button>
          <button type="button" [class.on]="doubleIn()" (click)="doubleIn.set(true)">Double in</button>
        </div>
        <h3>Sets to win</h3>
        <div class="seg">
          @for (n of [1, 2, 3, 4, 5, 6, 7]; track n) {
            <button type="button" [class.on]="sets() === n" (click)="sets.set(n)">{{ n }}</button>
          }
        </div>
        <h3>{{ sets() > 1 ? 'Legs per set' : 'Legs to win' }}</h3>
        <div class="seg">
          @for (l of [1, 2, 3, 4, 5]; track l) {
            <button type="button" [class.on]="legs() === l" (click)="legs.set(l)">{{ l }}</button>
          }
        </div>
        @if (sets() > 1) {
          <h3>Deciding set</h3>
          <div class="seg">
            <button type="button" [class.on]="!tieBreak()" (click)="tieBreak.set(false)">First to {{ legs() }}</button>
            <button type="button" [class.on]="tieBreak()" (click)="tieBreak.set(true)">Win by 2 legs</button>
          </div>
          @if (tieBreak()) {
            <p class="hint">Sudden-death leg at {{ 2 * legs() - 1 }}–{{ 2 * legs() - 1 }}. Two players only.</p>
          }
        }
      } @else if (mode() === 'cricket') {
        <p class="hint">Close 20 to 15 and Bull. Score on numbers your opponents have not closed.</p>
      } @else {
        <p class="hint">Hit 1 to 20, then Bull. First to finish wins.</p>
      }
    </section>

    <section class="panel">
      <h2>Players</h2>
      @for (p of players(); track $index; let i = $index) {
        <div class="player">
          @if (p.id) {
            <span class="linked" title="Saved player">👤 {{ p.name }}</span>
          } @else {
            <input [value]="p.name" (input)="rename(i, $any($event.target).value)" maxlength="30" aria-label="Player name" />
            @if (canSave(p)) {
              <button type="button" class="icon" (click)="saveProfile(i)" aria-label="Save as player profile" title="Save as player profile">💾</button>
            }
          }
          <button type="button" class="icon" (click)="move(i, -1)" [disabled]="i === 0" aria-label="Move up">↑</button>
          <button type="button" class="icon" (click)="remove(i)" [disabled]="players().length === 1" aria-label="Remove">✕</button>
        </div>
      }
      @if (saveError()) {
        <p class="warn">{{ saveError() }}</p>
      } @else if (profiles.problem(); as problem) {
        <p class="warn">{{ describe(problem) }}</p>
      }
      <button type="button" class="ghost" (click)="add()" [disabled]="players().length >= 8">+ Add guest</button>
      @if (available().length) {
        <h3>Saved players</h3>
        <div class="seg">
          @for (pr of available(); track pr.id) {
            <button type="button" (click)="addProfile(pr)" [disabled]="players().length >= 8">👤 {{ pr.name }}</button>
          }
        </div>
      }
    </section>

    <button type="button" class="primary big" (click)="go()">
      {{ game.hasGame() ? 'Start new game' : 'Start game' }}
    </button>
    @if (game.hasGame()) {
      <button type="button" class="ghost" (click)="game.view.set('game')">Back to current game</button>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 1rem; max-width: 640px; margin: 0 auto; padding: 1rem; }
    .panel { background: var(--surface); border-radius: 14px; padding: 1rem 1.25rem; }
    h2 { margin: 0 0 .75rem; font-size: 1.15rem; }
    h3 { margin: 1rem 0 .4rem; font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .seg { display: flex; gap: .5rem; flex-wrap: wrap; }
    .seg button { flex: 1; min-width: 4.5rem; }
    .hint { color: var(--muted); margin: .75rem 0 0; }
    .player { display: flex; gap: .5rem; margin-bottom: .5rem; }
    .player input { flex: 1; min-width: 0; }
    .linked { flex: 1; min-width: 0; display: flex; align-items: center; padding: 0 .9rem; min-height: 44px; border-radius: 10px; background: #ffffff0d; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .warn { color: #f5b942; margin: 0 0 .5rem; }
    .icon { width: 3rem; min-height: 44px; padding: 0; flex: none; }
    @media (max-width: 480px) { :host { padding: .5rem; } .panel { padding: .75rem; } .seg button { min-width: 0; padding: .7rem .5rem; } }
    .big { padding: 1.1rem; font-size: 1.25rem; }
  `,
})
export class Setup {
  protected readonly game = inject(GameService);
  protected readonly profiles = inject(Profiles);
  protected readonly describe = describeProfileError;

  protected readonly modes: { id: Mode; label: string }[] = [
    { id: 'x01', label: '301 / 501' },
    { id: 'cricket', label: 'Cricket' },
    { id: 'atc', label: 'Around the Clock' },
  ];
  protected readonly outs: { id: OutMode; label: string }[] = [
    { id: 'double', label: 'Double out' },
    { id: 'straight', label: 'Straight out' },
    { id: 'master', label: 'Master out' },
  ];

  private readonly init = this.game.lastConfig();
  protected readonly mode = signal<Mode>(this.init.mode);
  protected readonly start = signal(this.init.x01.start);
  protected readonly out = signal<OutMode>(this.init.x01.out);
  protected readonly doubleIn = signal(this.init.x01.doubleIn);
  protected readonly legs = signal(this.init.x01.legs);
  protected readonly sets = signal(setsToWin(this.init.x01));
  protected readonly tieBreak = signal(this.init.x01.tieBreak ?? false);
  protected readonly players = signal<Row[]>(
    this.init.players.map((name, i) => {
      const profile = this.profiles.find(this.init.playerIds?.[i]);
      return { name: profile?.name ?? name, id: profile?.id ?? null };
    }),
  );
  protected readonly saveError = signal('');

  constructor() {
    void this.profiles.refresh();
  }

  /** Saved players not already in this game. */
  protected readonly available = computed(() => {
    const used = new Set(this.players().map((p) => p.id));
    return this.profiles.list().filter((p) => !used.has(p.id));
  });

  protected rename(i: number, value: string): void {
    this.players.update((l) => l.map((p, idx) => (idx === i ? { ...p, name: value } : p)));
  }

  protected add(): void {
    this.players.update((l) => [...l, { name: `Player ${l.length + 1}`, id: null }]);
  }

  protected addProfile(p: Profile): void {
    this.players.update((l) => (l.length >= 8 ? l : [...l, { name: p.name, id: p.id }]));
  }

  /** Only guests with a real, unused name can be saved. Default names like "Player 2" are placeholders. */
  protected canSave(p: Row): boolean {
    const name = p.name.trim();
    return name.length > 0 && !/^Player \d+$/.test(name) && !this.profiles.list().some((x) => x.name.toLowerCase() === name.toLowerCase());
  }

  protected async saveProfile(i: number): Promise<void> {
    this.saveError.set('');
    const result = await this.profiles.add(this.players()[i].name.trim());
    if ('profile' in result) {
      const { id, name } = result.profile;
      this.players.update((l) => l.map((p, idx) => (idx === i ? { name, id } : p)));
    } else {
      this.saveError.set(describeProfileError(result.error, result.status));
    }
  }

  protected remove(i: number): void {
    this.players.update((l) => l.filter((_, idx) => idx !== i));
  }

  protected move(i: number, dir: -1 | 1): void {
    this.players.update((l) => {
      const copy = [...l];
      [copy[i], copy[i + dir]] = [copy[i + dir], copy[i]];
      return copy;
    });
  }

  protected go(): void {
    const rows = this.players();
    const config: MatchConfig = {
      mode: this.mode(),
      players: rows.map((p, i) => (p.id ? this.profiles.find(p.id)?.name ?? p.name : p.name.trim() || `Player ${i + 1}`)),
      playerIds: rows.map((p) => p.id),
      x01: { start: this.start(), doubleIn: this.doubleIn(), out: this.out(), legs: this.legs(), sets: this.sets(), tieBreak: this.tieBreak() },
    };
    this.game.start(config);
  }
}
