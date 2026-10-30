import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { Dart, MatchConfig, defaultConfig, replay } from './game-logic';

export type View = 'setup' | 'game' | 'history';

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

  readonly view = signal<View>('setup');
  readonly lastConfig = signal<MatchConfig>(load<MatchConfig>(CONFIG_KEY) ?? defaultConfig());
  /** Server save outcome for the finished match: null = not attempted yet. */
  readonly saveOk = signal<boolean | null>(null);

  private readonly config = signal<MatchConfig | null>(null);
  private readonly darts = signal<Dart[]>([]);
  private id = '';
  private saved = false;

  readonly state = computed(() => {
    const c = this.config();
    return c ? replay(c, this.darts()) : null;
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
    this.id = crypto.randomUUID();
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
    this.darts.update((list) => [...list, d]);
    this.persist();
    if (this.state()!.winner !== null) void this.finish();
  }

  undo(): void {
    if (!this.darts().length) return;
    this.darts.update((list) => list.slice(0, -1));
    if (this.saved) {
      // Undoing a finished match: drop the stored result so the corrected one saves under a fresh id.
      void this.api.remove(this.id).catch(() => undefined);
      this.id = crypto.randomUUID();
    }
    this.saved = false;
    this.saveOk.set(null);
    this.persist();
  }

  leave(): void {
    this.view.set('setup');
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
