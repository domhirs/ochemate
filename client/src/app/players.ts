import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Profile } from './api';
import { ProfileResult, Profiles } from './profiles';

@Component({
  selector: 'app-players',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <h2>Players</h2>
      <p class="hint">Saved players keep their stats across matches. Pick them when you start a game.</p>

      <form class="add" (submit)="$event.preventDefault(); add()">
        <input
          [value]="newName()"
          (input)="newName.set($any($event.target).value)"
          maxlength="30"
          placeholder="New player name"
          aria-label="New player name"
        />
        <button type="submit" class="primary" [disabled]="!newName().trim()">Add</button>
      </form>
      @if (error()) {
        <p class="warn">{{ error() }}</p>
      }
      @if (profiles.offline()) {
        <p class="warn">Server unreachable. Showing the last known list.</p>
      }

      @for (p of profiles.list(); track p.id) {
        <div class="row">
          @if (editing() === p.id) {
            <input
              class="grow"
              [value]="draft()"
              (input)="draft.set($any($event.target).value)"
              (keydown.enter)="saveRename(p)"
              (keydown.escape)="editing.set(null)"
              maxlength="30"
              aria-label="Player name"
            />
            <button type="button" class="icon" (click)="saveRename(p)" [disabled]="!draft().trim()" aria-label="Save name">✓</button>
            <button type="button" class="icon" (click)="editing.set(null)" aria-label="Cancel">✕</button>
          } @else {
            <span class="grow name">👤 {{ p.name }}</span>
            <button type="button" class="icon" (click)="startRename(p)" aria-label="Rename {{ p.name }}">✎</button>
            <button type="button" class="icon" (click)="remove(p)" aria-label="Delete {{ p.name }}">🗑</button>
          }
        </div>
      } @empty {
        <p class="muted">No saved players yet.</p>
      }
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 1rem; max-width: 640px; margin: 0 auto; padding: 1rem; }
    .panel { background: var(--surface); border-radius: 14px; padding: 1rem 1.25rem; }
    h2 { margin: 0 0 .5rem; font-size: 1.15rem; }
    .hint, .muted { color: var(--muted); margin: 0 0 .75rem; }
    .warn { color: #f5b942; margin: .5rem 0; }
    .add { display: flex; gap: .5rem; margin-bottom: .75rem; }
    .add input { flex: 1; min-width: 0; }
    .row { display: flex; gap: .5rem; align-items: center; padding: .35rem 0; border-top: 1px solid #0003; }
    .grow { flex: 1; min-width: 0; }
    .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icon { width: 3rem; min-height: 44px; padding: 0; flex: none; }
    @media (max-width: 480px) { :host { padding: .5rem; } .panel { padding: .75rem; } }
  `,
})
export class Players {
  protected readonly profiles = inject(Profiles);

  protected readonly newName = signal('');
  protected readonly error = signal('');
  protected readonly editing = signal<string | null>(null);
  protected readonly draft = signal('');

  protected async add(): Promise<void> {
    this.error.set('');
    const result = await this.profiles.add(this.newName().trim());
    if ('profile' in result) this.newName.set('');
    else this.error.set(this.message(result));
  }

  protected startRename(p: Profile): void {
    this.error.set('');
    this.draft.set(p.name);
    this.editing.set(p.id);
  }

  protected async saveRename(p: Profile): Promise<void> {
    const name = this.draft().trim();
    if (!name) return;
    if (name === p.name) return this.editing.set(null);
    const result = await this.profiles.rename(p.id, name);
    if ('profile' in result) {
      this.editing.set(null);
      this.error.set('');
    } else {
      this.error.set(this.message(result));
    }
  }

  protected async remove(p: Profile): Promise<void> {
    if (!confirm(`Delete player "${p.name}"? Played matches are kept.`)) return;
    if (!(await this.profiles.remove(p.id))) this.error.set('Could not delete the player. Is the server reachable?');
  }

  private message(r: Exclude<ProfileResult, { profile: Profile }>): string {
    return r.error === 'taken' ? 'That name is already in use.' : r.error === 'invalid' ? 'Names need 1 to 30 characters.' : 'Server unreachable. Try again later.';
  }
}
