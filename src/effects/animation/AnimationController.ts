import { AnimationState, SettingsStore } from '@/state/settingsStore';
import { ParticleEngine, ParticleSpawnConfig } from '../particles/ParticleEngine';
import { BackgroundManager } from '@/background/BackgroundManager';
import { VisionEngine } from '@/vision/VisionEngine';
import { CameraManager } from '@/camera/CameraManager';

export interface AnimationMetrics {
  state: AnimationState;
  progress: number;
  activeParticles: number;
  durationSec: number;
  isCalibrated: boolean;
}

export type AnimationStateListener = (metrics: AnimationMetrics) => void;

export class AnimationController {
  private static instance: AnimationController;
  private state: AnimationState = 'VISIBLE';
  private animationProgress = 0.0;
  private animationStartTime = 0;
  private durationMs = 1800;

  private particleEngine: ParticleEngine;
  private backgroundManager = BackgroundManager.getInstance();
  private visionEngine = VisionEngine.getInstance();
  private cameraManager = CameraManager.getInstance();
  private settingsStore = SettingsStore.getInstance();

  private listeners: Set<AnimationStateListener> = new Set();
  private frozenForegroundCanvas: HTMLCanvasElement | null = null;
  private frozenForegroundCtx: CanvasRenderingContext2D | null = null;
  private frozenMask: { data: Float32Array; width: number; height: number } | null = null;

  private constructor() {
    this.particleEngine = new ParticleEngine();
    const settings = this.settingsStore.getSettings();
    this.durationMs = settings.animationDurationSec * 1000;

    this.settingsStore.subscribe((s) => {
      this.durationMs = s.animationDurationSec * 1000;
    });

    // Listen to snap events from VisionEngine
    this.visionEngine.onSnap(() => {
      this.handleSnapTrigger(this.cameraManager.getVideoElement() || undefined);
    });

    this.initKeyboardShortcuts();
  }

  public static getInstance(): AnimationController {
    if (!AnimationController.instance) {
      AnimationController.instance = new AnimationController();
    }
    return AnimationController.instance;
  }

  public getState(): AnimationState {
    return this.state;
  }

  public getParticleEngine(): ParticleEngine {
    return this.particleEngine;
  }

  public subscribe(listener: AnimationStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getMetrics());
    return () => this.listeners.delete(listener);
  }

  public getMetrics(): AnimationMetrics {
    return {
      state: this.state,
      progress: parseFloat(this.animationProgress.toFixed(2)),
      activeParticles: this.particleEngine.getActiveParticleCount(),
      durationSec: this.durationMs / 1000,
      isCalibrated: this.backgroundManager.getState().hasCleanBackground,
    };
  }

  private notify(): void {
    const metrics = this.getMetrics();
    for (const listener of this.listeners) {
      listener(metrics);
    }
  }

  public triggerDisappear(video?: HTMLVideoElement): void {
    if (this.state !== 'VISIBLE') {
      console.log('SnapShift: Cannot disappear, current state is', this.state);
      return;
    }

    const bgState = this.backgroundManager.getState();
    if (!bgState.hasCleanBackground) {
      console.warn('SnapShift: Calibrate a clean background before disappearing.');
      return;
    }

    this.state = 'DISAPPEARING';
    this.animationProgress = 0.0;
    this.animationStartTime = performance.now();

    const activeVideo = video || this.cameraManager.getVideoElement();
    if (activeVideo) {
      this.snapshotAndSpawnParticles(activeVideo, false);
    }

    this.notify();
  }

  public triggerReappear(video?: HTMLVideoElement): void {
    if (this.state !== 'INVISIBLE') {
      console.log('SnapShift: Cannot reappear, current state is', this.state);
      return;
    }

    this.state = 'REAPPEARING';
    this.animationProgress = 0.0;
    this.animationStartTime = performance.now();

    const activeVideo = video || this.cameraManager.getVideoElement();
    if (activeVideo) {
      this.snapshotAndSpawnParticles(activeVideo, true);
    }

    this.notify();
  }

  public reset(): void {
    this.state = 'VISIBLE';
    this.animationProgress = 0.0;
    this.particleEngine.clear();
    this.frozenMask = null;
    this.visionEngine.reset();
    this.notify();
  }

  public handleSnapTrigger(video?: HTMLVideoElement): void {
    if (this.state === 'VISIBLE') {
      this.triggerDisappear(video);
    } else if (this.state === 'INVISIBLE') {
      this.triggerReappear(video);
    } else {
      // Ignore snap during active transition (DISAPPEARING or REAPPEARING)
      console.log(`SnapShift: Snap event ignored during active transition: ${this.state}`);
    }
  }

  public update(now: number, _video?: HTMLVideoElement): void {
    if (this.state === 'DISAPPEARING') {
      const elapsed = now - this.animationStartTime;
      this.animationProgress = Math.min(1.0, elapsed / this.durationMs);
      this.particleEngine.update(this.animationProgress, false);

      if (this.animationProgress >= 1.0) {
        this.state = 'INVISIBLE';
        this.animationProgress = 1.0;
        this.particleEngine.clear();
        this.notify();
      }
    } else if (this.state === 'REAPPEARING') {
      const elapsed = now - this.animationStartTime;
      this.animationProgress = Math.min(1.0, elapsed / this.durationMs);
      this.particleEngine.update(this.animationProgress, true);

      if (this.animationProgress >= 1.0) {
        this.state = 'VISIBLE';
        this.animationProgress = 0.0;
        this.particleEngine.clear();
        this.notify();
      }
    }
  }

  public getFrozenForegroundCanvas(): HTMLCanvasElement | null {
    return this.frozenForegroundCanvas;
  }

  public getFrozenSegmentationMask(): { data: Float32Array; width: number; height: number } | null {
    return this.frozenMask;
  }

  public getAnimationProgress(): number {
    return this.animationProgress;
  }

  private snapshotAndSpawnParticles(video: HTMLVideoElement, isReappearance: boolean): void {
    const mask = this.visionEngine.getSegmentationMask();
    const settings = this.settingsStore.getSettings();

    // Snapshot current foreground
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;

    if (!this.frozenForegroundCanvas) {
      this.frozenForegroundCanvas = document.createElement('canvas');
    }
    this.frozenForegroundCanvas.width = vw;
    this.frozenForegroundCanvas.height = vh;
    this.frozenForegroundCtx = this.frozenForegroundCanvas.getContext('2d', { willReadFrequently: true });
    if (this.frozenForegroundCtx) {
      this.frozenForegroundCtx.drawImage(video, 0, 0, vw, vh);
    }

    if (mask.data && mask.width > 0 && mask.height > 0) {
      this.frozenMask = { data: new Float32Array(mask.data), width: mask.width, height: mask.height };
      const spawnConfig: ParticleSpawnConfig = {
        video,
        maskData: mask.data,
        maskWidth: mask.width,
        maskHeight: mask.height,
        particlePreset: settings.particleDensityPreset,
        baseSize: settings.particleSize,
        speed: settings.particleSpeed,
        scatter: settings.scatterStrength,
        turbulence: settings.turbulence,
        dissolveDirection: settings.dissolveDirection,
        isReappearance,
      };
      this.particleEngine.spawnFromForeground(spawnConfig);
    }
  }

  private initKeyboardShortcuts(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey) {
        if (e.code === 'KeyD' || e.key === 'D' || e.key === 'd') {
          e.preventDefault();
          this.triggerDisappear();
        } else if (e.code === 'KeyR' || e.key === 'R' || e.key === 'r') {
          e.preventDefault();
          this.triggerReappear();
        } else if (e.code === 'Digit0' || e.key === '0' || e.key === ')') {
          e.preventDefault();
          this.reset();
        }
      }
    });
  }
}
