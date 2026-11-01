import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { Sound } from './sound';
import { uuid } from './uuid';
import { Dart, MatchConfig, buildHistory, defaultConfig, replay } from './game-logic';

export interface Celebration {
  id: number;
  name: string;
  /** Animation length; stretched to the voice clip when sound is on. */
  seconds: number;
}

const CELEBRATION_SECONDS = 3;

export type View = 'home' | 'setup' | 'game' | 'history' | 'players' | 'settings';

const SAVE_KEY = 'dartboard.current';
const CONFIG_KEY = 'dartboard.config';

interface Saved {
  id: string;
  config: MatchConfig;
  darts: Dart[];
  saved: boolean;
}

function load<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly api = inject(Api);
  private readonly sound = inject(Sound);

  readonly view = signal<View>('home');
  readonly lastConfig = signal<MatchConfig>(load<MatchConfig>(CONFIG_KEY) ?? defaultConfig());
  /** Server save outcome for the finished match: null = not attempted yet. */
  readonly saveOk = signal<boolean | null>(null);

  /** Live 180 celebrations only: set by a real throw, never by replay, reload or undo. */
  readonly celebrations = signal<Celebration[]>([]);
  private celebrationId = 0;

  private readonly config = signal<MatchConfig | null>(null);
  private readonly darts = signal<Dart[]>([]);
  private id = '';
  private saved = false;

  readonly state = computed(() => {
    const c = this.config();
    return c ? replay(c, this.darts()) : null;
  });
  readonly history = computed(() => {
    const c = this.config();
    return c ? buildHistory(c, this.darts()) : [];
  });
  readonly canUndo = computed(() => this.darts().length > 0);

  constructor() {
    const s = load<Saved>(SAVE_KEY);
    if (s && !s.saved) {
      this.id = s.id;
      this.config.set(s.config);
      this.darts.set(s.darts);
      this.view.set('game');
    }
    void this.api.flushPending();
  }

  hasGame(): boolean {
    return this.config() !== null;
  }

  start(config: MatchConfig): void {
    this.lastConfig.set(config);
    store(CONFIG_KEY, config);
    this.id = uuid();
    this.saved = false;
    this.saveOk.set(null);
    this.config.set(config);
    this.darts.set([]);
    this.persist();
    this.view.set('game');
  }

  rematch(): void {
    const c = this.config();
    if (!c) return;
    this.start(c);
  }

  throwDart(d: Dart): void {
    const s = this.state();
    if (!s || s.winner !== null) return;
    const thrower = s.current;
    const before = s.players[thrower].oneEighties;
    this.darts.update((list) => [...list, d]);
    this.persist();
    const after = this.state()!;
    if (after.players[thrower].oneEighties > before) this.celebrate(after.players[thrower].name);
    if (after.winner !== null) void this.finish();
  }

  undo(): void {
    if (!this.darts().length) return;
    this.celebrations.set([]);
    this.sound.stop();
    this.darts.update((list) => list.slice(0, -1));
    if (this.saved) {
      // Undoing a finished match: drop the stored result so the corrected one saves under a fresh id.
      void this.api.remove(this.id).catch(() => undefined);
      this.id = uuid();
    }
    this.saved = false;
    this.saveOk.set(null);
    this.persist();
  }

  /** Abandons the running game without saving it. */
  cancel(): void {
    this.discard('setup');
  }

  /** From the end card: the result is already saved, so drop the finished game and show the landing page. */
  goHome(): void {
    this.discard('home');
  }

  private discard(view: View): void {
    this.celebrations.set([]);
    this.sound.stop();
    this.config.set(null);
    this.darts.set([]);
    this.saved = false;
    this.saveOk.set(null);
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    this.view.set(view);
  }

  leave(): void {
    this.celebrations.set([]);
    this.sound.stop();
    this.view.set('setup');
  }

  private celebrate(name: string): void {
    const id = ++this.celebrationId;
    const clip = this.sound.play('180');
    const seconds = Math.max(CELEBRATION_SECONDS, clip + 0.4);
    this.celebrations.update((l) => [...l, { id, name, seconds }]);
    setTimeout(() => this.celebrations.update((l) => l.filter((c) => c.id !== id)), seconds * 1000);
  }

  private async finish(): Promise<void> {
    const c = this.config();
    if (!c || this.saved) return;
    this.saved = true;
    this.persist();
    this.saveOk.set(await this.api.save({ id: this.id, config: c, darts: this.darts() }));
  }

  private persist(): void {
    const c = this.config();
    if (c) store(SAVE_KEY, { id: this.id, config: c, darts: this.darts(), saved: this.saved } satisfies Saved);
  }
}
