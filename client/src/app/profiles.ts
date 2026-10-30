import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Api, Profile } from './api';

const CACHE_KEY = 'dartboard.players';

/**
 * offline: no answer at all (network down, server stopped).
 * outdated: the server answers but has no /api/players (404/405), i.e. it runs an older version and needs a restart.
 * failed: the server answered with another error.
 */
export type ProfileProblem = 'offline' | 'outdated' | 'failed';
export type ProfileError = 'taken' | 'invalid' | ProfileProblem;
export type ProfileResult = { profile: Profile } | { error: ProfileError; status?: number };

function readCache(): Profile[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function statusOf(e: unknown): number {
  return e instanceof HttpErrorResponse ? e.status : 0;
}

/** 0 = no answer; 502-504 also mean "not reachable" (the service worker answers 504 for requests it cannot forward). */
const UNREACHABLE = new Set([0, 502, 503, 504]);

function problemOf(status: number): ProfileProblem {
  return UNREACHABLE.has(status) ? 'offline' : status === 404 || status === 405 ? 'outdated' : 'failed';
}

function toError(e: unknown): { error: ProfileError; status: number } {
  const status = statusOf(e);
  return { error: status === 409 ? 'taken' : status === 400 ? 'invalid' : problemOf(status), status };
}

/** One wording for every place that talks about profile problems, so users are told what to actually do. */
export function describeProfileError(e: ProfileError, status?: number): string {
  switch (e) {
    case 'taken':
      return 'That name is already in use.';
    case 'invalid':
      return 'Names need 1 to 30 characters.';
    case 'offline':
      return 'Cannot reach the server. Check the connection and try again.';
    case 'outdated':
      return 'The server does not support saved players yet. Restart or update the server.';
    default:
      return `The server returned an error${status ? ` (HTTP ${status})` : ''}. Try again.`;
  }
}

/** Saved player profiles. The server is the source of truth; a local copy keeps the picker usable offline. */
@Injectable({ providedIn: 'root' })
export class Profiles {
  private readonly api = inject(Api);

  readonly list = signal<Profile[]>(readCache());
  /** Why the last refresh failed, so the list may be stale. Null when the server answered. */
  readonly problem = signal<ProfileProblem | null>(null);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.set(await this.api.players());
      this.problem.set(null);
    } catch (e) {
      this.problem.set(problemOf(statusOf(e)));
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

  async remove(id: string): Promise<true | { error: ProfileError; status: number }> {
    try {
      await this.api.deletePlayer(id);
      this.set(this.list().filter((p) => p.id !== id));
      return true;
    } catch (e) {
      return toError(e);
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
