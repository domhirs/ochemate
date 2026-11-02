import { Injectable, signal } from '@angular/core';

/** Browser fullscreen. Needs no secure context, so it also works over plain HTTP. Not available on iPhone. */
@Injectable({ providedIn: 'root' })
export class Fullscreen {
  readonly supported = document.fullscreenEnabled;
  readonly active = signal(!!document.fullscreenElement);

  constructor() {
    document.addEventListener('fullscreenchange', () => this.active.set(!!document.fullscreenElement));
  }

  toggle(): void {
    const done = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    done.catch(() => undefined);
  }
}
