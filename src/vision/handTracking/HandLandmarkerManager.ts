import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { getAssetUrl } from '@/utils/assetPath';

export interface HandTrackingState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  delegate: 'GPU' | 'CPU';
}

export class HandLandmarkerManager {
  private static instance: HandLandmarkerManager;
  private landmarker: HandLandmarker | null = null;
  private state: HandTrackingState = {
    isInitialized: false,
    isLoading: false,
    error: null,
    delegate: 'GPU',
  };

  private constructor() {}

  public static getInstance(): HandLandmarkerManager {
    if (!HandLandmarkerManager.instance) {
      HandLandmarkerManager.instance = new HandLandmarkerManager();
    }
    return HandLandmarkerManager.instance;
  }

  public getState(): HandTrackingState {
    return { ...this.state };
  }

  public async initialize(): Promise<void> {
    if (this.state.isInitialized || this.state.isLoading) {
      return;
    }

    this.state.isLoading = true;
    this.state.error = null;

    try {
      const wasmPath = getAssetUrl('wasm');
      const modelPath = getAssetUrl('models/hand_landmarker.task');

      const vision = await FilesetResolver.forVisionTasks(wasmPath);

      // Try GPU delegate first for 60fps performance
      try {
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        this.state.delegate = 'GPU';
      } catch (gpuErr) {
        console.warn('SnapShift: HandLandmarker GPU delegate failed, falling back to CPU:', gpuErr);
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        this.state.delegate = 'CPU';
      }

      this.state.isInitialized = true;
      this.state.isLoading = false;
    } catch (err: unknown) {
      this.state.isLoading = false;
      this.state.error = err instanceof Error ? err.message : String(err);
      console.error('SnapShift: HandLandmarker initialization error:', err);
      throw err;
    }
  }

  public detectForVideo(video: HTMLVideoElement, timestampMs: number): HandLandmarkerResult | null {
    if (!this.landmarker || !this.state.isInitialized) {
      return null;
    }
    try {
      return this.landmarker.detectForVideo(video, timestampMs);
    } catch (e) {
      console.warn('SnapShift: Hand tracking inference error:', e);
      return null;
    }
  }

  public close(): void {
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
    this.state.isInitialized = false;
  }
}
