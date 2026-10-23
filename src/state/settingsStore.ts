export type PerformancePreset = 'battery' | 'balanced' | 'high' | 'cinematic';
export type DetectionMode = 'visual' | 'visual_audio' | 'manual';
export type AnimationState = 'VISIBLE' | 'DISAPPEARING' | 'INVISIBLE' | 'REAPPEARING';

export interface SnapShiftSettings {
  enabled: boolean;
  selectedCameraId: string;
  targetResolution: '720p' | '480p';
  targetFPS: number;
  detectionMode: DetectionMode;
  sensitivity: number; // 0.1 to 1.0 (default 0.65)
  cooldownMs: number; // default 1500ms
  animationDurationSec: number; // default 1.8s
  particleDensityPreset: PerformancePreset;
  particleSize: number; // 1 to 10 (default 4)
  particleSpeed: number; // 0.5 to 3.0 (default 1.2)
  scatterStrength: number; // 0.5 to 3.0 (default 1.5)
  dissolveDirection: 'bottom_up' | 'radial_out' | 'wind_right';
  turbulence: number; // 0.1 to 2.0 (default 0.8)
  dustOpacity: number; // 0.5 to 1.0 (default 0.9)
  edgeGlow: boolean;
  showLandmarks: boolean;
  hardwareAcceleration: boolean;
}

export const PRESET_PARTICLE_COUNTS: Record<PerformancePreset, number> = {
  battery: 2000,
  balanced: 5000,
  high: 8000,
  cinematic: 12000,
};

export const DEFAULT_SETTINGS: SnapShiftSettings = {
  enabled: true,
  selectedCameraId: '',
  targetResolution: '720p',
  targetFPS: 30,
  detectionMode: 'visual',
  sensitivity: 0.65,
  cooldownMs: 1500,
  animationDurationSec: 1.8,
  particleDensityPreset: 'cinematic',
  particleSize: 3.5,
  particleSpeed: 1.2,
  scatterStrength: 1.5,
  dissolveDirection: 'bottom_up',
  turbulence: 0.8,
  dustOpacity: 0.9,
  edgeGlow: true,
  showLandmarks: false,
  hardwareAcceleration: true,
};

const STORAGE_KEY = 'snapshift_settings_v1';

export class SettingsStore {
  private static instance: SettingsStore;
  private settings: SnapShiftSettings = { ...DEFAULT_SETTINGS };
  private listeners: Set<(settings: SnapShiftSettings) => void> = new Set();

  private constructor() {
    this.loadSettings();
    // Extension popup, Studio and output windows run in different JS contexts.
    // Synchronize the persisted controls instead of treating each singleton as global.
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
        this.settings = { ...DEFAULT_SETTINGS, ...changes[STORAGE_KEY].newValue };
        this.notify();
      });
    }
  }

  public static getInstance(): SettingsStore {
    if (!SettingsStore.instance) {
      SettingsStore.instance = new SettingsStore();
    }
    return SettingsStore.instance;
  }

  public getSettings(): SnapShiftSettings {
    return { ...this.settings };
  }

  public async updateSettings(partial: Partial<SnapShiftSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial };
    await this.saveSettings();
    this.notify();
  }

  public async resetToDefaults(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.saveSettings();
    this.notify();
  }

  public subscribe(listener: (settings: SnapShiftSettings) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const current = this.getSettings();
    for (const listener of this.listeners) {
      listener(current);
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        if (result && result[STORAGE_KEY]) {
          this.settings = { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] };
          this.notify();
          return;
        }
      }
      // Fallback to localStorage in web studio environment
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
          this.notify();
        }
      }
    } catch (e) {
      console.warn('SnapShift: Failed to load stored settings, using defaults.', e);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [STORAGE_KEY]: this.settings });
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      }
    } catch (e) {
      console.warn('SnapShift: Failed to save settings.', e);
    }
  }
}
