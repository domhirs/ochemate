import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GameState, setsToWin } from './game-logic';

const OUT_LABEL = { straight: 'straight out', double: 'double out', master: 'master out' } as const;

/** TV-style summary of an x01 match: format line, legs per completed set, live set and sets won. */
@Component({
  selector: 'app-match-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    <div class="ov">
      <div class="fmt">
        <b>{{ format() }}</b>
        <span>{{ s.config.x01.start }} · {{ out() }}{{ s.config.x01.doubleIn ? ' · double in' : '' }}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th></th>
            @if (sets() > 1) {
              @for (_ of s.setLog; track $index) {
                <th>S{{ $index + 1 }}</th>
              }
              @if (s.winner === null) {
                <th class="cur">S{{ s.set }}</th>
              }
              <th class="tot">Sets</th>
            } @else {
              <th class="cur tot">Legs</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (p of s.players; track $index; let i = $index) {
            <tr [class.active]="i === s.current && s.winner === null">
              <th class="name">
                <span class="dot" [class.on]="i === s.legStarter && s.winner === null" title="Throws first this leg"></span>
                <span class="txt">{{ p.name }}</span>
              </th>
              @if (sets() > 1) {
                @for (r of s.setLog; track $index) {
                  <td [class.won]="won(r, i)">{{ r[i] }}</td>
                }
                @if (s.winner === null) {
                  <td class="cur">{{ p.legs }}</td>
                }
                <td class="tot">{{ p.sets }}</td>
              } @else {
                <td class="cur tot">{{ p.legs }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; }
    .ov { background: var(--surface); border-radius: 12px; padding: .4rem .6rem; overflow-x: auto; }
    .fmt { display: flex; justify-content: space-between; gap: .75rem; align-items: baseline; flex-wrap: wrap; font-size: .8rem; color: var(--muted); margin-bottom: .2rem; }
    .fmt b { color: var(--accent); text-transform: uppercase; letter-spacing: .06em; font-size: .75rem; }
    table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    th, td { padding: .15rem .45rem; text-align: center; font-size: .95rem; font-weight: 600; }
    thead th { color: var(--muted); font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
    .name { text-align: left; font-weight: 700; display: flex; align-items: center; gap: .35rem; max-width: 9rem; }
    .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dot { width: .5rem; height: .5rem; border-radius: 50%; flex: none; border: 1px solid var(--muted); }
    .dot.on { background: var(--accent); border-color: var(--accent); }
    td { color: var(--muted); }
    td.won { color: var(--text); }
    .cur { background: #ffffff10; }
    td.cur { color: var(--text); }
    .tot { color: var(--accent); font-size: 1.15rem; font-weight: 800; }
    tbody tr.active .txt { color: var(--accent); }
    tbody tr + tr > * { border-top: 1px solid #0003; }
  `,
})
export class MatchOverview {
  readonly state = input.required<GameState>();

  protected won(legs: number[], i: number): boolean {
    return legs.every((l, j) => j === i || l < legs[i]);
  }

  protected readonly sets = computed(() => setsToWin(this.state().config.x01));
  protected readonly out = computed(() => OUT_LABEL[this.state().config.x01.out]);
  protected readonly format = computed(() => {
    const o = this.state().config.x01;
    const sets = setsToWin(o);
    const legs = `${o.legs} ${o.legs === 1 ? 'leg' : 'legs'}`;
    if (sets === 1) return `First to ${legs}`;
    return `First to ${sets} sets · ${legs} per set${o.tieBreak && this.state().players.length === 2 ? ' · decider by 2 legs' : ''}`;
  });
}
