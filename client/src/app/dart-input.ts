import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { Dart } from './game-logic';

const KINDS = [
  { m: 1 as const, label: 'Single' },
  { m: 2 as const, label: 'Double' },
  { m: 3 as const, label: 'Triple' },
];

/** Keyboard-style dart entry for corrections: multiplier, number (1-20 or 25 for bull) and a miss button. */
@Component({
  selector: 'app-dart-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="kinds" role="radiogroup" aria-label="Multiplier">
      @for (k of kinds; track k.m) {
        <button type="button" role="radio" [attr.aria-checked]="mult() === k.m" [class.on]="mult() === k.m" (click)="mult.set(k.m)">{{ k.label }}</button>
      }
    </div>
    <label class="num">
      <span>Number (1-20, 25 = bull)</span>
      <input type="number" inputmode="numeric" min="1" max="25" step="1" [value]="value()" (input)="onInput($event)" (keydown.enter)="apply()" />
    </label>
    @if (problem(); as p) {
      <small class="warn">{{ p }}</small>
    }
    <div class="row">
      <button type="button" class="primary" [disabled]="!!problem() || value() === ''" (click)="apply()">Apply</button>
      <button type="button" (click)="picked.emit({ n: 0, m: 0 })">Miss</button>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: .5rem; width: 100%; }
    .kinds { display: flex; gap: .5rem; }
    .kinds button { flex: 1; min-height: 44px; }
    .kinds .on { font-weight: 700; }
    .num { display: flex; flex-direction: column; gap: .2rem; font-size: .85rem; color: var(--muted); }
    .num input { font-size: 1.4rem; min-height: 44px; text-align: center; }
    .row { display: flex; gap: .5rem; }
    .row button { flex: 1; min-height: 44px; }
    .warn { color: var(--warn); }
  `,
})
export class DartInput {
  /** Dart being replaced; prefills the form. */
  readonly initial = input<Dart | null>(null);
  readonly picked = output<Dart>();

  protected readonly kinds = KINDS;
  protected readonly mult = signal<1 | 2 | 3>(1);
  protected readonly value = signal('');

  protected readonly problem = computed(() => {
    const v = this.value();
    if (v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || !((n >= 1 && n <= 20) || n === 25)) return 'Number must be 1-20 or 25.';
    if (n === 25 && this.mult() === 3) return 'Bull has no triple.';
    return null;
  });

  constructor() {
    // Re-fills when the parent switches to another dart without recreating this component.
    effect(() => {
      const d = this.initial();
      const hit = d && d.m > 0 ? d : null;
      this.mult.set(hit ? (hit.m as 1 | 2 | 3) : 1);
      this.value.set(hit ? String(hit.n) : '');
    });
  }

  protected onInput(e: Event): void {
    this.value.set((e.target as HTMLInputElement).value);
  }

  protected apply(): void {
    if (this.problem() || this.value() === '') return;
    this.picked.emit({ n: Number(this.value()), m: this.mult() });
  }
}
