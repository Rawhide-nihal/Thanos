export interface AudioSnapDiagnostics {
  isListening: boolean;
  transientDetected: boolean;
  lastTransientTime: number;
  energyLevel: number;
  highFreqEnergy: number;
  error: string | null;
}

export class AudioSnapDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private isListening = false;
  private lastTransientTime = 0;
  private onTransientDetected?: (timestampMs: number) => void;
  private error: string | null = null;

  // Analysis buffers
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private previousEnergy = 0;

  constructor(onTransientDetected?: (timestampMs: number) => void) {
    this.onTransientDetected = onTransientDetected;
  }

  public getDiagnostics(): AudioSnapDiagnostics {
    return {
      isListening: this.isListening,
      transientDetected: performance.now() - this.lastTransientTime < 200,
      lastTransientTime: this.lastTransientTime,
      energyLevel: this.previousEnergy,
      highFreqEnergy: 0,
      error: this.error,
    };
  }

  public async startListening(): Promise<boolean> {
    if (this.isListening) return true;

    try {
      this.error = null;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });

      this.stream = stream;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
      
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.1; // Fast response for transients

      source.connect(this.analyser);
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.isListening = true;

      this.processAudioLoop();
      return true;
    } catch (err: unknown) {
      this.error = err instanceof Error ? err.message : String(err);
      this.isListening = false;
      console.warn('SnapShift: Audio transient detection unavailable (microphone denied or busy):', this.error);
      return false;
    }
  }

  public stopListening(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.isListening = false;
  }

  public hasRecentTransient(withinMs: number = 200): boolean {
    return performance.now() - this.lastTransientTime <= withinMs;
  }

  private processAudioLoop = (): void => {
    if (!this.isListening || !this.analyser || !this.frequencyData) return;

    this.analyser.getByteFrequencyData(this.frequencyData);

    // Finger snap acoustic characteristics:
    // Strong transient in the 2.5kHz - 7kHz range
    // Frequency bins for 512 FFT at 48kHz: bin bandwidth is 48000/512 = 93.75 Hz
    // 2.5kHz is approx bin 27, 7kHz is approx bin 75
    const binStart = Math.floor(2500 / (this.audioContext?.sampleRate ? this.audioContext.sampleRate / 512 : 93.75));
    const binEnd = Math.min(
      Math.floor(7000 / (this.audioContext?.sampleRate ? this.audioContext.sampleRate / 512 : 93.75)),
      this.frequencyData.length - 1
    );

    let highFreqSum = 0;
    for (let i = binStart; i <= binEnd; i++) {
      highFreqSum += this.frequencyData[i];
    }
    const avgHighFreq = highFreqSum / (binEnd - binStart + 1);

    // Sudden rise in high frequency energy
    const energyDelta = avgHighFreq - this.previousEnergy;
    const now = performance.now();

    // Sharp attack threshold (>45 units jump within a single analysis frame)
    if (energyDelta > 45 && avgHighFreq > 80 && now - this.lastTransientTime > 300) {
      this.lastTransientTime = now;
      if (this.onTransientDetected) {
        this.onTransientDetected(now);
      }
    }

    this.previousEnergy = avgHighFreq;
    this.animationFrameId = requestAnimationFrame(this.processAudioLoop);
  };
}
