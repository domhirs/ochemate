import { Injectable, computed, signal } from '@angular/core';

export interface ThemeDef {
  id: string;
  label: string;
  icon: string;
  /** Browser/tablet chrome color; keep in sync with --bg in styles.css. */
  chrome: string;
}

/** Add a theme here and as a `:root[data-theme='<id>']` token block in styles.css. The first entry is the default. */
export const THEMES: ThemeDef[] = [
  { id: 'dark', label: 'Dark', icon: '🌙', chrome: '#14171c' },
  { id: 'light', label: 'Light', icon: '☀️', chrome: '#eef1f5' },
  { id: 'ocean', label: 'Ocean', icon: '🌊', chrome: '#0a1628' },
];

const KEY = 'dartboard.theme';

@Injectable({ providedIn: 'root' })
export class Theme {
  readonly id = signal(initial());
  readonly current = computed(() => THEMES.find((t) => t.id === this.id()) ?? THEMES[0]);

  constructor() {
    apply(this.current());
  }

  set(id: string): void {
    const theme = THEMES.find((t) => t.id === id);
    if (!theme) return;
    this.id.set(theme.id);
    apply(theme);
    try {
      localStorage.setItem(KEY, theme.id);
    } catch {
      /* ignore */
    }
  }
}

function initial(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return THEMES[0].id;
}

function apply(theme: ThemeDef): void {
  document.documentElement.dataset['theme'] = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.chrome);
}
