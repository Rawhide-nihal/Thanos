export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export type SnapState =
  | 'IDLE'
  | 'SNAP_PREPARATION'
  | 'FINGERS_CONTACT'
  | 'RAPID_RELEASE'
  | 'SNAP_CONFIRMED'
  | 'COOLDOWN';

export interface SnapDiagnostics {
  handDetected: boolean;
  handedness: 'Left' | 'Right' | 'Unknown';
  currentState: SnapState;
  thumbMiddleDistanceNorm: number;
  releaseVelocity: number;
  lastSnapTimestamp: number;
  snapCount: number;
  confidence: number;
}

export interface SnapDetectorOptions {
  sensitivity: number; // 0.1 to 1.0 (default 0.65)
  cooldownMs: number; // default 1500
  onSnapDetected?: () => void;
}

export class SnapDetector {
  private currentState: SnapState = 'IDLE';
  private sensitivity: number;
  private cooldownMs: number;
  private onSnapDetected?: () => void;

  // Temporal state tracking
  private lastStateChangeTime = 0;
  private contactStartTime = 0;
  private previousDistanceNorm = 1.0;
  private previousTimestamp = 0;
  private lastSnapTimestamp = 0;
  private snapCount = 0;

  // Diagnostics cache
  private latestDiagnostics: SnapDiagnostics = {
    handDetected: false,
    handedness: 'Unknown',
    currentState: 'IDLE',
    thumbMiddleDistanceNorm: 1.0,
    releaseVelocity: 0,
    lastSnapTimestamp: 0,
    snapCount: 0,
    confidence: 0,
  };

  constructor(options: SnapDetectorOptions) {
    this.sensitivity = options.sensitivity;
    this.cooldownMs = options.cooldownMs;
    this.onSnapDetected = options.onSnapDetected;
  }

  public updateOptions(options: Partial<SnapDetectorOptions>): void {
    if (options.sensitivity !== undefined) this.sensitivity = options.sensitivity;
    if (options.cooldownMs !== undefined) this.cooldownMs = options.cooldownMs;
    if (options.onSnapDetected !== undefined) this.onSnapDetected = options.onSnapDetected;
  }

  public getDiagnostics(): SnapDiagnostics {
    return { ...this.latestDiagnostics };
  }

  public triggerManualSnap(): void {
    const now = performance.now();
    this.currentState = 'SNAP_CONFIRMED';
    this.lastSnapTimestamp = now;
    this.snapCount++;
    this.latestDiagnostics = {
      ...this.latestDiagnostics,
      currentState: 'SNAP_CONFIRMED',
      lastSnapTimestamp: now,
      snapCount: this.snapCount,
    };
    if (this.onSnapDetected) {
      this.onSnapDetected();
    }
    // Enter cooldown
    this.currentState = 'COOLDOWN';
    this.lastStateChangeTime = now;
  }

  public reset(): void {
    this.currentState = 'IDLE';
    this.lastStateChangeTime = performance.now();
    this.contactStartTime = 0;
    this.previousDistanceNorm = 1.0;
    this.latestDiagnostics.currentState = 'IDLE';
  }

  /**
   * Evaluates hand landmarks for a single frame
   */
  public processHandLandmarks(
    landmarks: NormalizedLandmark[] | null | undefined,
    handednessLabel: string = 'Unknown',
    timestampMs: number = performance.now()
  ): boolean {
    const now = timestampMs;

    // Check cooldown state first
    if (this.currentState === 'COOLDOWN') {
      if (now - this.lastStateChangeTime >= this.cooldownMs) {
        this.currentState = 'IDLE';
        this.lastStateChangeTime = now;
      } else {
        this.latestDiagnostics.currentState = 'COOLDOWN';
        return false;
      }
    }

    if (!landmarks || landmarks.length < 21) {
      // Hand lost or not in view
      this.currentState = 'IDLE';
      this.latestDiagnostics = {
        ...this.latestDiagnostics,
        handDetected: false,
        handedness: 'Unknown',
        currentState: this.currentState,
        releaseVelocity: 0,
      };
      return false;
    }

    // Key landmarks according to MediaPipe Hand Landmark spec:
    // 0: Wrist
    // 4: Thumb Tip, 3: Thumb IP, 2: Thumb MCP
    // 8: Index Tip, 5: Index MCP
    // 12: Middle Tip, 9: Middle MCP
    // 16: Ring Tip
    // 20: Pinky Tip
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const middleMcp = landmarks[9];

    // Calculate palm scale reference (wrist to middle MCP)
    const palmDx = middleMcp.x - wrist.x;
    const palmDy = middleMcp.y - wrist.y;
    const palmDz = (middleMcp.z || 0) - (wrist.z || 0);
    const palmScale = Math.sqrt(palmDx * palmDx + palmDy * palmDy + palmDz * palmDz);

    // Prevent division by zero
    const safePalmScale = Math.max(palmScale, 0.05);

    // Normalized Euclidean distance between thumb tip and middle finger tip
    const dx = thumbTip.x - middleTip.x;
    const dy = thumbTip.y - middleTip.y;
    const dz = (thumbTip.z || 0) - (middleTip.z || 0);
    const rawDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const distNorm = rawDist / safePalmScale;

    // Time delta for velocity
    const dt = Math.max((now - this.previousTimestamp) / 1000, 0.008); // seconds
    const velocity = (distNorm - this.previousDistanceNorm) / dt;

    // Sensitivity adjusts contact and velocity thresholds
    // Higher sensitivity = easier to trigger (lower velocity threshold, larger contact radius)
    const contactThreshold = 0.16 + (this.sensitivity - 0.5) * 0.08; // approx 0.12 - 0.20
    const prepThreshold = 0.28 + (this.sensitivity - 0.5) * 0.10;
    const minReleaseVelocity = 2.4 - (this.sensitivity - 0.5) * 1.5; // approx 1.6 - 3.2 normalized/sec

    // Anti-false-positive checks:
    // In a fist, all fingers are tightly curled towards palm (index tip is near wrist or index MCP)
    const indexDistToMcp = Math.sqrt(
      Math.pow(indexTip.x - landmarks[5].x, 2) + Math.pow(indexTip.y - landmarks[5].y, 2)
    ) / safePalmScale;

    // Waving detection: If wrist is moving with high global translation, discard accidental contact
    let snapDetectedThisFrame = false;

    switch (this.currentState) {
      case 'IDLE': {
        if (distNorm < prepThreshold && distNorm > contactThreshold) {
          this.currentState = 'SNAP_PREPARATION';
          this.lastStateChangeTime = now;
        } else if (distNorm <= contactThreshold) {
          this.currentState = 'FINGERS_CONTACT';
          this.contactStartTime = now;
          this.lastStateChangeTime = now;
        }
        break;
      }

      case 'SNAP_PREPARATION': {
        if (distNorm <= contactThreshold) {
          this.currentState = 'FINGERS_CONTACT';
          this.contactStartTime = now;
          this.lastStateChangeTime = now;
        } else if (now - this.lastStateChangeTime > 600 || distNorm > prepThreshold * 1.4) {
          // Timed out or moved away without contacting
          this.currentState = 'IDLE';
        }
        break;
      }

      case 'FINGERS_CONTACT': {
        const contactDuration = now - this.contactStartTime;

        if (distNorm <= contactThreshold * 1.3) {
          // Still in contact, maintain tension
          if (contactDuration > 1200) {
            // Holding fingers together for > 1.2s is a static hold/pinch, not an explosive snap
            // We stay in contact but won't trigger unless released with high impulse
          }
        } else {
          // Fingers separated! Check if it qualifies as a rapid release
          if (contactDuration >= 40 && contactDuration <= 850) {
            if (velocity >= minReleaseVelocity) {
              // Rapid release verified!
              this.currentState = 'RAPID_RELEASE';
              this.lastStateChangeTime = now;
            } else {
              // Slow pinch release
              this.currentState = 'IDLE';
            }
          } else {
            // Contact too brief (<40ms jitter) or too long (>850ms lazy release)
            this.currentState = 'IDLE';
          }
        }
        break;
      }

      case 'RAPID_RELEASE': {
        // Confirm follow-through within 120ms
        const timeSinceRelease = now - this.lastStateChangeTime;
        if (timeSinceRelease <= 150) {
          // Snap confirmed!
          this.currentState = 'SNAP_CONFIRMED';
          this.lastSnapTimestamp = now;
          this.snapCount++;
          snapDetectedThisFrame = true;

          if (this.onSnapDetected) {
            this.onSnapDetected();
          }

          // Move to cooldown
          this.currentState = 'COOLDOWN';
          this.lastStateChangeTime = now;
        } else {
          this.currentState = 'IDLE';
        }
        break;
      }
    }

    // Update history
    this.previousDistanceNorm = distNorm;
    this.previousTimestamp = now;

    // Update diagnostics
    this.latestDiagnostics = {
      handDetected: true,
      handedness: (handednessLabel.includes('Left') ? 'Left' : handednessLabel.includes('Right') ? 'Right' : 'Unknown'),
      currentState: this.currentState,
      thumbMiddleDistanceNorm: parseFloat(distNorm.toFixed(3)),
      releaseVelocity: parseFloat(velocity.toFixed(2)),
      lastSnapTimestamp: this.lastSnapTimestamp,
      snapCount: this.snapCount,
      confidence: indexDistToMcp > 0.4 ? 0.9 : 0.6,
    };

    return snapDetectedThisFrame;
  }
}
