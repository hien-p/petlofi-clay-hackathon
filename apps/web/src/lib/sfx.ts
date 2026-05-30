// Lightweight synth sound effects. No asset files — every sound is generated
// from short OscillatorNode envelopes. All audio is wrapped in try/catch so a
// failing AudioContext can never throw into the UI.

export type SfxName =
  | "click"
  | "feed"
  | "rest"
  | "play"
  | "pickup"
  | "hit"
  | "victory"
  | "fail"
  | "levelup";

let muted = false;
let initializedFromStorage = false;
let audioContext: AudioContext | null = null;

function readInitialMuted(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem("petlofi_muted") === "1";
  } catch {
    return false;
  }
}

function ensureMutedInitialized() {
  if (initializedFromStorage) {
    return;
  }
  initializedFromStorage = true;
  muted = readInitialMuted();
}

export function setSfxMuted(value: boolean) {
  ensureMutedInitialized();
  muted = value;
}

export function isSfxMuted(): boolean {
  ensureMutedInitialized();
  return muted;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    if (!audioContext) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        return null;
      }
      audioContext = new Ctor();
    }
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
    return audioContext;
  } catch {
    return null;
  }
}

type Tone = {
  type: OscillatorType;
  startFreq: number;
  endFreq?: number;
  start: number; // seconds offset from now
  duration: number; // seconds
  gain?: number;
};

function playTone(ctx: AudioContext, now: number, tone: Tone) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const peak = tone.gain ?? 0.18;
  const begin = now + tone.start;
  const end = begin + tone.duration;

  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.startFreq, begin);
  if (tone.endFreq && tone.endFreq !== tone.startFreq) {
    osc.frequency.linearRampToValueAtTime(tone.endFreq, end);
  }

  env.gain.setValueAtTime(0.0001, begin);
  env.gain.linearRampToValueAtTime(peak, begin + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(begin);
  osc.stop(end + 0.02);
}

function tonesFor(name: SfxName): Tone[] {
  switch (name) {
    case "click":
      return [{ type: "square", startFreq: 660, start: 0, duration: 0.06, gain: 0.12 }];
    case "feed":
      return [{ type: "triangle", startFreq: 440, endFreq: 660, start: 0, duration: 0.18 }];
    case "rest":
      return [{ type: "sine", startFreq: 520, endFreq: 320, start: 0, duration: 0.26, gain: 0.16 }];
    case "play":
      return [{ type: "square", startFreq: 523, endFreq: 784, start: 0, duration: 0.16, gain: 0.14 }];
    case "pickup":
      return [{ type: "square", startFreq: 880, start: 0, duration: 0.08, gain: 0.14 }];
    case "hit":
      return [{ type: "sawtooth", startFreq: 160, start: 0, duration: 0.1, gain: 0.16 }];
    case "victory":
      return [
        { type: "triangle", startFreq: 523, start: 0, duration: 0.12 },
        { type: "triangle", startFreq: 659, start: 0.1, duration: 0.12 },
        { type: "triangle", startFreq: 784, start: 0.2, duration: 0.18 }
      ];
    case "fail":
      return [{ type: "sawtooth", startFreq: 300, endFreq: 120, start: 0, duration: 0.3, gain: 0.16 }];
    case "levelup":
      return [
        { type: "square", startFreq: 523, start: 0, duration: 0.1, gain: 0.13 },
        { type: "square", startFreq: 659, start: 0.09, duration: 0.1, gain: 0.13 },
        { type: "square", startFreq: 880, start: 0.18, duration: 0.16, gain: 0.13 }
      ];
    default:
      return [{ type: "square", startFreq: 660, start: 0, duration: 0.06, gain: 0.12 }];
  }
}

export function playSfx(name: SfxName) {
  try {
    ensureMutedInitialized();
    if (muted) {
      return;
    }
    const ctx = getAudioContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    for (const tone of tonesFor(name)) {
      playTone(ctx, now, tone);
    }
  } catch {
    // Never let audio failures bubble into the UI.
  }
}
