import { FilesetResolver, ImageSegmenter, ImageSegmenterResult } from '@mediapipe/tasks-vision';
import { getAssetUrl } from '@/utils/assetPath';

export interface SegmentationState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  delegate: 'GPU' | 'CPU';
}

export class PersonSegmenterManager {
  private static instance: PersonSegmenterManager;
  private segmenter: ImageSegmenter | null = null;
  private state: SegmentationState = {
    isInitialized: false,
    isLoading: false,
    error: null,
    delegate: 'GPU',
  };
  private isProcessing = false;
  private latestMaskData: Float32Array | null = null;
  private maskWidth = 0;
  private maskHeight = 0;

  private constructor() {}

  public static getInstance(): PersonSegmenterManager {
    if (!PersonSegmenterManager.instance) {
      PersonSegmenterManager.instance = new PersonSegmenterManager();
    }
    return PersonSegmenterManager.instance;
  }

  public getState(): SegmentationState {
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
      const modelPath = getAssetUrl('models/selfie_segmenter.tflite');

      const vision = await FilesetResolver.forVisionTasks(wasmPath);

      // Try GPU delegate first
      try {
        this.segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
        this.state.delegate = 'GPU';
      } catch (gpuErr) {
        console.warn('SnapShift: ImageSegmenter GPU delegate failed, falling back to CPU:', gpuErr);
        this.segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
        this.state.delegate = 'CPU';
      }

      this.state.isInitialized = true;
      this.state.isLoading = false;
    } catch (err: unknown) {
      this.state.isLoading = false;
      this.state.error = err instanceof Error ? err.message : String(err);
      console.error('SnapShift: PersonSegmenter initialization error:', err);
      throw err;
    }
  }

  /**
   * Segment frame with drop-frame protection to prevent queue accumulation
   */
  public segmentFrame(video: HTMLVideoElement, timestampMs: number): void {
    if (!this.segmenter || !this.state.isInitialized || this.isProcessing) {
      return; // Drop frame if previous inference is still running
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    this.isProcessing = true;

    try {
      this.segmenter.segmentForVideo(video, timestampMs, (result: ImageSegmenterResult) => {
        try {
          if (result && result.confidenceMasks && result.confidenceMasks.length > 0) {
            const mask = result.confidenceMasks[0];
            this.maskWidth = mask.width;
            this.maskHeight = mask.height;
            const floatData = mask.getAsFloat32Array();
            if (!this.latestMaskData || this.latestMaskData.length !== floatData.length) {
              this.latestMaskData = new Float32Array(floatData.length);
            }
            this.latestMaskData.set(floatData);
          }
        } finally {
          this.isProcessing = false;
          if (result && result.close) {
            result.close();
          }
        }
      });
    } catch (e) {
      this.isProcessing = false;
      console.warn('SnapShift: Segmentation inference frame dropped:', e);
    }
  }

  public getLatestMask(): { data: Float32Array | null; width: number; height: number } {
    return {
      data: this.latestMaskData,
      width: this.maskWidth,
      height: this.maskHeight,
    };
  }

  public close(): void {
    if (this.segmenter) {
      this.segmenter.close();
      this.segmenter = null;
    }
    this.latestMaskData = null;
    this.state.isInitialized = false;
  }
}
