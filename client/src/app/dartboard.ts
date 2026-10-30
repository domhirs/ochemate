import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { Dart } from './game-logic';

const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// Based on a regulation board (outer edge 170) but with thicker double/triple rings and a bigger bull, so they are easy to hit by touch.
const R = { bull: 11, outerBull: 25, tripleIn: 86, tripleOut: 110, doubleIn: 146, doubleOut: 170 };

interface Segment {
  path: string;
  dart: Dart;
  fill: string;
  label: string;
}

interface NumberLabel {
  n: number;
  x: number;
  y: number;
}

function pt(r: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
}

function ring(r1: number, r2: number, a1: number, a2: number): string {
  return `M${pt(r2, a1)} A${r2} ${r2} 0 0 1 ${pt(r2, a2)} L${pt(r1, a2)} A${r1} ${r1} 0 0 0 ${pt(r1, a1)} Z`;
}

function buildSegments(): Segment[] {
  const out: Segment[] = [];
  ORDER.forEach((n, i) => {
    const a1 = i * 18 - 9;
    const a2 = i * 18 + 9;
    const dark = i % 2 === 0;
    const single = dark ? '#1b1b1b' : '#efe4c8';
    const color = dark ? '#c8312b' : '#2e8b4f';
    out.push(
      { path: ring(R.outerBull, R.tripleIn, a1, a2), dart: { n, m: 1 }, fill: single, label: `Single ${n}` },
      { path: ring(R.tripleIn, R.tripleOut, a1, a2), dart: { n, m: 3 }, fill: color, label: `Triple ${n}` },
      { path: ring(R.tripleOut, R.doubleIn, a1, a2), dart: { n, m: 1 }, fill: single, label: `Single ${n}` },
      { path: ring(R.doubleIn, R.doubleOut, a1, a2), dart: { n, m: 2 }, fill: color, label: `Double ${n}` },
    );
  });
  return out;
}

@Component({
  selector: 'app-dartboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="-205 -205 410 410" role="group" aria-label="Dartboard">
      <circle r="204" fill="#101010" />
      @for (s of segments; track $index) {
        <path [attr.d]="s.path" [attr.fill]="s.fill" [attr.aria-label]="s.label" (click)="thrown.emit(s.dart)" />
      }
      <circle [attr.r]="r.outerBull" fill="#2e8b4f" (click)="thrown.emit({ n: 25, m: 1 })" aria-label="Single bull" />
      <circle [attr.r]="r.bull" fill="#c8312b" (click)="thrown.emit({ n: 25, m: 2 })" aria-label="Bull" />
      @for (l of labels; track l.n) {
        <text [attr.x]="l.x" [attr.y]="l.y" text-anchor="middle" dominant-baseline="central">{{ l.n }}</text>
      }
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; height: 100%; display: block; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
    path, circle[aria-label] { cursor: pointer; stroke: #00000055; stroke-width: 0.6; }
    path:active, circle[aria-label]:active { filter: brightness(1.6); }
    text { fill: #f3f3f3; font: 700 17px system-ui, sans-serif; pointer-events: none; user-select: none; }
  `,
})
export class Dartboard {
  readonly thrown = output<Dart>();
  protected readonly r = R;
  protected readonly segments = buildSegments();
  protected readonly labels: NumberLabel[] = ORDER.map((n, i) => {
    const [x, y] = pt(187, i * 18).split(' ').map(Number);
    return { n, x, y };
  });
}
