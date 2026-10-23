export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

export interface CameraState {
  isStreaming: boolean;
  selectedDeviceId: string;
  availableDevices: CameraDeviceInfo[];
  activeResolution: { width: number; height: number };
  activeFPS: number;
  error: string | null;
  permissionGranted: boolean;
}

export type CameraStateListener = (state: CameraState) => void;

export class CameraManager {
  private static instance: CameraManager;
  private currentStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private stateListeners: Set<CameraStateListener> = new Set();
  private state: CameraState = {
    isStreaming: false,
    selectedDeviceId: '',
    availableDevices: [],
    activeResolution: { width: 1280, height: 720 },
    activeFPS: 30,
    error: null,
    permissionGranted: false,
  };

  private constructor() {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        this.refreshDeviceList();
      });
    }
  }

  public static getInstance(): CameraManager {
    if (!CameraManager.instance) {
      CameraManager.instance = new CameraManager();
    }
    return CameraManager.instance;
  }

  public getState(): CameraState {
    return { ...this.state };
  }

  public subscribe(listener: CameraStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  private notify(): void {
    const currentState = this.getState();
    for (const listener of this.stateListeners) {
      listener(currentState);
    }
  }

  public async refreshDeviceList(): Promise<CameraDeviceInfo[]> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      this.updateState({ error: 'MediaDevices API not supported in this environment.' });
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${index + 1} (${d.deviceId.slice(0, 5)}...)`,
        }));

      let selectedId = this.state.selectedDeviceId;
      if (!selectedId && videoDevices.length > 0) {
        selectedId = videoDevices[0].deviceId;
      }

      this.updateState({
        availableDevices: videoDevices,
        selectedDeviceId: selectedId,
        error: null,
      });

      return videoDevices;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.updateState({ error: `Failed to list camera devices: ${msg}` });
      return [];
    }
  }

  public async startCamera(deviceId?: string, preferredRes: '720p' | '480p' = '720p'): Promise<MediaStream> {
    this.stopCamera();

    const targetWidth = preferredRes === '720p' ? 1280 : 640;
    const targetHeight = preferredRes === '720p' ? 720 : 480;

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: targetWidth, min: 640 },
        height: { ideal: targetHeight, min: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.currentStream = stream;
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();

      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;
      }
      this.videoElement.srcObject = stream;
      await this.videoElement.play().catch(() => {});

      // Watch for unexpected track end
      track.onended = () => {
        this.updateState({
          isStreaming: false,
          error: 'Camera disconnected or track ended unexpectedly.',
        });
      };

      this.updateState({
        isStreaming: true,
        permissionGranted: true,
        selectedDeviceId: settings.deviceId || deviceId || '',
        activeResolution: {
          width: settings.width || targetWidth,
          height: settings.height || targetHeight,
        },
        activeFPS: settings.frameRate || 30,
        error: null,
      });

      // Update device list now that permissions are granted and labels are accessible
      await this.refreshDeviceList();

      return stream;
    } catch (err: unknown) {
      let friendlyError = 'Failed to access camera.';
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          friendlyError = 'Camera permission was denied. Please allow camera access in browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          friendlyError = 'No camera found on your system. Please connect a webcam.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          friendlyError = 'Camera is already in use by another application (e.g. Zoom, Meet, OBS). Please close it and retry.';
        } else if (err.name === 'OverconstrainedError') {
          // Fallback to basic constraints if 720p is overconstrained
          console.warn('SnapShift: Overconstrained 720p, falling back to default resolution...');
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            this.currentStream = fallbackStream;
            return fallbackStream;
          } catch (fallbackErr) {
            friendlyError = `Failed to obtain camera with fallback constraints: ${String(fallbackErr)}`;
          }
        } else {
          friendlyError = `Camera error: ${err.message} (${err.name})`;
        }
      } else if (err instanceof Error) {
        friendlyError = err.message;
      }

      this.updateState({
        isStreaming: false,
        error: friendlyError,
      });
      throw new Error(friendlyError);
    }
  }

  public stopCamera(): void {
    if (this.currentStream) {
      for (const track of this.currentStream.getTracks()) {
        track.stop();
      }
      this.currentStream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.updateState({
      isStreaming: false,
    });
  }

  public getRawStream(): MediaStream | null {
    return this.currentStream;
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  private updateState(partial: Partial<CameraState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }
}
