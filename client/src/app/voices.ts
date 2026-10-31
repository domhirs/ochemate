import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Api, Voice } from './api';

/** Events a voice can have a clip for. Keep in sync with EVENTS in server/voices.js. */
export const VOICE_EVENTS: { id: string; label: string }[] = [{ id: '180', label: '180 call' }];

export type VoiceError = 'taken' | 'invalid' | 'limit' | 'disabled' | 'too-large' | 'format' | 'offline' | 'failed';
export type VoiceResult = { voice: Voice } | { error: VoiceError };

const UNREACHABLE = new Set([0, 502, 503, 504]);

function toError(e: unknown): VoiceError {
  if (!(e instanceof HttpErrorResponse)) return 'failed';
  if (UNREACHABLE.has(e.status)) return 'offline';
  if (e.status === 400) return 'invalid';
  if (e.status === 403) return 'disabled';
  if (e.status === 409) return e.error?.error === 'limit' ? 'limit' : 'taken';
  if (e.status === 413) return 'too-large';
  if (e.status === 415) return 'format';
  return 'failed';
}

export function describeVoiceError(e: VoiceError): string {
  switch (e) {
    case 'taken':
      return 'That voice name is already in use.';
    case 'invalid':
      return 'Names need 1 to 30 characters.';
    case 'limit':
      return 'The server holds the maximum number of voices. Delete one first.';
    case 'disabled':
      return 'Uploads are turned off on this server.';
    case 'too-large':
      return 'That recording is too large.';
    case 'format':
      return 'Unsupported audio file. Use MP3, M4A, WAV or OGG.';
    case 'offline':
      return 'Cannot reach the server. Check the connection and try again.';
    default:
      return 'The server returned an error. Try again.';
  }
}

/** Custom voices live on the server so every device sees them. The built-in default voice is not in this list. */
@Injectable({ providedIn: 'root' })
export class Voices {
  private readonly api = inject(Api);

  readonly list = signal<Voice[]>([]);
  readonly uploads = signal(true);
  readonly maxClipBytes = signal(1024 * 1024);
  /** True once the server has answered at least once, so an unknown voice id can be told from an unreachable server. */
  readonly loaded = signal(false);
  readonly problem = signal<VoiceError | null>(null);

  async refresh(): Promise<void> {
    try {
      const lib = await this.api.voices();
      this.list.set(lib.voices);
      this.uploads.set(lib.uploads);
      this.maxClipBytes.set(lib.maxClipBytes);
      this.loaded.set(true);
      this.problem.set(null);
    } catch (e) {
      this.problem.set(toError(e));
    }
  }

  find(id: string): Voice | undefined {
    return this.list().find((v) => v.id === id);
  }

  async add(name: string): Promise<VoiceResult> {
    return this.change(() => this.api.createVoice(name));
  }

  async rename(id: string, name: string): Promise<VoiceResult> {
    return this.change(() => this.api.renameVoice(id, name));
  }

  async remove(id: string): Promise<true | { error: VoiceError }> {
    try {
      await this.api.deleteVoice(id);
      this.list.update((l) => l.filter((v) => v.id !== id));
      return true;
    } catch (e) {
      return { error: toError(e) };
    }
  }

  async uploadClip(id: string, event: string, file: Blob): Promise<true | { error: VoiceError }> {
    try {
      const clip = await this.api.uploadClip(id, event, file);
      this.patch(id, (v) => ({ ...v, clips: { ...v.clips, [event]: clip } }));
      return true;
    } catch (e) {
      return { error: toError(e) };
    }
  }

  async removeClip(id: string, event: string): Promise<true | { error: VoiceError }> {
    try {
      await this.api.deleteClip(id, event);
      this.patch(id, (v) => {
        const { [event]: _gone, ...rest } = v.clips;
        return { ...v, clips: rest };
      });
      return true;
    } catch (e) {
      return { error: toError(e) };
    }
  }

  private async change(call: () => Promise<Voice>): Promise<VoiceResult> {
    try {
      const voice = await call();
      this.list.update((l) => [...l.filter((v) => v.id !== voice.id), { ...voice, clips: this.find(voice.id)?.clips ?? voice.clips }].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
      return { voice };
    } catch (e) {
      return { error: toError(e) };
    }
  }

  private patch(id: string, fn: (v: Voice) => Voice): void {
    this.list.update((l) => l.map((v) => (v.id === id ? fn(v) : v)));
  }
}
