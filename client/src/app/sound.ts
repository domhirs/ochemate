import { Injectable, signal } from '@angular/core';

const KEY = 'dartboard.sound';
const VOICE_KEY = 'dartboard.voice';
const DEFAULT_VOICE = 'ross-bray';
/** Events worth decoding up front so playback is instant inside the tap that triggers it. */
const PRELOAD = ['180'];

interface Voice {
  name: string;
  events: Record<string, string[]>;
}

/**
 * Voice-pack playback. Packs live in `public/sounds/<voice>/voice.json` and map event names to clip files,
 * so a new voice is a new folder and no code change. Web Audio keeps playback allowed on tablets once any tap unlocked it.
 */
@Injectable({ providedIn: 'root' })
export class Sound {
  readonly enabled = signal(read(KEY) === 'on');
  readonly voice = signal(read(VOICE_KEY) ?? DEFAULT_VOICE);

  private ctx: AudioContext | null = null;
  private manifest: Voice | null = null;
  private manifestVoice = '';
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

  /** Plays a random clip for the event. Returns its length in seconds, or 0 when nothing played. */
  play(event: string): number {
    if (!this.enabled() || !this.ctx || !this.manifest) return 0;
    const clips = this.manifest.events[event] ?? [];
    const loaded = clips.map((f) => this.buffers.get(this.url(f))).filter((b): b is AudioBuffer => !!b);
    if (!loaded.length) return 0;
    const buffer = loaded[Math.floor(Math.random() * loaded.length)];
    if (this.ctx.state !== 'running') void this.ctx.resume();
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    src.onended = () => {
      if (this.current === src) this.current = null;
    };
    src.start();
    this.current = src;
    return buffer.duration;
  }

  stop(): void {
    try {
      this.current?.stop();
    } catch {
      /* already ended */
    }
    this.current = null;
  }

  private url(file: string): string {
    return `sounds/${this.voice()}/${file}`;
  }

  private async prepare(): Promise<void> {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state !== 'running') await this.ctx.resume();
      const voice = this.voice();
      if (!this.manifest || this.manifestVoice !== voice) {
        const res = await fetch(`sounds/${voice}/voice.json`);
        if (!res.ok) return;
        this.manifest = (await res.json()) as Voice;
        this.manifestVoice = voice;
      }
      const files = PRELOAD.flatMap((e) => this.manifest?.events[e] ?? []);
      await Promise.all(files.map((f) => this.load(this.url(f))));
    } catch {
      /* sound is optional: missing files or no audio support must never break the game */
    }
  }

  private async load(url: string): Promise<void> {
    if (this.buffers.has(url) || !this.ctx) return;
    const res = await fetch(url);
    if (!res.ok) return;
    this.buffers.set(url, await this.ctx.decodeAudioData(await res.arrayBuffer()));
  }
}

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
