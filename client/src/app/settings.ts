import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Api, Voice } from './api';
import { BRAND } from './brand';
import { Legal } from './legal';
import { Profiles } from './profiles';
import { DEFAULT_VOICE, Sound } from './sound';
import { THEMES, Theme } from './theme';
import { VOICE_EVENTS, VoiceError, Voices, describeVoiceError } from './voices';

/** Longest recording the app accepts: the call plays while the 180 animation runs. */
const MAX_SECONDS = 10;

interface Status {
  kind: 'ok' | 'warn';
  text: string;
}

@Component({
  selector: 'app-settings',
  imports: [Legal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      #picker
      type="file"
      hidden
      accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,.mp3,.m4a,.wav,.ogg"
      (change)="picked($event)"
    />

    <section class="panel">
      <h2>Theme</h2>
      <div class="themes" role="radiogroup" aria-label="Theme">
        @for (t of themes; track t.id) {
          <button type="button" role="radio" [attr.aria-checked]="t.id === theme.id()" [class.on]="t.id === theme.id()" (click)="theme.set(t.id)">
            <span aria-hidden="true">{{ t.icon }}</span> {{ t.label }}
          </button>
        }
      </div>
    </section>

    <section class="panel">
      <h2>Sound</h2>
      <div class="row">
        <span>Sound effects</span>
        <button type="button" role="switch" [attr.aria-checked]="sound.enabled()" [class.on]="sound.enabled()" (click)="sound.toggle()">
          {{ sound.enabled() ? '🔊 On' : '🔇 Off' }}
        </button>
      </div>
      <div class="row">
        <label for="volume">Volume</label>
        <input id="volume" type="range" min="0" max="100" step="5" [value]="volumePct()" [disabled]="!sound.enabled()" (input)="setVolume($any($event.target).value)" />
        <output for="volume">{{ volumePct() }}%</output>
      </div>
      <button type="button" [disabled]="!sound.enabled()" (click)="test()">▶ Play test call</button>
    </section>

    <section class="panel">
      <h2>Voice</h2>
      <p class="hint">The voice that calls out events such as a 180. Upload your own recordings (MP3, M4A, WAV or OGG, up to {{ MAX_SECONDS }} seconds). They are stored on the server, so every device can use them.</p>

      <ul class="voices" role="radiogroup" aria-label="Voice">
        <li class="voice" [class.active]="sound.voice() === DEFAULT">
          <div class="head">
            <button type="button" class="pick" role="radio" [attr.aria-checked]="sound.voice() === DEFAULT" (click)="choose(DEFAULT)">
              <span class="dot" aria-hidden="true"></span> Default <small>built-in</small>
            </button>
          </div>
        </li>
        @for (v of voices.list(); track v.id) {
          <li class="voice" [class.active]="sound.voice() === v.id">
            <div class="head">
              @if (editing() === v.id) {
                <input class="grow" [value]="draft()" maxlength="30" aria-label="Voice name" (input)="draft.set($any($event.target).value)" (keydown.enter)="saveRename(v)" (keydown.escape)="editing.set(null)" />
                <button type="button" class="icon" [disabled]="!draft().trim()" aria-label="Save name" (click)="saveRename(v)">✓</button>
                <button type="button" class="icon" aria-label="Cancel" (click)="editing.set(null)">✕</button>
              } @else {
                <button type="button" class="pick" role="radio" [attr.aria-checked]="sound.voice() === v.id" (click)="choose(v.id)">
                  <span class="dot" aria-hidden="true"></span> {{ v.name }}
                </button>
                @if (voices.uploads()) {
                  <button type="button" class="icon" [attr.aria-label]="'Rename ' + v.name" (click)="startRename(v)">✎</button>
                  <button type="button" class="icon" [attr.aria-label]="'Delete ' + v.name" (click)="removeVoice(v)">🗑</button>
                }
              }
            </div>
            <ul class="clips">
              @for (e of events; track e.id) {
                <li>
                  <span class="ev">{{ e.label }}</span>
                  @if (v.clips[e.id]; as c) {
                    <small class="muted">{{ kb(c.size) }}</small>
                    <button type="button" class="small" (click)="preview(v, e.id)">▶ Play</button>
                    @if (voices.uploads()) {
                      <button type="button" class="small" [disabled]="busy()" (click)="pick(v.id, e.id, picker)">Replace</button>
                      <button type="button" class="small" [disabled]="busy()" (click)="removeClip(v, e.id)">Remove</button>
                    }
                  } @else {
                    <small class="muted">uses the default</small>
                    @if (voices.uploads()) {
                      <button type="button" class="small" [disabled]="busy()" (click)="pick(v.id, e.id, picker)">⬆ Upload</button>
                    }
                  }
                </li>
              }
            </ul>
          </li>
        }
      </ul>

      @if (voices.uploads()) {
        <form class="add" (submit)="$event.preventDefault(); addVoice()">
          <input name="voice" [value]="newName()" maxlength="30" placeholder="New voice name" aria-label="New voice name" (input)="newName.set($any($event.target).value)" />
          <button type="submit" class="primary" [disabled]="!newName().trim() || busy()">Add voice</button>
        </form>
      } @else {
        <p class="muted note">Uploads are turned off on this server. Existing voices can still be used.</p>
      }

      @if (status(); as s) {
        <p [class.warn]="s.kind === 'warn'" [class.ok]="s.kind === 'ok'" role="status">{{ s.text }}</p>
      } @else if (voices.problem(); as p) {
        <p class="warn" role="status">{{ describe(p) }}</p>
      }
    </section>

    <section class="panel">
      <h2>Data</h2>
      <p class="hint">Move players and match history to another instance, for example a new server or a development copy. Voices and device settings are not included.</p>
      <div class="actions">
        <button type="button" [disabled]="dataBusy()" (click)="exportData()">⬇ Export data</button>
        @if (importEnabled()) {
          <button type="button" [disabled]="dataBusy()" (click)="importPicker.click()">⬆ Import data</button>
        }
      </div>
      <input #importPicker type="file" hidden accept=".json,application/json" (change)="importPicked($event)" />
      @if (!importEnabled()) {
        <p class="muted note">Import is turned off on this server.</p>
      } @else {
        <p class="muted note">Importing replaces all players and matches on this instance.</p>
      }
      @if (dataStatus(); as s) {
        <p [class.warn]="s.kind === 'warn'" [class.ok]="s.kind === 'ok'" role="status">{{ s.text }}</p>
      }
    </section>

    <section class="panel">
      <h2>About</h2>
      <p class="hint">
        {{ brand.name }} v{{ brand.version }}
        @if (build(); as b) {
          · build {{ b }}
        }
        ·
        <a [href]="brand.source.changelog" target="_blank" rel="noopener noreferrer">Changelog</a>
      </p>
      <p class="hint">{{ brand.name }} is free software under the AGPL-3.0. {{ brand.tagline }}</p>
      <app-legal />
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 1rem; max-width: 640px; margin: 0 auto; padding: 1rem; }
    .panel { background: var(--surface); border-radius: 14px; padding: 1rem 1.25rem; }
    h2 { margin: 0 0 .75rem; font-size: 1.15rem; }
    .hint { color: var(--muted); margin: 0 0 .75rem; font-size: .9rem; }
    .hint a { color: var(--accent); text-decoration: underline; }
    .muted { color: var(--muted); }
    .note { margin: .75rem 0 0; font-size: .9rem; }
    .warn { color: var(--warn); margin: .75rem 0 0; }
    .ok { color: var(--accent); margin: .75rem 0 0; }
    .themes { display: flex; flex-wrap: wrap; gap: .5rem; }
    .themes button { min-height: 44px; }
    .row { display: flex; align-items: center; gap: .75rem; margin-bottom: .75rem; min-height: 44px; }
    .row > span, .row > label { flex: 0 0 6.5rem; }
    .row input[type=range] { flex: 1; min-width: 0; padding: 0; background: transparent; accent-color: var(--accent); min-height: 44px; }
    .row output { flex: 0 0 3rem; text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
    .voices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
    .voice { background: var(--fill); border: 2px solid transparent; border-radius: 12px; padding: .35rem .5rem .5rem; }
    .voice.active { border-color: var(--accent); }
    .head { display: flex; align-items: center; gap: .4rem; }
    .grow { flex: 1; min-width: 0; }
    .pick { flex: 1; min-width: 0; display: flex; align-items: center; gap: .6rem; text-align: left; background: transparent; border: 0; min-height: 44px; padding: .4rem .5rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pick small { color: var(--muted); font-weight: 400; }
    .dot { flex: none; width: 1.1rem; height: 1.1rem; border-radius: 50%; border: 2px solid var(--muted); }
    .voice.active .dot { border-color: var(--accent); background: radial-gradient(var(--accent) 45%, transparent 50%); }
    .icon { width: 3rem; min-height: 44px; padding: 0; flex: none; }
    .clips { list-style: none; margin: 0; padding: 0 .5rem; display: flex; flex-direction: column; gap: .25rem; }
    .clips li { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; min-height: 40px; }
    .clips .ev { flex: 1 1 6rem; font-size: .9rem; }
    .small { padding: .3rem .7rem; min-height: 40px; font-size: .9rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
    .actions button { min-height: 44px; }
    .add { display: flex; gap: .5rem; margin-top: .75rem; }
    .add input { flex: 1; min-width: 0; }
    @media (max-width: 480px) { :host { padding: .5rem; } .panel { padding: .75rem; } .row > span, .row > label { flex-basis: 5rem; } }
  `,
})
export class Settings implements OnInit {
  protected readonly brand = BRAND;
  protected readonly theme = inject(Theme);
  protected readonly sound = inject(Sound);
  protected readonly voices = inject(Voices);
  private readonly api = inject(Api);

  protected readonly themes = THEMES;
  protected readonly events = VOICE_EVENTS;
  protected readonly DEFAULT = DEFAULT_VOICE;
  protected readonly MAX_SECONDS = MAX_SECONDS;
  protected readonly describe = describeVoiceError;

  protected readonly volumePct = computed(() => Math.round(this.sound.volume() * 100));
  protected readonly newName = signal('');
  protected readonly editing = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly busy = signal(false);
  protected readonly status = signal<Status | null>(null);
  protected readonly build = signal<string | null>(null);
  protected readonly importEnabled = signal(true);
  protected readonly dataBusy = signal(false);
  protected readonly dataStatus = signal<Status | null>(null);

  private readonly profiles = inject(Profiles);
  private target: { id: string; event: string } | null = null;
  private audio: HTMLAudioElement | null = null;

  ngOnInit(): void {
    void this.voices.refresh();
    this.api.build().then((b) => this.build.set(b), () => undefined);
    this.api.transfer().then((t) => this.importEnabled.set(t.importEnabled), () => undefined);
  }

  protected async exportData(): Promise<void> {
    this.dataStatus.set(null);
    this.dataBusy.set(true);
    try {
      const blob = await this.api.exportData();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `ochemate-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      this.dataStatus.set({ kind: 'ok', text: 'Export downloaded.' });
    } catch {
      this.dataStatus.set({ kind: 'warn', text: 'The export failed. Is the server reachable?' });
    } finally {
      this.dataBusy.set(false);
    }
  }

  protected async importPicked(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.dataStatus.set(null);
    let data: { format?: unknown; version?: unknown; players?: unknown; matches?: unknown };
    try {
      data = JSON.parse(await file.text());
    } catch {
      return this.dataStatus.set({ kind: 'warn', text: 'That file is not an export file.' });
    }
    if (data?.format !== 'ochemate-export' || !Array.isArray(data.players) || !Array.isArray(data.matches)) {
      return this.dataStatus.set({ kind: 'warn', text: 'That file is not an export file.' });
    }
    const summary = `${data.players.length} players and ${data.matches.length} matches`;
    if (!confirm(`Import ${summary}?\n\nThis replaces ALL players and matches on this instance. This cannot be undone.`)) return;
    this.dataBusy.set(true);
    try {
      await this.api.importData(data);
      await this.profiles.refresh();
      this.dataStatus.set({ kind: 'ok', text: `Imported ${summary}.` });
    } catch (err) {
      this.dataStatus.set({ kind: 'warn', text: this.importError(err) });
    } finally {
      this.dataBusy.set(false);
    }
  }

  private importError(err: unknown): string {
    switch ((err as { status?: number })?.status) {
      case 400: return 'The server rejected the file: it is damaged or not a valid export. Nothing was changed.';
      case 403: return 'Import is turned off on this server.';
      case 413: return 'The file is too large to import.';
      default: return 'The import failed. Nothing was changed if the server rejected it.';
    }
  }

  protected setVolume(value: string): void {
    this.sound.setVolume(Number(value) / 100);
  }

  protected async test(): Promise<void> {
    this.status.set(null);
    const length = await this.sound.test('180');
    if (!length) this.status.set({ kind: 'warn', text: 'No recording could be played for this voice.' });
  }

  protected async choose(id: string): Promise<void> {
    this.status.set(null);
    await this.sound.select(id);
  }

  protected async addVoice(): Promise<void> {
    this.status.set(null);
    const result = await this.voices.add(this.newName().trim());
    if ('voice' in result) {
      this.newName.set('');
      this.status.set({ kind: 'ok', text: `Voice "${result.voice.name}" added. Upload a recording for it below.` });
    } else this.fail(result.error);
  }

  protected startRename(v: Voice): void {
    this.status.set(null);
    this.draft.set(v.name);
    this.editing.set(v.id);
  }

  protected async saveRename(v: Voice): Promise<void> {
    const name = this.draft().trim();
    if (!name) return;
    if (name === v.name) return this.editing.set(null);
    const result = await this.voices.rename(v.id, name);
    if ('voice' in result) {
      this.editing.set(null);
      this.status.set(null);
    } else this.fail(result.error);
  }

  protected async removeVoice(v: Voice): Promise<void> {
    if (!confirm(`Delete voice "${v.name}" and its recordings?`)) return;
    const result = await this.voices.remove(v.id);
    if (result !== true) return this.fail(result.error);
    if (this.sound.voice() === v.id) await this.sound.select(DEFAULT_VOICE);
  }

  protected async removeClip(v: Voice, event: string): Promise<void> {
    const result = await this.voices.removeClip(v.id, event);
    if (result !== true) return this.fail(result.error);
    if (this.sound.voice() === v.id) await this.sound.prepare();
  }

  protected pick(id: string, event: string, input: HTMLInputElement): void {
    this.target = { id, event };
    this.status.set(null);
    input.click();
  }

  protected async picked(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const target = this.target;
    if (!file || !target) return;
    if (file.size > this.voices.maxClipBytes()) return this.fail('too-large');
    if (!(await this.decodable(file))) {
      this.status.set({ kind: 'warn', text: `Could not read that audio file, or it is longer than ${MAX_SECONDS} seconds.` });
      return;
    }
    this.busy.set(true);
    const result = await this.voices.uploadClip(target.id, target.event, file);
    this.busy.set(false);
    if (result !== true) return this.fail(result.error);
    if (this.sound.voice() === target.id) await this.sound.prepare();
    this.status.set({ kind: 'ok', text: 'Recording saved.' });
  }

  protected preview(v: Voice, event: string): void {
    const clip = v.clips[event];
    if (!clip) return;
    this.sound.stop();
    this.audio?.pause();
    this.audio = new Audio(`api/voices/${encodeURIComponent(v.id)}/clips/${encodeURIComponent(event)}?v=${encodeURIComponent(clip.updatedAt)}`);
    this.audio.volume = this.sound.volume();
    void this.audio.play().catch(() => this.status.set({ kind: 'warn', text: 'This recording could not be played.' }));
  }

  protected kb(bytes: number): string {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  /** The browser has to be able to decode the file, and it must be short: both are checked before uploading. */
  private async decodable(file: Blob): Promise<boolean> {
    const ctx = new AudioContext();
    try {
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      return buffer.duration > 0.1 && buffer.duration <= MAX_SECONDS;
    } catch {
      return false;
    } finally {
      void ctx.close();
    }
  }

  private fail(error: VoiceError): void {
    this.status.set({ kind: 'warn', text: describeVoiceError(error) });
  }
}
