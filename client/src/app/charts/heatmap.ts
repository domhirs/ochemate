import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ORDER, R, pt, ring } from '../dartboard';
import { boardKey } from '../player-stats';

interface Field {
  key: string;
  path: string;
  label: string;
  count: number;
}

const RING_NAME = ['', 'Single', 'Double', 'Triple'];

const fieldLabel = (n: number, m: number): string => (n === 25 ? (m === 2 ? 'Bull' : 'Single bull') : `${RING_NAME[m]} ${n}`);

/** Where the darts landed. The log does not tell inner from outer single, so both single areas share one count. */
@Component({
  selector: 'app-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="-205 -205 410 410" role="img" [attr.aria-label]="'Dartboard heatmap of ' + throws() + ' darts'">
      <circle r="204" class="rim" />
      @for (f of fields(); track $index) {
        <path
          [attr.d]="f.path"
          [style.fill]="fill(f.count)"
          [class.sel]="selected() === f.key"
          (click)="selected.set(f.key)"
          (mouseenter)="selected.set(f.key)"
        >
          <title>{{ f.label }}: {{ f.count }}</title>
        </path>
      }
      @for (l of labels; track l.n) {
        <text [attr.x]="l.x" [attr.y]="l.y" text-anchor="middle" dominant-baseline="central">{{ l.n }}</text>
      }
    </svg>
    <div class="legend">
      <span>0</span>
      <span class="ramp" aria-hidden="true"></span>
      <span>{{ max() }}</span>
    </div>
    <p class="detail">
      @if (detail(); as d) {
        <b>{{ d.label }}</b> {{ d.count }} {{ d.count === 1 ? 'dart' : 'darts' }} · {{ share(d.count) }}
      }
      <span class="muted">· {{ misses() }} {{ misses() === 1 ? 'miss' : 'misses' }} of {{ throws() }}</span>
    </p>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; max-width: 420px; display: block; margin: 0 auto; -webkit-tap-highlight-color: transparent; }
    .rim { fill: var(--heat-zero); }
    path { stroke: var(--surface); stroke-width: 1.2; cursor: pointer; }
    path.sel { stroke: var(--text); stroke-width: 2.5; }
    text { fill: var(--muted); font: 700 17px system-ui, sans-serif; pointer-events: none; }
    .legend { display: flex; align-items: center; gap: .5rem; justify-content: center; color: var(--muted); font-size: .8rem; font-variant-numeric: tabular-nums; margin-top: .5rem; }
    .ramp { width: 9rem; height: .6rem; border-radius: 4px; background: linear-gradient(to right, var(--heat-zero), var(--heat)); }
    .detail { text-align: center; margin: .4rem 0 0; font-variant-numeric: tabular-nums; min-height: 1.4em; }
    .muted { color: var(--muted); }
  `,
})
export class Heatmap {
  readonly board = input.required<Map<string, number>>();
  readonly throws = input.required<number>();
  readonly misses = input.required<number>();

  protected readonly selected = signal<string | null>(null);

  protected readonly labels = ORDER.map((n, i) => {
    const [x, y] = pt(187, i * 18).split(' ').map(Number);
    return { n, x, y };
  });

  protected readonly fields = computed<Field[]>(() => {
    const board = this.board();
    const field = (n: number, m: number, path: string): Field => ({ key: boardKey(n, m), path, label: fieldLabel(n, m), count: board.get(boardKey(n, m)) ?? 0 });
    const out: Field[] = [];
    ORDER.forEach((n, i) => {
      const a1 = i * 18 - 9;
      const a2 = i * 18 + 9;
      out.push(
        field(n, 1, ring(R.outerBull, R.tripleIn, a1, a2)),
        field(n, 3, ring(R.tripleIn, R.tripleOut, a1, a2)),
        field(n, 1, ring(R.tripleOut, R.doubleIn, a1, a2)),
        field(n, 2, ring(R.doubleIn, R.doubleOut, a1, a2)),
      );
    });
    out.push(field(25, 1, circle(R.outerBull)), field(25, 2, circle(R.bull)));
    return out;
  });

  protected readonly max = computed(() => Math.max(0, ...this.board().values()));

  /** The tapped field, else the most hit one. */
  protected readonly detail = computed(() => {
    const all = this.fields();
    const key = this.selected();
    if (key) return all.find((f) => f.key === key) ?? null;
    return all.reduce<Field | null>((best, f) => (f.count > (best?.count ?? 0) ? f : best), null);
  });

  /** Square root so a few very busy fields do not wash out the rest. */
  protected fill(count: number): string {
    const max = this.max();
    const t = max ? Math.sqrt(count / max) : 0;
    return `color-mix(in oklab, var(--heat) ${Math.round(t * 100)}%, var(--heat-zero))`;
  }

  protected share(count: number): string {
    const t = this.throws();
    return t ? `${Math.round((count / t) * 100)}%` : '–';
  }
}

function circle(r: number): string {
  return `M0 ${-r} A${r} ${r} 0 1 1 0 ${r} A${r} ${r} 0 1 1 0 ${-r} Z`;
}
