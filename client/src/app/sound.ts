import { Injectable, inject, signal } from '@angular/core';
import { VOICE_EVENTS, Voices } from './voices';

const KEY = 'dartboard.sound';
const VOICE_KEY = 'dartboard.voice';
const VOLUME_KEY = 'dartboard.volume';
export const DEFAULT_VOICE = 'default';

interface Manifest {
  name: string;
  events: Record<string, string[]>;
}

/**
 * Voice playback. The built-in `default` voice is a pack in `public/sounds/default/voice.json`; custom voices live on
 * the server (see Voices) and fall back to the default clip for events they have no recording for. Web Audio keeps
 * playback allowed on tablets once any tap unlocked it.
 */
@Injectable({ providedIn: 'root' })
export class Sound {
  private readonly voices = inject(Voices);

  readonly enabled = signal(read(KEY) === 'on');
  readonly voice = signal(read(VOICE_KEY) ?? DEFAULT_VOICE);
  readonly volume = signal(clamp(Number(read(VOLUME_KEY) ?? 1)));

  private ctx: AudioContext | null = null;
  private manifest: Manifest | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private current: AudioBufferSourceNode | null = null;

  constructor() {
    // Browsers only allow audio after a gesture: unlock on the first tap if sound was left on.
    if (this.enabled()) {
      addEventListener('pointerdown', () => void this.prepare(), { once: true });
    }
  }

  toggle(): void {
    const on = !this.enabled();
    this.enabled.set(on);
    write(KEY, on ? 'on' : 'off');
    if (on) void this.prepare();
    else this.stop();
  }

  setVolume(value: number): void {
    const v = clamp(value);
    this.volume.set(v);
    write(VOLUME_KEY, String(v));
  }

  async select(id: string): Promise<void> {
    this.voice.set(id);
    write(VOICE_KEY, id);
    await this.prepare();
  }

  /** Plays a random clip for the event. Returns its length in seconds, or 0 when nothing played. */
  play(event: string): number {
    if (!this.enabled() || !this.ctx) return 0;
    const loaded = this.clipUrls(event)
      .map((u) => this.buffers.get(u))
      .filter((b): b is AudioBuffer => !!b);
    if (!loaded.length) return 0;
    const buffer = loaded[Math.floor(Math.random() * loaded.length)];
    if (this.ctx.state !== 'running') void this.ctx.resume();
    this.stop();
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume();
    gain.connect(this.ctx.destination);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    src.onended = () => {
      if (this.current === src) this.current = null;
    };
    src.start();
    this.current = src;
    return buffer.duration;
  }

  /** Settings test button: loads the active voice inside the tap, then plays the event once. */
  async test(event: string): Promise<number> {
    await this.prepare();
    return this.play(event);
  }

  stop(): void {
    try {
      this.current?.stop();
    } catch {
      /* already ended */
    }
    this.current = null;
  }

  /** Loads the active voice into memory. Call again after its recordings changed. */
  async prepare(): Promise<void> {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state !== 'running') await this.ctx.resume();
      if (!this.manifest) {
        const res = await fetch(`sounds/${DEFAULT_VOICE}/voice.json`);
        if (res.ok) this.manifest = (await res.json()) as Manifest;
      }
      if (this.voice() !== DEFAULT_VOICE) {
        if (!this.voices.loaded()) await this.voices.refresh();
        // Only a server that answered can say the voice is gone; an unreachable one must not reset the choice.
        if (this.voices.loaded() && !this.voices.find(this.voice())) {
          this.voice.set(DEFAULT_VOICE);
          write(VOICE_KEY, DEFAULT_VOICE);
        }
      }
      await Promise.all(VOICE_EVENTS.flatMap((e) => this.clipUrls(e.id)).map((u) => this.load(u)));
    } catch {
      /* sound is optional: missing files or no audio support must never break the game */
    }
  }

  private clipUrls(event: string): string[] {
    const id = this.voice();
    const custom = id === DEFAULT_VOICE ? undefined : this.voices.find(id)?.clips[event];
    if (custom) return [`api/voices/${encodeURIComponent(id)}/clips/${encodeURIComponent(event)}?v=${encodeURIComponent(custom.updatedAt)}`];
    return (this.manifest?.events[event] ?? []).map((f) => `sounds/${DEFAULT_VOICE}/${f}`);
  }

  private async load(url: string): Promise<void> {
    if (this.buffers.has(url) || !this.ctx) return;
    const res = await fetch(url);
    if (!res.ok) return;
    this.buffers.set(url, await this.ctx.decodeAudioData(await res.arrayBuffer()));
  }
}

const clamp = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
