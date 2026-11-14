const SOUND_PREFERENCE_KEY = "kalexi-notification-sound-enabled";

export function isNotificationSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) === "true";
  } catch (error) {
    console.warn("[notifications] Sound preference is unavailable.", error);
    return false;
  }
}

export function enableNotificationSound(): void {
  rememberNotificationSoundPreference();
  playNotificationSound();
}

export function rememberNotificationSoundPreference(): void {
  try {
    window.localStorage.setItem(SOUND_PREFERENCE_KEY, "true");
  } catch (error) {
    console.warn("[notifications] Could not save the sound preference.", error);
  }
}

export function playNotificationSound(): void {
  if (!isNotificationSoundEnabled()) return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.26);
    window.setTimeout(() => void context.close(), 400);
  } catch (error) {
    console.warn("[notifications] The browser could not play the notification sound.", error);
  }
}
