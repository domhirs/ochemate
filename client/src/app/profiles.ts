import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Api, Profile } from './api';

const CACHE_KEY = 'dartboard.players';

export type ProfileResult = { profile: Profile } | { error: 'taken' | 'invalid' | 'offline' };

function readCache(): Profile[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function toError(e: unknown): { error: 'taken' | 'invalid' | 'offline' } {
  const status = e instanceof HttpErrorResponse ? e.status : 0;
  return { error: status === 409 ? 'taken' : status === 400 ? 'invalid' : 'offline' };
}

/** Saved player profiles. The server is the source of truth; a local copy keeps the picker usable offline. */
@Injectable({ providedIn: 'root' })
export class Profiles {
  private readonly api = inject(Api);

  readonly list = signal<Profile[]>(readCache());
  /** True when the last refresh failed, so the list may be stale. */
  readonly offline = signal(false);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.set(await this.api.players());
      this.offline.set(false);
    } catch {
      this.offline.set(true);
    }
  }

  async add(name: string): Promise<ProfileResult> {
    try {
      const profile = await this.api.createPlayer(name);
      this.set([...this.list().filter((p) => p.id !== profile.id), profile]);
      return { profile };
    } catch (e) {
      return toError(e);
    }
  }

  async rename(id: string, name: string): Promise<ProfileResult> {
    try {
      const profile = await this.api.renamePlayer(id, name);
      this.set(this.list().map((p) => (p.id === id ? profile : p)));
      return { profile };
    } catch (e) {
      return toError(e);
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      await this.api.deletePlayer(id);
      this.set(this.list().filter((p) => p.id !== id));
      return true;
    } catch {
      return false;
    }
  }

  find(id: string | null | undefined): Profile | undefined {
    return id ? this.list().find((p) => p.id === id) : undefined;
  }

  private set(list: Profile[]): void {
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    this.list.set(sorted);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(sorted));
    } catch {
      /* ignore */
    }
  }
}
