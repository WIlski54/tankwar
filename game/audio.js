import { assetUrl } from "./asset-url.js?v=20260630-deploy1";

const ENGINE_URL = assetUrl("./assets/audio/tank-drive.mp3");
const EXPLOSION_URL = assetUrl("./assets/audio/explosion.mp3");
const SHOT_URL = assetUrl("./assets/audio/tank-shot.mp3");
const TITLE_URL = assetUrl("./assets/audio/eclipse-within.mp3");

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export class TitleMusic {
  constructor(volume = 0.34) {
    this.targetVolume = volume;
    this.fadeFrame = 0;
    this.audio = new Audio(TITLE_URL);
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.volume = volume;
  }

  play() {
    cancelAnimationFrame(this.fadeFrame);
    this.audio.volume = this.targetVolume;
    return this.audio.play().catch(() => {});
  }

  fadeOut(duration = 650) {
    cancelAnimationFrame(this.fadeFrame);
    if (this.audio.paused) return;
    const startedAt = performance.now();
    const startVolume = this.audio.volume;
    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      this.audio.volume = startVolume * (1 - progress);
      if (progress < 1) {
        this.fadeFrame = requestAnimationFrame(step);
      } else {
        this.audio.pause();
        this.audio.volume = this.targetVolume;
      }
    };
    this.fadeFrame = requestAnimationFrame(step);
  }
}

export class GameAudio {
  constructor(engineCount = 4, explosionVoices = 4, shotVoices = 4) {
    this.unlocked = false;
    this.explosionIndex = 0;
    this.shotIndex = 0;
    this.engines = Array.from({ length: engineCount }, () => {
      const audio = new Audio(ENGINE_URL);
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0;
      return audio;
    });
    this.explosions = Array.from({ length: explosionVoices }, () => {
      const audio = new Audio(EXPLOSION_URL);
      audio.preload = "auto";
      return audio;
    });
    this.shots = Array.from({ length: shotVoices }, () => {
      const audio = new Audio(SHOT_URL);
      audio.preload = "auto";
      return audio;
    });
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    for (const engine of this.engines) {
      engine.volume = 0;
      engine.play().catch(() => {});
    }
    for (const explosion of this.explosions) explosion.load();
    for (const shot of this.shots) shot.load();
  }

  updateEngine(index, motion, dt, audibleScale = 1) {
    const engine = this.engines[index];
    if (!engine) return;
    const amount = clamp01(motion);
    const target = amount > 0.025 ? (0.055 + amount * 0.16) * audibleScale : 0;
    const smoothing = 1 - Math.exp(-dt * 8);
    engine.volume += (target - engine.volume) * smoothing;
    engine.playbackRate = 0.72 + amount * 0.58;
    if (this.unlocked && engine.paused) engine.play().catch(() => {});
  }

  silence(dt = 0.04) {
    const smoothing = 1 - Math.exp(-dt * 11);
    for (const engine of this.engines) {
      engine.volume += (0 - engine.volume) * smoothing;
    }
  }

  stop() {
    for (const engine of this.engines) {
      engine.pause();
      engine.currentTime = 0;
      engine.volume = 0;
    }
    this.unlocked = false;
  }

  explosion(volume = 0.72) {
    if (!this.unlocked || !this.explosions.length) return;
    const audio = this.explosions[this.explosionIndex];
    this.explosionIndex = (this.explosionIndex + 1) % this.explosions.length;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = clamp01(volume);
    audio.playbackRate = 0.96 + Math.random() * 0.08;
    audio.play().catch(() => {});
  }

  shot(volume = 0.9) {
    if (!this.unlocked || !this.shots.length) return;
    const audio = this.shots[this.shotIndex];
    this.shotIndex = (this.shotIndex + 1) % this.shots.length;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = clamp01(volume);
    audio.playbackRate = 0.98 + Math.random() * 0.04;
    audio.play().catch(() => {});
  }
}
