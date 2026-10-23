import { CameraManager } from '@/camera/CameraManager';
import { VisionEngine } from '@/vision/VisionEngine';
import { BackgroundManager } from '@/background/BackgroundManager';
import { AnimationController } from '@/effects/animation/AnimationController';
import { SettingsStore } from '@/state/settingsStore';

export type PreviewDisplayMode =
  | 'processed'
  | 'original'
  | 'mask'
  | 'background'
  | 'particles';

export class VideoOutputManager {
  private static instance: VideoOutputManager;

  // Primary rendering canvas and stream
  private outputCanvas: HTMLCanvasElement;
  private outputCtx: CanvasRenderingContext2D;
  private processedStream: MediaStream | null = null;
  private isLoopRunning = false;
  private animationFrameId: number | null = null;

  // Intermediate rendering canvas for foreground masking
  private fgCanvas: HTMLCanvasElement;
  private fgCtx: CanvasRenderingContext2D;
  private maskCanvas: HTMLCanvasElement;
  private maskCtx: CanvasRenderingContext2D;
  private particleCanvas: HTMLCanvasElement;
  private particlesUseWebGL = false;

  // Dependencies
  private cameraManager = CameraManager.getInstance();
  private visionEngine = VisionEngine.getInstance();
  private backgroundManager = BackgroundManager.getInstance();
  private animationController = AnimationController.getInstance();
  private settingsStore = SettingsStore.getInstance();

  // Diagnostics
  private fpsCounter = 0;
  private fpsTimer = performance.now();
  private currentFPS = 30;
  private renderLatencyMs = 0;

  private previewMode: PreviewDisplayMode = 'processed';

  private constructor() {
    this.outputCanvas = document.createElement('canvas');
    this.outputCanvas.width = 1280;
    this.outputCanvas.height = 720;
    this.outputCtx = this.outputCanvas.getContext('2d', { alpha: false, desynchronized: true })!;

    this.fgCanvas = document.createElement('canvas');
    this.fgCanvas.width = 1280;
    this.fgCanvas.height = 720;
    this.fgCtx = this.fgCanvas.getContext('2d', { willReadFrequently: true })!;

    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = 256;
    this.maskCanvas.height = 144;
    this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true })!;

    // WebGL requires a dedicated transparent layer; the final outgoing stream is Canvas2D.
    // A single canvas cannot provide both 2D and WebGL2 contexts.
    this.particleCanvas = document.createElement('canvas');
    this.particleCanvas.width = 1280;
    this.particleCanvas.height = 720;
    const particles = this.animationController.getParticleEngine();
    this.particlesUseWebGL = this.settingsStore.getSettings().hardwareAcceleration
      && particles.initWebGL(this.particleCanvas);
    if (!this.particlesUseWebGL) particles.set2DContext(this.outputCtx);
  }

  public static getInstance(): VideoOutputManager {
    if (!VideoOutputManager.instance) {
      VideoOutputManager.instance = new VideoOutputManager();
    }
    return VideoOutputManager.instance;
  }

  public getOutputCanvas(): HTMLCanvasElement {
    return this.outputCanvas;
  }

  public setPreviewMode(mode: PreviewDisplayMode): void {
    this.previewMode = mode;
  }

  public getPreviewMode(): PreviewDisplayMode {
    return this.previewMode;
  }

  public getFPS(): number {
    return this.currentFPS;
  }

  public getRenderLatency(): number {
    return this.renderLatencyMs;
  }

  /**
   * Produces or returns the active processed MediaStream
   */
  public getProcessedStream(targetFPS = 30): MediaStream {
    if (!this.processedStream || !this.processedStream.active) {
      const fps = targetFPS || this.settingsStore.getSettings().targetFPS || 30;
      this.processedStream = this.outputCanvas.captureStream(fps);
    }
    return this.processedStream;
  }

  /**
   * Combines processed video stream with an optional audio track
   */
  public getCombinedStreamWithAudio(audioTrack?: MediaStreamTrack | null): MediaStream {
    const videoStream = this.getProcessedStream();
    const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];

    if (audioTrack && audioTrack.readyState === 'live') {
      tracks.push(audioTrack);
    }

    return new MediaStream(tracks);
  }

  public startRenderLoop(): void {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;
    this.renderLoop();
  }

  public stopRenderLoop(): void {
    this.isLoopRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private renderLoop = (): void => {
    if (!this.isLoopRunning) return;

    const start = performance.now();
    this.renderFrame(start);
    this.renderLatencyMs = parseFloat((performance.now() - start).toFixed(1));

    // FPS computation
    this.fpsCounter++;
    if (start - this.fpsTimer >= 1000) {
      this.currentFPS = this.fpsCounter;
      this.fpsCounter = 0;
      this.fpsTimer = start;
    }

    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

  private renderFrame(timestamp: number): void {
    const video = this.cameraManager.getVideoElement();
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      // Draw dark idle frame
      this.outputCtx.fillStyle = '#0f0c20';
      this.outputCtx.fillRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);
      return;
    }

    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;

    if (this.outputCanvas.width !== vw || this.outputCanvas.height !== vh) {
      this.outputCanvas.width = vw;
      this.outputCanvas.height = vh;
      this.fgCanvas.width = vw;
      this.fgCanvas.height = vh;
      this.particleCanvas.width = vw;
      this.particleCanvas.height = vh;
    }

    // The extension master switch must affect the real outgoing video.
    if (!this.settingsStore.getSettings().enabled) {
      if (this.animationController.getState() !== 'VISIBLE') this.animationController.reset();
      this.outputCtx.drawImage(video, 0, 0, vw, vh);
      return;
    }

    // 1. Process vision tasks (Hands & Segmentation)
    this.visionEngine.processVideoFrame(video, timestamp);

    // 2. Update animation controller
    this.animationController.update(timestamp, video);

    const animState = this.animationController.getState();
    const cleanBg = this.backgroundManager.getCleanBackgroundCanvas();
    const mask = this.visionEngine.getSegmentationMask();
    const ctx = this.outputCtx;

    // Handle studio debug preview modes
    if (this.previewMode === 'original') {
      ctx.drawImage(video, 0, 0, vw, vh);
      return;
    }

    if (this.previewMode === 'background') {
      if (cleanBg) {
        ctx.drawImage(cleanBg, 0, 0, vw, vh);
      } else {
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(0, 0, vw, vh);
        ctx.fillStyle = '#a5b4fc';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Clean Background Not Yet Calibrated', vw / 2, vh / 2);
      }
      return;
    }

    if (this.previewMode === 'mask') {
      this.drawMaskVisualization(mask, vw, vh);
      return;
    }

    // --- MAIN PROCESSED OUTPUT COMPOSITING ---

    if (animState === 'VISIBLE') {
      // Ordinary camera video
      ctx.drawImage(video, 0, 0, vw, vh);
    } else if (animState === 'INVISIBLE') {
      this.drawReconstructedBackground(video, mask, vw, vh);
    } else if (animState === 'DISAPPEARING') {
      const progress = this.animationController.getAnimationProgress();

      this.drawReconstructedBackground(video, mask, vw, vh);

      // Snapshot stops the person from moving independently of their disintegrating dust.
      const frozen = this.animationController.getFrozenForegroundCanvas();
      const frozenMask = this.animationController.getFrozenSegmentationMask() || mask;
      this.drawDissolvingForeground(frozen || video, frozenMask, 1.0 - progress, vw, vh);
      this.drawParticles(vw, vh);
    } else if (animState === 'REAPPEARING') {
      const progress = this.animationController.getAnimationProgress();

      this.drawReconstructedBackground(video, mask, vw, vh);
      this.drawDissolvingForeground(video, mask, progress, vw, vh);
      this.drawParticles(vw, vh);
    }

    // Optional debug landmark overlay (preview only if enabled)
    const settings = this.settingsStore.getSettings();
    if (settings.showLandmarks && this.previewMode !== 'processed') {
      this.drawHandLandmarks(video, timestamp, vw, vh);
    }
  }

  /**
   * Paint live room pixels outside the person and the calibrated empty room
   * where the subject occludes it. Camera must remain stationary after calibration.
   */
  private drawReconstructedBackground(
    video: HTMLVideoElement,
    mask: { data: Float32Array | null; width: number; height: number },
    vw: number,
    vh: number
  ): void {
    const ctx = this.outputCtx;
    ctx.drawImage(video, 0, 0, vw, vh);
    const clean = this.backgroundManager.getCleanBackgroundCanvas();
    if (!clean) return;
    if (!mask.data || mask.width <= 0 || mask.height <= 0) {
      ctx.drawImage(clean, 0, 0, vw, vh);
      return;
    }

    if (this.maskCanvas.width !== mask.width || this.maskCanvas.height !== mask.height) {
      this.maskCanvas.width = mask.width;
      this.maskCanvas.height = mask.height;
    }
    const pixels = this.maskCtx.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) {
      const a = Math.max(0, Math.min(1, (mask.data[i] - 0.05) * 4));
      const j = i * 4;
      pixels.data[j] = 255;
      pixels.data[j + 1] = 255;
      pixels.data[j + 2] = 255;
      pixels.data[j + 3] = Math.round(a * 255);
    }
    this.maskCtx.putImageData(pixels, 0, 0);
    this.fgCtx.clearRect(0, 0, vw, vh);
    this.fgCtx.drawImage(clean, 0, 0, vw, vh);
    this.fgCtx.globalCompositeOperation = 'destination-in';
    this.fgCtx.drawImage(this.maskCanvas, 0, 0, vw, vh);
    this.fgCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.fgCanvas, 0, 0, vw, vh);
  }

  private drawParticles(width: number, height: number): void {
    const particles = this.animationController.getParticleEngine();
    particles.render(width, height);
    if (this.particlesUseWebGL && particles.getActiveParticleCount() > 0) {
      this.outputCtx.drawImage(this.particleCanvas, 0, 0, width, height);
    }
  }

  /**
   * Applies a stable, position-dependent dissolve threshold, not a flat opacity fade.
   */
  private drawDissolvingForeground(
    video: HTMLVideoElement | HTMLCanvasElement,
    mask: { data: Float32Array | null; width: number; height: number },
    opacity: number,
    vw: number,
    vh: number
  ): void {
    if (!mask.data || mask.width <= 0 || mask.height <= 0) {
      // Fallback: draw video with general opacity
      this.outputCtx.save();
      this.outputCtx.globalAlpha = Math.max(0, Math.min(1, opacity));
      this.outputCtx.drawImage(video, 0, 0, vw, vh);
      this.outputCtx.restore();
      return;
    }

    // Prepare soft alpha mask
    if (this.maskCanvas.width !== mask.width || this.maskCanvas.height !== mask.height) {
      this.maskCanvas.width = mask.width;
      this.maskCanvas.height = mask.height;
    }

    const maskImgData = this.maskCtx.createImageData(mask.width, mask.height);
    const mData = mask.data;
    const pData = maskImgData.data;
    const len = mData.length;

    for (let i = 0; i < len; i++) {
      const conf = mData[i];
      const pIdx = i * 4;
      pData[pIdx] = 255;
      pData[pIdx + 1] = 255;
      pData[pIdx + 2] = 255;
      const x = i % mask.width;
      const y = Math.floor(i / mask.width);
      const nx = x / Math.max(1, mask.width - 1);
      const ny = y / Math.max(1, mask.height - 1);
      const direction = this.settingsStore.getSettings().dissolveDirection;
      let gradient = 1 - ny;
      if (direction === 'wind_right') gradient = nx;
      if (direction === 'radial_out') gradient = Math.min(1, Math.hypot(nx - 0.5, ny - 0.5) * 1.414);
      const blockX = Math.floor(x / 4);
      const blockY = Math.floor(y / 4);
      // Stable spatial hash so pixels do not change dissolution order between frames.
      let hash = (Math.imul(blockX, 374761393) + Math.imul(blockY, 668265263)) | 0;
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      const noise = ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
      const threshold = 0.03 + 0.94 * (0.65 * gradient + 0.35 * noise);
      const edgeAlpha = Math.min(1, Math.max(0, (threshold - (1 - opacity)) * 25));
      pData[pIdx + 3] = Math.round(Math.min(1, Math.max(0, conf)) * edgeAlpha * 255);
    }
    this.maskCtx.putImageData(maskImgData, 0, 0);

    // Composite foreground onto fgCanvas using source-in mask
    this.fgCtx.clearRect(0, 0, vw, vh);
    this.fgCtx.drawImage(video, 0, 0, vw, vh);
    this.fgCtx.globalCompositeOperation = 'destination-in';
    this.fgCtx.drawImage(this.maskCanvas, 0, 0, vw, vh);
    this.fgCtx.globalCompositeOperation = 'source-over';

    // Draw masked foreground onto main canvas
    this.outputCtx.save();
    this.outputCtx.drawImage(this.fgCanvas, 0, 0, vw, vh);
    this.outputCtx.restore();
  }

  private drawMaskVisualization(
    mask: { data: Float32Array | null; width: number; height: number },
    vw: number,
    vh: number
  ): void {
    const ctx = this.outputCtx;
    ctx.fillStyle = '#0f0c20';
    ctx.fillRect(0, 0, vw, vh);

    if (!mask.data || mask.width <= 0) return;

    if (this.maskCanvas.width !== mask.width || this.maskCanvas.height !== mask.height) {
      this.maskCanvas.width = mask.width;
      this.maskCanvas.height = mask.height;
    }

    const imgData = this.maskCtx.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) {
      const val = Math.floor(mask.data[i] * 255);
      const p = i * 4;
      imgData.data[p] = 56; // Cyan mask overlay
      imgData.data[p + 1] = 189;
      imgData.data[p + 2] = 248;
      imgData.data[p + 3] = val;
    }
    this.maskCtx.putImageData(imgData, 0, 0);
    ctx.drawImage(this.maskCanvas, 0, 0, vw, vh);
  }

  private drawHandLandmarks(
    video: HTMLVideoElement,
    timestamp: number,
    vw: number,
    vh: number
  ): void {
    const landmarks = this.visionEngine.getHandLandmarks(video, timestamp);
    if (!landmarks) return;

    const ctx = this.outputCtx;
    ctx.save();
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;

    for (const pt of landmarks) {
      const px = pt.x * vw;
      const py = pt.y * vh;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
