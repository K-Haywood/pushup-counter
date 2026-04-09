let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const ContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ContextClass) {
    return null;
  }

  if (!audioContext) {
    audioContext = new ContextClass();
  }

  return audioContext;
}

export function triggerRepFeedback(soundEnabled: boolean, vibrationEnabled: boolean): void {
  if (soundEnabled) {
    playRepBeep();
  }

  if (vibrationEnabled && 'vibrate' in navigator) {
    navigator.vibrate(45);
  }
}

export function playRepBeep(): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  gainNode.gain.setValueAtTime(0.001, context.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.14);
}
