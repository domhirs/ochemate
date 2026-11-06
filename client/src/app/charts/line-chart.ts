import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { LegPoint } from '../player-stats';

/** Drawn at the width it gets on screen (within these bounds), so labels keep their real pixel size. */
const MIN_W = 280;
const MAX_W = 720;
const H = 220;
const PAD = { left: 34, right: 12, top: 14, bottom: 30 };

interface Plotted extends LegPoint {
  x: number;
  y: number;
}

/** 3-dart average by visit in the leg, with the overall average as a dashed reference. */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + w() + ' ' + h" role="img" aria-label="Average by visit in the leg" (mouseleave)="selected.set(null)">
      @for (t of ticks(); track t.v) {
        <line class="grid" [attr.x1]="pad.left" [attr.x2]="w() - pad.right" [attr.y1]="t.y" [attr.y2]="t.y" />
        <text class="tick" [attr.x]="pad.left - 6" [attr.y]="t.y" text-anchor="end" dominant-baseline="central">{{ t.v }}</text>
      }
      @if (reference(); as r) {
        <line class="ref" [attr.x1]="pad.left" [attr.x2]="w() - pad.right" [attr.y1]="r.y" [attr.y2]="r.y" />
        <text class="ref-label" [attr.x]="w() - pad.right" [attr.y]="r.y - 5" text-anchor="end">avg {{ r.v.toFixed(1) }}</text>
      }
      @if (active(); as a) {
        <line class="cross" [attr.x1]="a.x" [attr.x2]="a.x" [attr.y1]="pad.top" [attr.y2]="h - pad.bottom" />
      }
      <polyline class="line" [attr.points]="line()" />
      @for (p of plotted(); track p.visit) {
        <circle class="dot" [class.sel]="active()?.visit === p.visit" [attr.cx]="p.x" [attr.cy]="p.y" r="4" />
        <text class="tick" [attr.x]="p.x" [attr.y]="h - pad.bottom + 16" text-anchor="middle">{{ p.visit }}</text>
        <rect class="hit" [attr.x]="p.x - step() / 2" [attr.y]="pad.top" [attr.width]="step()" [attr.height]="h - pad.top - pad.bottom" (click)="selected.set(p.visit)" (mouseenter)="selected.set(p.visit)">
          <title>Visit {{ p.visit }}: {{ p.avg.toFixed(1) }} ({{ p.samples }} visits)</title>
        </rect>
      }
    </svg>
    <p class="detail">
      @if (active(); as a) {
        <b>Visit {{ a.visit }}</b> (darts {{ a.visit * 3 - 2 }}–{{ a.visit * 3 }}) · avg {{ a.avg.toFixed(1) }} · {{ a.samples }} visits
      }
    </p>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; max-width: 720px; display: block; margin: 0 auto; }
    .grid { stroke: var(--ghost-border); stroke-width: 1; }
    .tick { fill: var(--muted); font: 11px system-ui, sans-serif; font-variant-numeric: tabular-nums; }
    .ref { stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 4 4; }
    .ref-label { fill: var(--muted); font: 11px system-ui, sans-serif; }
    .cross { stroke: var(--muted); stroke-width: 1; }
    .line { fill: none; stroke: var(--chart); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
    .dot { fill: var(--chart); stroke: var(--surface); stroke-width: 2; }
    .dot.sel { r: 6; }
    .hit { fill: transparent; cursor: pointer; }
    .detail { text-align: center; margin: .4rem 0 0; font-variant-numeric: tabular-nums; min-height: 1.4em; }
  `,
})
export class LineChart {
  readonly points = input.required<LegPoint[]>();
  /** Overall 3-dart average, drawn as a reference line. */
  readonly average = input<number | null>(null);

  protected readonly w = signal(560);
  protected readonly h = H;
  protected readonly pad = PAD;
  protected readonly selected = signal<number | null>(null);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const observer = new ResizeObserver(() => this.w.set(Math.round(Math.min(MAX_W, Math.max(MIN_W, host.clientWidth)))));
    afterNextRender(() => observer.observe(host));
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  /** Rounded to 10s, so the axis has clean ticks. */
  private readonly domain = computed(() => {
    const values = this.points().map((p) => p.avg);
    const ref = this.average();
    if (ref !== null) values.push(ref);
    const lo = Math.floor(Math.min(...values) / 10) * 10;
    const hi = Math.max(lo + 10, Math.ceil(Math.max(...values) / 10) * 10);
    return { lo, hi };
  });

  private y(v: number): number {
    const { lo, hi } = this.domain();
    return PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  }

  protected readonly step = computed(() => (this.w() - PAD.left - PAD.right) / Math.max(1, this.points().length));

  protected readonly plotted = computed<Plotted[]>(() =>
    this.points().map((p, i) => ({ ...p, x: PAD.left + this.step() * (i + 0.5), y: this.y(p.avg) })),
  );

  protected readonly line = computed(() => this.plotted().map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));

  protected readonly ticks = computed(() => {
    const { lo, hi } = this.domain();
    const every = hi - lo > 40 ? 20 : 10;
    const out: { v: number; y: number }[] = [];
    for (let v = lo; v <= hi; v += every) out.push({ v, y: this.y(v) });
    return out;
  });

  protected readonly reference = computed(() => {
    const v = this.average();
    return v === null ? null : { v, y: this.y(v) };
  });

  protected readonly active = computed(() => this.plotted().find((p) => p.visit === this.selected()) ?? null);
}
