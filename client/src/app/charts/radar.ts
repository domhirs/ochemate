import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DoubleStat } from '../player-stats';

interface Axis {
  label: string;
  hits: number;
  attempts: number;
  rate: number;
  /** Point on the axis at full scale and at the value. */
  end: [number, number];
  value: [number, number];
  text: [number, number];
  anchor: string;
}

const MAX_AXES = 10;
const RADIUS = 110;

const name = (n: number): string => (n === 25 ? 'Bull' : `D${n}`);

function polar(r: number, i: number, count: number): [number, number] {
  const a = (i / count) * 2 * Math.PI;
  return [r * Math.sin(a), -r * Math.cos(a)];
}

/** Hit rate per finishing double. Needs three axes to make a shape; fewer show as a list. */
@Component({
  selector: 'app-radar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (axes().length >= 3) {
      <svg viewBox="-180 -150 360 300" role="img" aria-label="Hit rate per double">
        @for (g of grid(); track g.r) {
          <polygon class="grid" [attr.points]="g.points" />
          <text class="tick" [attr.x]="g.tick[0]" [attr.y]="g.tick[1]" text-anchor="middle" dominant-baseline="central">{{ g.label }}</text>
        }
        @for (a of axes(); track a.label) {
          <line class="spoke" x1="0" y1="0" [attr.x2]="a.end[0]" [attr.y2]="a.end[1]" />
        }
        <polygon class="area" [attr.points]="shape()" />
        @for (a of axes(); track a.label) {
          <circle class="dot" [class.sel]="selected() === a.label" [attr.cx]="a.value[0]" [attr.cy]="a.value[1]" r="4.5" />
          <text class="axis" [attr.x]="a.text[0]" [attr.y]="a.text[1]" [attr.text-anchor]="a.anchor" dominant-baseline="central">
            <tspan class="name">{{ a.label }}</tspan>
            <tspan [attr.x]="a.text[0]" dy="1.15em">{{ pct(a.rate) }}</tspan>
          </text>
          <!-- Hit target bigger than the dot, from the centre to past the label. -->
          <line class="hit" x1="0" y1="0" [attr.x2]="a.text[0]" [attr.y2]="a.text[1]" (click)="selected.set(a.label)" (mouseenter)="selected.set(a.label)">
            <title>{{ a.label }}: {{ a.hits }} of {{ a.attempts }}</title>
          </line>
        }
      </svg>
    } @else {
      <ul class="list">
        @for (a of axes(); track a.label) {
          <li><b>{{ a.label }}</b> {{ pct(a.rate) }}</li>
        }
      </ul>
    }
    <p class="detail">
      @if (detail(); as a) {
        <b>{{ a.label }}</b> {{ a.hits }} of {{ a.attempts }} darts hit · {{ pct(a.rate) }}
      }
    </p>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; max-width: 420px; display: block; margin: 0 auto; }
    .grid { fill: none; stroke: var(--ghost-border); stroke-width: 1; }
    .spoke { stroke: var(--ghost-border); stroke-width: 1; }
    .tick { fill: var(--muted); font: 10px system-ui, sans-serif; }
    .area { fill: color-mix(in oklab, var(--chart) 28%, transparent); stroke: var(--chart); stroke-width: 2; stroke-linejoin: round; }
    .dot { fill: var(--chart); stroke: var(--surface); stroke-width: 2; }
    .dot.sel { r: 6.5; }
    .axis { fill: var(--muted); font: 12px system-ui, sans-serif; font-variant-numeric: tabular-nums; }
    .axis .name { fill: var(--text); font-weight: 700; }
    .hit { stroke: transparent; stroke-width: 22; cursor: pointer; }
    .list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: .4rem 1rem; justify-content: center; }
    .detail { text-align: center; margin: .4rem 0 0; font-variant-numeric: tabular-nums; min-height: 1.4em; }
  `,
})
export class Radar {
  readonly doubles = input.required<DoubleStat[]>();

  protected readonly selected = signal<string | null>(null);

  /** Most tried doubles in board order (bull last), the rest folded into Other. */
  private readonly rows = computed(() => {
    const list = this.doubles();
    const top = list.slice(0, list.length > MAX_AXES ? MAX_AXES - 1 : MAX_AXES).sort((a, b) => a.n - b.n);
    const rest = list.slice(top.length);
    const rows = top.map((d) => ({ label: name(d.n), hits: d.hits, attempts: d.attempts }));
    if (rest.length) {
      rows.push({ label: 'Other', hits: rest.reduce((s, d) => s + d.hits, 0), attempts: rest.reduce((s, d) => s + d.attempts, 0) });
    }
    return rows.map((r) => ({ ...r, rate: r.attempts ? r.hits / r.attempts : 0 }));
  });

  private readonly best = computed(() => Math.max(0, ...this.rows().map((r) => r.rate)));

  protected readonly axes = computed<Axis[]>(() => {
    const rows = this.rows();
    const scale = this.scale();
    return rows.map((r, i) => {
      const rate = r.rate;
      const text = polar(RADIUS + 22, i, rows.length);
      const anchor = Math.abs(text[0]) < 8 ? 'middle' : text[0] > 0 ? 'start' : 'end';
      return {
        ...r,
        rate,
        end: polar(RADIUS, i, rows.length),
        value: polar((RADIUS * Math.min(rate, scale)) / scale, i, rows.length),
        text: [text[0], text[1] - 7],
        anchor,
      };
    });
  });

  /** Ring spacing: 10 % up to a 50 % scale, 20 % above. */
  private readonly step = computed(() => (this.best() > 0.5 ? 0.2 : 0.1));

  /** Full scale: the best rate rounded up to a ring, at least 20 % so a weak shape is not blown up. */
  private readonly scale = computed(() => {
    const step = this.step();
    return Math.max(0.2, Math.ceil(this.best() / step - 1e-9) * step);
  });

  protected readonly grid = computed(() => {
    const count = this.axes().length;
    const scale = this.scale();
    const step = this.step();
    const rings = Math.round(scale / step);
    return Array.from({ length: rings }, (_, k) => {
      const f = (k + 1) / rings;
      return {
        r: RADIUS * f,
        label: `${Math.round(scale * f * 100)}%`,
        // Between the first two spokes, so the ticks stay clear of the axis labels.
        tick: polar(RADIUS * f, 0.5, count),
        points: Array.from({ length: count }, (_, i) => polar(RADIUS * f, i, count).join(',')).join(' '),
      };
    });
  });

  protected readonly shape = computed(() => this.axes().map((a) => a.value.join(',')).join(' '));

  protected readonly detail = computed(() => {
    const all = this.axes();
    const key = this.selected();
    return (key ? all.find((a) => a.label === key) : null) ?? all.reduce<Axis | null>((b, a) => (a.attempts > (b?.attempts ?? 0) ? a : b), null);
  });

  protected pct(v: number): string {
    return `${Math.round(v * 100)}%`;
  }
}
