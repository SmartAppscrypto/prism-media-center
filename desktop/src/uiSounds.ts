export type UiTone = 'hover' | 'panel' | 'play';

let audioContext: AudioContext | null = null;
const lastPlayed = new Map<UiTone, number>();

const profiles: Record<UiTone, { frequency: number; endFrequency: number; duration: number; gain: number; overtone?: number }> = {
  hover: { frequency: 205, endFrequency: 158, duration: .055, gain: .012 },
  panel: { frequency: 142, endFrequency: 118, duration: .095, gain: .018, overtone: 238 },
  play: { frequency: 320, endFrequency: 210, duration: .045, gain: .014 }
};

function emitTone(context: AudioContext, tone: UiTone) {
  const profile = profiles[tone];
  const now = context.currentTime;
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(tone === 'hover' ? 720 : 560, now);
  filter.Q.setValueAtTime(.65, now);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(profile.gain, now + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, now + profile.duration);
  filter.connect(gain).connect(context.destination);

  [profile.frequency, profile.overtone].filter((frequency): frequency is number => Boolean(frequency)).forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const voiceGain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(index ? frequency * .92 : profile.endFrequency, now + profile.duration);
    voiceGain.gain.setValueAtTime(index ? .24 : 1, now);
    oscillator.connect(voiceGain).connect(filter);
    oscillator.start(now);
    oscillator.stop(now + profile.duration + .01);
  });
}

export function playUiTone(tone: UiTone) {
  if (typeof AudioContext === 'undefined') return;
  const now = performance.now();
  const minimumGap = tone === 'hover' ? 85 : 40;
  if (now - (lastPlayed.get(tone) ?? 0) < minimumGap) return;
  lastPlayed.set(tone, now);
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') {
    void audioContext.resume().then(() => emitTone(audioContext as AudioContext, tone)).catch(() => undefined);
  } else {
    emitTone(audioContext, tone);
  }
}
