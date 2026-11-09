import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { TrendPoint } from '../player-stats';

const MIN_W = 280;
const MAX_W = 720;
const H = 220;
const PAD = { left: 34, right: 12, top: 14, bottom: 30 };

const fmtDate = (t: number): string => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** 3-dart average per game as dots over time, the moving average as a line. */
@Component({
  selector: 'app-trend-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + w() + ' ' + h" role="img" aria-label="3-dart average over time" (mouseleave)="selected.set(null)">
      @for (t of ticks(); track t.v) {
        <line class="grid" [attr.x1]="pad.left" [attr.x2]="w() - pad.right" [attr.y1]="t.y" [attr.y2]="t.y" />
        <text class="tick" [attr.x]="pad.left - 6" [attr.y]="t.y" text-anchor="end" dominant-baseline="central">{{ t.v }}</text>
      }
      <text class="tick" [attr.x]="pad.left" [attr.y]="h - pad.bottom + 16" text-anchor="start">{{ first() }}</text>
      <text class="tick" [attr.x]="w() - pad.right" [attr.y]="h - pad.bottom + 16" text-anchor="end">{{ last() }}</text>
      @if (active(); as a) {
        <line class="cross" [attr.x1]="a.x" [attr.x2]="a.x" [attr.y1]="pad.top" [attr.y2]="h - pad.bottom" />
      }
      @for (p of plotted(); track $index) {
        <circle class="dot" [attr.cx]="p.x" [attr.cy]="p.y" r="3" />
      }
      <polyline class="line" [attr.points]="line()" />
      @for (p of plotted(); track $index) {
        <rect class="hit" [attr.x]="p.x - step() / 2" [attr.y]="pad.top" [attr.width]="step()" [attr.height]="h - pad.top - pad.bottom" (click)="selected.set(p.t)" (mouseenter)="selected.set(p.t)" />
      }
    </svg>
    <p class="detail">
      @if (active(); as a) {
        <b>{{ date(a.t) }}</b> · game {{ a.avg.toFixed(1) }} · moving avg {{ a.ma.toFixed(1) }}
      }
    </p>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; max-width: 720px; display: block; margin: 0 auto; }
    .grid { stroke: var(--ghost-border); stroke-width: 1; }
    .tick { fill: var(--muted); font: 11px system-ui, sans-serif; font-variant-numeric: tabular-nums; }
    .cross { stroke: var(--muted); stroke-width: 1; }
    .line { fill: none; stroke: var(--chart); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
    .dot { fill: var(--muted); opacity: .6; }
    .hit { fill: transparent; cursor: pointer; }
    .detail { text-align: center; margin: .4rem 0 0; font-variant-numeric: tabular-nums; min-height: 1.4em; }
  `,
})
export class TrendChart {
  readonly points = input.required<TrendPoint[]>();

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

  protected date = fmtDate;

  private readonly domain = computed(() => {
    const values = this.points().flatMap((p) => [p.avg, p.ma]);
    const lo = Math.floor(Math.min(...values) / 10) * 10;
    return { lo, hi: Math.max(lo + 10, Math.ceil(Math.max(...values) / 10) * 10) };
  });

  private y(v: number): number {
    const { lo, hi } = this.domain();
    return PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  }

  /** Games sit on a real time axis, so a long break shows as a gap. */
  protected readonly plotted = computed(() => {
    const pts = this.points();
    const t0 = pts[0].t;
    const span = Math.max(1, pts[pts.length - 1].t - t0);
    const inner = this.w() - PAD.left - PAD.right - 12;
    return pts.map((p) => ({ ...p, x: PAD.left + 6 + ((p.t - t0) / span) * inner, y: this.y(p.avg), my: this.y(p.ma) }));
  });

  protected readonly step = computed(() => Math.max(8, (this.w() - PAD.left - PAD.right) / Math.max(1, this.points().length)));
  protected readonly line = computed(() => this.plotted().map((p) => `${p.x.toFixed(1)},${p.my.toFixed(1)}`).join(' '));
  protected readonly first = computed(() => fmtDate(this.points()[0].t));
  protected readonly last = computed(() => fmtDate(this.points()[this.points().length - 1].t));
  protected readonly active = computed(() => this.plotted().find((p) => p.t === this.selected()) ?? null);

  protected readonly ticks = computed(() => {
    const { lo, hi } = this.domain();
    const every = hi - lo > 40 ? 20 : 10;
    const out: { v: number; y: number }[] = [];
    for (let v = lo; v <= hi; v += every) out.push({ v, y: this.y(v) });
    return out;
  });
}
