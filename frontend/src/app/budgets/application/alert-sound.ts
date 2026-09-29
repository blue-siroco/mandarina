import { DOCUMENT } from '@angular/common';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';

/** Clave del interruptor de silencio: una comodidad de cada navegador, no va en la URL ni en el servidor (AC-83). */
export const MUTE_KEY = 'mandarina.avisos.silenciados';

export type AlertKind = 'near' | 'exceeded';

export type AudioContextFactory = () => AudioContext;

export const AUDIO_CONTEXT_FACTORY = new InjectionToken<AudioContextFactory>('AUDIO_CONTEXT_FACTORY', {
  providedIn: 'root',
  factory: () => () => new AudioContext(),
});

// Cerca: un tono medio. Superado: dos tonos más graves, para distinguirlo sin mirar la pantalla.
export const TONES: Record<AlertKind, Array<{ hz: number; at: number; length: number }>> = {
  near: [{ hz: 660, at: 0, length: 0.15 }],
  exceeded: [
    { hz: 330, at: 0, length: 0.18 },
    { hz: 330, at: 0.26, length: 0.18 },
  ],
};

const loadMuted = (): boolean => {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * Sonido corto de los avisos de Presupuesto (AC-83), generado con Web Audio. Los navegadores
 * solo dejan sonar tras una interacción de la persona usuaria: hasta entonces se omite en silencio.
 */
@Injectable({ providedIn: 'root' })
export class AlertSound {
  private readonly document = inject(DOCUMENT);
  private readonly createContext = inject(AUDIO_CONTEXT_FACTORY);
  private context: AudioContext | undefined;
  private armed = false;

  /** Silenciado por la persona usuaria; por defecto suena. */
  readonly muted = signal(loadMuted());

  constructor() {
    const arm = () => {
      this.armed = true;
      for (const type of ['pointerdown', 'keydown']) this.document.removeEventListener(type, arm, true);
    };
    for (const type of ['pointerdown', 'keydown']) this.document.addEventListener(type, arm, { capture: true });
  }

  setMuted(muted: boolean): void {
    this.muted.set(muted);
    try {
      localStorage.setItem(MUTE_KEY, String(muted));
    } catch {
      // Sin almacenamiento (modo privado, bloqueado) el interruptor vale solo para esta visita.
    }
  }

  play(kind: AlertKind): void {
    if (!this.armed || this.muted()) return;
    try {
      const context = (this.context ??= this.createContext());
      void context.resume?.();
      const now = context.currentTime;
      for (const { hz, at, length } of TONES[kind]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = hz;
        gain.gain.setValueAtTime(0.0001, now + at);
        gain.gain.exponentialRampToValueAtTime(0.2, now + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + length);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now + at);
        oscillator.stop(now + at + length + 0.02);
      }
    } catch {
      // Sin Web Audio disponible el aviso sigue siendo visual.
    }
  }
}
