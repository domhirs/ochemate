import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BRAND } from './brand';

/** The open-source notice with the source link (AGPL-3.0 section 13) and the non-affiliation line. */
@Component({
  selector: 'app-legal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="links">
      Open source (AGPL-3.0) ·
      <a [href]="brand.source.repo" target="_blank" rel="noopener noreferrer">Source code</a> ·
      <a [href]="brand.source.license" target="_blank" rel="noopener noreferrer">License</a>
    </p>
    <p class="note">{{ brand.disclaimer }}</p>
  `,
  styles: `
    :host { display: block; text-align: center; color: var(--muted); font-size: .8rem; }
    p { margin: 0; }
    .note { margin-top: .25rem; }
    a { color: var(--accent); text-decoration: underline; -webkit-user-select: text; user-select: text; }
  `,
})
export class Legal {
  protected readonly brand = BRAND;
}
