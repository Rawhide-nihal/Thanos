import { HandLandmarkerManager } from './handTracking/HandLandmarkerManager';
import { PersonSegmenterManager } from './personSegmentation/PersonSegmenterManager';
import { SnapDetector, SnapDiagnostics, NormalizedLandmark } from './snapDetection/SnapDetector';
import { AudioSnapDetector } from './snapDetection/AudioSnapDetector';
import { SettingsStore, DetectionMode } from '@/state/settingsStore';

export interface VisionDiagnostics {
  isModelsReady: boolean;
  handLandmarkerReady: boolean;
  segmenterReady: boolean;
  handDiagnostics: SnapDiagnostics;
  audioActive: boolean;
  recentAudioTransient: boolean;
  fps: number;
  inferenceLatencyMs: number;
}

export type SnapCallback = () => void;

export class VisionEngine {
  private static instance: VisionEngine;
  private handManager = HandLandmarkerManager.getInstance();
  private segmenterManager = PersonSegmenterManager.getInstance();
  private snapDetector: SnapDetector;
  private audioDetector: AudioSnapDetector;
  private settingsStore = SettingsStore.getInstance();

  private inferenceLatency = 0;
  private snapListeners: Set<SnapCallback> = new Set();

  private constructor() {
    const settings = this.settingsStore.getSettings();

    this.snapDetector = new SnapDetector({
      sensitivity: settings.sensitivity,
      cooldownMs: settings.cooldownMs,
      onSnapDetected: () => this.handleSnapDetected(),
    });

    this.audioDetector = new AudioSnapDetector((timestamp) => {
      this.handleAudioTransient(timestamp);
    });

    this.settingsStore.subscribe((newSettings) => {
      this.snapDetector.updateOptions({
        sensitivity: newSettings.sensitivity,
        cooldownMs: newSettings.cooldownMs,
      });
      this.syncAudioMode(newSettings.detectionMode);
    });
  }

  public static getInstance(): VisionEngine {
    if (!VisionEngine.instance) {
      VisionEngine.instance = new VisionEngine();
    }
    return VisionEngine.instance;
  }

  public onSnap(callback: SnapCallback): () => void {
    this.snapListeners.add(callback);
    return () => this.snapListeners.delete(callback);
  }

  public async initialize(): Promise<void> {
    const [handResult, segResult] = await Promise.allSettled([
      this.handManager.initialize(),
      this.segmenterManager.initialize(),
    ]);

    if (handResult.status === 'rejected') {
      console.error('SnapShift: Failed to initialize Hand Landmarker:', handResult.reason);
    }
    if (segResult.status === 'rejected') {
      console.error('SnapShift: Failed to initialize Person Segmenter:', segResult.reason);
    }

    const settings = this.settingsStore.getSettings();
    if (settings.detectionMode === 'visual_audio') {
      await this.audioDetector.startListening().catch(() => {});
    }
  }

  public triggerManualSnap(): void {
    this.snapDetector.triggerManualSnap();
  }

  public reset(): void {
    this.snapDetector.reset();
  }

  public processVideoFrame(video: HTMLVideoElement, timestampMs: number): void {
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    const start = performance.now();

    // 1. Process Hand Tracking for Snap
    const handResult = this.handManager.detectForVideo(video, timestampMs);
    let handLandmarks: NormalizedLandmark[] | null = null;
    let handedness = 'Unknown';

    if (handResult && handResult.landmarks && handResult.landmarks.length > 0) {
      handLandmarks = handResult.landmarks[0] as NormalizedLandmark[];
      if (handResult.handedness && handResult.handedness[0] && handResult.handedness[0][0]) {
        handedness = handResult.handedness[0][0].displayName;
      }
    }

    // Process snap gesture detection
    this.snapDetector.processHandLandmarks(handLandmarks, handedness, timestampMs);

    // 2. Process Person Segmentation (interleaved / drop-frame protected)
    this.segmenterManager.segmentFrame(video, timestampMs);

    this.inferenceLatency = performance.now() - start;
  }

  public getSegmentationMask(): { data: Float32Array | null; width: number; height: number } {
    return this.segmenterManager.getLatestMask();
  }

  public getHandLandmarks(video: HTMLVideoElement, timestampMs: number): NormalizedLandmark[] | null {
    const result = this.handManager.detectForVideo(video, timestampMs);
    if (result && result.landmarks && result.landmarks.length > 0) {
      return result.landmarks[0] as NormalizedLandmark[];
    }
    return null;
  }

  public getDiagnostics(): VisionDiagnostics {
    const handState = this.handManager.getState();
    const segState = this.segmenterManager.getState();
    const audioDiag = this.audioDetector.getDiagnostics();

    return {
      isModelsReady: handState.isInitialized && segState.isInitialized,
      handLandmarkerReady: handState.isInitialized,
      segmenterReady: segState.isInitialized,
      handDiagnostics: this.snapDetector.getDiagnostics(),
      audioActive: audioDiag.isListening,
      recentAudioTransient: audioDiag.transientDetected,
      fps: 0,
      inferenceLatencyMs: parseFloat(this.inferenceLatency.toFixed(1)),
    };
  }

  private handleSnapDetected(): void {
    const mode = this.settingsStore.getSettings().detectionMode;

    if (mode === 'manual') {
      return; // Only manual clicks/shortcuts trigger in manual mode
    }

    if (mode === 'visual_audio') {
      // Must correlate with a recent audio transient within +-250ms
      if (!this.audioDetector.hasRecentTransient(250)) {
        console.log('SnapShift: Visual snap detected, but waiting for audio confirmation transient.');
        return;
      }
    }

    console.log('SnapShift: Confirmed snap gesture trigger!');
    for (const listener of this.snapListeners) {
      listener();
    }
  }

  private handleAudioTransient(_timestamp: number): void {
    // If the snap detector is in RAPID_RELEASE state, audio can provide instant confirmation
    const diag = this.snapDetector.getDiagnostics();
    if (diag.currentState === 'RAPID_RELEASE') {
      console.log('SnapShift: Audio transient confirmed rapid finger release!');
    }
  }

  private syncAudioMode(mode: DetectionMode): void {
    if (mode === 'visual_audio') {
      this.audioDetector.startListening().catch(() => {});
    } else {
      this.audioDetector.stopListening();
    }
  }
}
