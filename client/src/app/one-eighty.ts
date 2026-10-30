import { ChangeDetectionStrategy, Component, input } from '@angular/core';

const COLORS = ['#ffd23f', '#ff4d4d', '#3ddc84', '#4da3ff', '#ffffff', '#ff9f1c'];

interface Piece {
  left: number;
  delay: number;
  duration: number;
  size: number;
  spin: number;
  color: string;
}

// Fixed pseudo-random spread so every celebration looks lively but the markup stays deterministic.
const PIECES: Piece[] = Array.from({ length: 44 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 90) / 100,
  duration: 1.6 + ((i * 29) % 12) / 10,
  size: 8 + ((i * 11) % 9),
  spin: 360 + ((i * 71) % 540),
  color: COLORS[i % COLORS.length],
}));

/** Full-screen "ONE HUNDRED AND EIGHTY!" burst. Lives about 3 s; the parent removes it. Never blocks taps. */
@Component({
  selector: 'app-one-eighty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--dur]': 'seconds() + "s"' },
  template: `
    <div class="shade"></div>
    <div class="rays"></div>
    @for (p of pieces; track $index) {
      <i
        class="piece"
        [style.left.%]="p.left"
        [style.width.px]="p.size"
        [style.height.px]="p.size * 0.6"
        [style.background]="p.color"
        [style.animation-delay.s]="p.delay"
        [style.animation-duration.s]="p.duration"
        [style.--spin.deg]="p.spin"
      ></i>
    }
    <div class="stage" role="status">
      <div class="title"><span>ONE HUNDRED</span><span>AND EIGHTY!</span></div>
      <div class="who">{{ name() }}</div>
    </div>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 20; pointer-events: none; display: grid; place-items: center; overflow: hidden; animation: life var(--dur, 3s) both; }
    .shade { position: absolute; inset: 0; background: radial-gradient(circle at center, #000a 0%, #0000 75%); }
    .rays {
      position: absolute; width: 160vmax; height: 160vmax; left: 50%; top: 50%; margin: -80vmax 0 0 -80vmax; opacity: .55;
      background: repeating-conic-gradient(from 0deg, #ffd23f55 0deg 10deg, #0000 10deg 24deg);
      -webkit-mask-image: radial-gradient(circle, #000 0%, #0000 60%); mask-image: radial-gradient(circle, #000 0%, #0000 60%);
      animation: spin 6s linear infinite;
    }
    .stage { position: relative; text-align: center; animation: pop var(--dur, 3s) cubic-bezier(.2, 1.4, .4, 1) both; }
    .title { display: flex; flex-direction: column; font-weight: 900; font-size: clamp(2rem, 11vmin, 6.5rem); line-height: 1; letter-spacing: .02em; }
    .title span {
      background: linear-gradient(180deg, #fff6c2 0%, #ffd23f 45%, #ff9f1c 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
      -webkit-text-stroke: 2px #7a3b00; paint-order: stroke fill; filter: drop-shadow(0 6px 0 #7a3b00) drop-shadow(0 0 24px #ff9f1c99);
    }
    .who { margin-top: 1rem; font-size: clamp(1.1rem, 4.5vmin, 2.2rem); font-weight: 700; color: #fff; text-shadow: 0 2px 8px #000; }
    .piece { position: absolute; top: -5vh; border-radius: 2px; animation: fall linear both; }

    @keyframes life { 0% { opacity: 0; } 8% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }
    @keyframes pop {
      0% { transform: scale(.2) rotate(-8deg); }
      14% { transform: scale(1.18) rotate(3deg); }
      22% { transform: scale(1) rotate(0); }
      30% { transform: scale(1.04) rotate(-1.5deg); }
      38% { transform: scale(1) rotate(0); }
      100% { transform: scale(1.06); }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fall { 0% { transform: translateY(0) rotate(0); } 100% { transform: translateY(115vh) rotate(var(--spin)); } }

    @media (prefers-reduced-motion: reduce) {
      .rays, .piece { display: none; }
      .stage { animation: none; }
    }
  `,
})
export class OneEighty {
  readonly name = input.required<string>();
  readonly seconds = input(3);
  protected readonly pieces = PIECES;
}
