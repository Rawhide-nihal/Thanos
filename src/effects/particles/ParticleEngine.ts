import { VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE } from '../shaders/particleShaders';
import { PRESET_PARTICLE_COUNTS, PerformancePreset } from '@/state/settingsStore';

export interface ParticleSpawnConfig {
  video: HTMLVideoElement;
  maskData: Float32Array;
  maskWidth: number;
  maskHeight: number;
  particlePreset: PerformancePreset;
  baseSize: number;
  speed: number;
  scatter: number;
  turbulence: number;
  dissolveDirection: 'bottom_up' | 'radial_out' | 'wind_right';
  isReappearance?: boolean;
}

export class ParticleEngine {
  private gl: WebGL2RenderingContext | null = null;
  private canvas2dCtx: CanvasRenderingContext2D | null = null;
  private isWebGL = false;

  // WebGL resources
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private posBuffer: WebGLBuffer | null = null;
  private colorBuffer: WebGLBuffer | null = null;
  private sizeBuffer: WebGLBuffer | null = null;
  private alphaBuffer: WebGLBuffer | null = null;

  // Particle data arrays (reused to prevent GC)
  private maxParticles = 14000;
  private activeCount = 0;
  private pos: Float32Array;
  private originPos: Float32Array;
  private targetPos: Float32Array;
  private vel: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private delays: Float32Array;
  private lifespans: Float32Array;
  private alphas: Float32Array;

  // Sampler canvas
  private sampleCanvas: HTMLCanvasElement;
  private sampleCtx: CanvasRenderingContext2D | null;

  constructor() {
    this.pos = new Float32Array(this.maxParticles * 2);
    this.originPos = new Float32Array(this.maxParticles * 2);
    this.targetPos = new Float32Array(this.maxParticles * 2);
    this.vel = new Float32Array(this.maxParticles * 2);
    this.colors = new Float32Array(this.maxParticles * 4);
    this.sizes = new Float32Array(this.maxParticles);
    this.delays = new Float32Array(this.maxParticles);
    this.lifespans = new Float32Array(this.maxParticles);
    this.alphas = new Float32Array(this.maxParticles);

    this.sampleCanvas = document.createElement('canvas');
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
  }

  public initWebGL(canvas: HTMLCanvasElement): boolean {
    try {
      this.gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      });

      if (!this.gl) {
        console.warn('SnapShift: WebGL2 not available, falling back to Canvas2D.');
        this.isWebGL = false;
        return false;
      }

      this.initShaders();
      this.initBuffers();
      this.isWebGL = true;
      return true;
    } catch (e) {
      console.warn('SnapShift: WebGL2 init exception, using 2D fallback:', e);
      this.isWebGL = false;
      return false;
    }
  }

  public set2DContext(ctx: CanvasRenderingContext2D): void {
    this.canvas2dCtx = ctx;
    this.isWebGL = false;
  }

  public getActiveParticleCount(): number {
    return this.activeCount;
  }

  /**
   * Spawns particles distributed across the human segmentation silhouette
   */
  public spawnFromForeground(config: ParticleSpawnConfig): void {
    const {
      video,
      maskData,
      maskWidth,
      maskHeight,
      particlePreset,
      baseSize,
      speed,
      scatter,
      turbulence,
      dissolveDirection,
      isReappearance = false,
    } = config;

    const targetCount = Math.min(PRESET_PARTICLE_COUNTS[particlePreset] || 6000, this.maxParticles);
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;

    // Sample video frame into sampler canvas
    const sampleW = Math.min(320, vw);
    const sampleH = Math.min(180, vh);
    this.sampleCanvas.width = sampleW;
    this.sampleCanvas.height = sampleH;

    if (!this.sampleCtx) return;
    this.sampleCtx.drawImage(video, 0, 0, sampleW, sampleH);
    const imgData = this.sampleCtx.getImageData(0, 0, sampleW, sampleH).data;

    // Collect valid foreground candidate coordinates
    const candidates: Array<{ x: number; y: number; confidence: number }> = [];
    const stepX = Math.max(1, Math.floor(sampleW / 120));
    const stepY = Math.max(1, Math.floor(sampleH / 90));

    for (let sy = 0; sy < sampleH; sy += stepY) {
      for (let sx = 0; sx < sampleW; sx += stepX) {
        const u = sx / sampleW;
        const v = sy / sampleH;
        const mx = Math.floor(u * maskWidth);
        const my = Math.floor(v * maskHeight);
        const mIdx = my * maskWidth + mx;
        const confidence = maskData[mIdx] || 0;

        if (confidence > 0.45) {
          candidates.push({ x: u, y: v, confidence });
        }
      }
    }

    if (candidates.length === 0) {
      this.activeCount = 0;
      return;
    }

    this.activeCount = targetCount;

    for (let i = 0; i < targetCount; i++) {
      const cand = candidates[Math.floor(Math.random() * candidates.length)];
      // Add slight jitter for continuous spatial distribution
      const jitterX = (Math.random() - 0.5) * (stepX / sampleW);
      const jitterY = (Math.random() - 0.5) * (stepY / sampleH);
      const normX = Math.min(1, Math.max(0, cand.x + jitterX));
      const normY = Math.min(1, Math.max(0, cand.y + jitterY));

      // Sample color from video frame
      const px = Math.min(sampleW - 1, Math.max(0, Math.floor(normX * sampleW)));
      const py = Math.min(sampleH - 1, Math.max(0, Math.floor(normY * sampleH)));
      const pIdx = (py * sampleW + px) * 4;

      const r = imgData[pIdx] / 255;
      const g = imgData[pIdx + 1] / 255;
      const b = imgData[pIdx + 2] / 255;

      this.originPos[i * 2] = normX;
      this.originPos[i * 2 + 1] = normY;
      this.targetPos[i * 2] = normX;
      this.targetPos[i * 2 + 1] = normY;

      // Color with slight glowing cosmic tint
      this.colors[i * 4] = Math.min(1, r * 1.05 + 0.05);
      this.colors[i * 4 + 1] = Math.min(1, g * 1.05 + 0.05);
      this.colors[i * 4 + 2] = Math.min(1, b * 1.1 + 0.1);
      this.colors[i * 4 + 3] = 1.0;

      this.sizes[i] = (baseSize + (Math.random() - 0.5) * 2.0);

      // Dissolve delay based on chosen gradient direction
      let delayProg = 0;
      if (dissolveDirection === 'bottom_up') {
        delayProg = (1.0 - normY) * 0.45; // lower body dissolves first
      } else if (dissolveDirection === 'wind_right') {
        delayProg = normX * 0.45;
      } else {
        // radial out
        const distFromCenter = Math.sqrt(Math.pow(normX - 0.5, 2) + Math.pow(normY - 0.5, 2));
        delayProg = distFromCenter * 0.5;
      }
      // Add spatial noise jitter to delay
      this.delays[i] = delayProg + Math.random() * 0.25;
      this.lifespans[i] = 0.7 + Math.random() * 0.5;

      // Initial velocity & drift physics
      const angle = (Math.random() - 0.5) * Math.PI * 0.8 - Math.PI * 0.5; // upwards bias
      const speedVal = (0.05 + Math.random() * 0.25) * speed * scatter;
      const vx = Math.cos(angle) * speedVal + (Math.random() - 0.5) * turbulence * 0.1;
      const vy = Math.sin(angle) * speedVal - 0.08 * speed; // upward lift

      this.vel[i * 2] = vx;
      this.vel[i * 2 + 1] = vy;

      if (!isReappearance) {
        // Disappearance: start at body position
        this.pos[i * 2] = normX;
        this.pos[i * 2 + 1] = normY;
        this.alphas[i] = 1.0;
      } else {
        // Reappearance: start scattered outside/above and converge inward
        this.pos[i * 2] = normX + vx * 2.5 + (Math.random() - 0.5) * 0.3;
        this.pos[i * 2 + 1] = normY + vy * 2.5 - 0.2 - Math.random() * 0.3;
        this.alphas[i] = 0.0;
      }
    }
  }

  /**
   * Updates particle positions and lifetimes
   * @param progress Animation progress [0.0, 1.0]
   * @param isReappearance Reappearance mode flag
   */
  public update(progress: number, isReappearance = false): void {
    if (this.activeCount === 0) return;

    for (let i = 0; i < this.activeCount; i++) {
      const delay = this.delays[i];
      const life = this.lifespans[i];

      if (!isReappearance) {
        // Disappearance phase
        if (progress < delay) {
          // Has not dissolved yet, keep at origin
          this.pos[i * 2] = this.originPos[i * 2];
          this.pos[i * 2 + 1] = this.originPos[i * 2 + 1];
          this.alphas[i] = 0.0; // Body is still rendered by foreground canvas
        } else {
          // Dissolved! Move with velocity and turbulence
          const activeTime = (progress - delay) / (1.0 - delay);
          const t = Math.min(1.0, activeTime / life);

          // Drift + curl
          const curlX = Math.sin(t * 8.0 + i) * 0.02;
          const vx = this.vel[i * 2];
          const vy = this.vel[i * 2 + 1];

          this.pos[i * 2] = this.originPos[i * 2] + (vx + curlX) * t;
          this.pos[i * 2 + 1] = this.originPos[i * 2 + 1] + vy * t;

          // Dissolve fade out to dust
          this.alphas[i] = Math.max(0, 1.0 - Math.pow(t, 1.5));
        }
      } else {
        // Reappearance phase: particles converge from dispersed cloud to target
        const t = 1.0 - progress;

        const curX = this.targetPos[i * 2] + this.vel[i * 2] * 2.0 * t;
        const curY = this.targetPos[i * 2 + 1] + this.vel[i * 2 + 1] * 2.0 * t;

        this.pos[i * 2] = curX;
        this.pos[i * 2 + 1] = curY;
        this.alphas[i] = Math.min(1.0, progress * 2.0) * Math.max(0, 1.0 - progress);
      }
    }
  }

  /**
   * Renders active particles to canvas
   */
  public render(canvasWidth: number, canvasHeight: number): void {
    if (this.activeCount === 0) return;

    if (this.isWebGL && this.gl && this.program && this.vao) {
      this.renderWebGL(canvasWidth, canvasHeight);
    } else if (this.canvas2dCtx) {
      this.renderCanvas2D(canvasWidth, canvasHeight);
    }
  }

  public clear(): void {
    this.activeCount = 0;
  }

  private renderWebGL(width: number, height: number): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.vao) return;

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(this.vao);

    // Update VBOs with current sub-arrays
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pos.subarray(0, this.activeCount * 2));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colors.subarray(0, this.activeCount * 4));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sizes.subarray(0, this.activeCount));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.alphaBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.alphas.subarray(0, this.activeCount));

    gl.drawArrays(gl.POINTS, 0, this.activeCount);
    gl.bindVertexArray(null);
  }

  private renderCanvas2D(width: number, height: number): void {
    const ctx = this.canvas2dCtx;
    if (!ctx) return;

    ctx.save();
    for (let i = 0; i < this.activeCount; i++) {
      const alpha = this.alphas[i];
      if (alpha <= 0.01) continue;

      const px = this.pos[i * 2] * width;
      const py = this.pos[i * 2 + 1] * height;
      const size = this.sizes[i];

      const r = Math.floor(this.colors[i * 4] * 255);
      const g = Math.floor(this.colors[i * 4 + 1] * 255);
      const b = Math.floor(this.colors[i * 4 + 2] * 255);

      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, size * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private initShaders(): void {
    const gl = this.gl;
    if (!gl) return;

    const createShader = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(`Shader compile error: ${info}`);
      }
      return s;
    };

    const vs = createShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(this.program);
      throw new Error(`Program link error: ${info}`);
    }
  }

  private initBuffers(): void {
    const gl = this.gl;
    if (!gl || !this.program) return;

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    // Positions (location 0)
    this.posBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.pos.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Colors (location 1)
    this.colorBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.colors.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);

    // Sizes (location 2)
    this.sizeBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.sizes.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

    // Alphas (location 3)
    this.alphaBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.alphaBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.alphas.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }
}
