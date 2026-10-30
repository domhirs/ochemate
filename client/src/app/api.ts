import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Dart, MatchConfig } from './game-logic';

export interface MatchRecord {
  id: string;
  finishedAt?: string;
  config: MatchConfig;
  darts: Dart[];
}

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
}

const PENDING_KEY = 'dartboard.pending';

function readPending(): MatchRecord[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writePending(list: MatchRecord[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable; nothing sensible to do */
  }
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  matches(): Promise<MatchRecord[]> {
    return firstValueFrom(this.http.get<MatchRecord[]>('/api/matches'));
  }

  players(): Promise<Profile[]> {
    return firstValueFrom(this.http.get<Profile[]>('/api/players'));
  }

  createPlayer(name: string): Promise<Profile> {
    return firstValueFrom(this.http.post<Profile>('/api/players', { id: crypto.randomUUID(), name }));
  }

  renamePlayer(id: string, name: string): Promise<Profile> {
    return firstValueFrom(this.http.patch<Profile>(`/api/players/${encodeURIComponent(id)}`, { name }));
  }

  deletePlayer(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/players/${encodeURIComponent(id)}`));
  }

  remove(id: string): Promise<unknown> {
    writePending(readPending().filter((p) => p.id !== id));
    return firstValueFrom(this.http.delete(`/api/matches/${encodeURIComponent(id)}`));
  }

  /** Server POST is idempotent by id, so a failed save is queued locally and retried later. */
  async save(match: MatchRecord): Promise<boolean> {
    try {
      await firstValueFrom(this.http.post('/api/matches', match));
      return true;
    } catch {
      const pending = readPending();
      if (!pending.some((p) => p.id === match.id)) writePending([...pending, match]);
      return false;
    }
  }

  async flushPending(): Promise<void> {
    for (const m of readPending()) {
      try {
        await firstValueFrom(this.http.post('/api/matches', m));
        writePending(readPending().filter((p) => p.id !== m.id));
      } catch {
        return;
      }
    }
  }
}
