import { describe, it, expect, beforeEach } from 'vitest';
import { SnapDetector, NormalizedLandmark } from '@/vision/snapDetection/SnapDetector';

// Helper to generate synthetic 21 hand landmarks
function createSyntheticHand(thumbMiddleDistance: number, _handedness: 'Left' | 'Right' = 'Right'): NormalizedLandmark[] {
  // Landmarks array of size 21
  const landmarks: NormalizedLandmark[] = Array.from({ length: 21 }, (_, i) => ({
    x: 0.5 + (i * 0.005),
    y: 0.5 + (i * 0.005),
    z: 0.0,
  }));

  // Wrist: landmark 0
  landmarks[0] = { x: 0.5, y: 0.8, z: 0 };
  // Middle MCP: landmark 9
  landmarks[9] = { x: 0.5, y: 0.5, z: 0 }; // Palm scale = 0.3

  // Palm scale is 0.3
  // Thumb Tip: landmark 4
  landmarks[4] = { x: 0.45, y: 0.4, z: 0 };
  // Middle Tip: landmark 12
  // We place middleTip at thumbMiddleDistance * palmScale away from thumbTip
  const rawDist = thumbMiddleDistance * 0.3;
  landmarks[12] = { x: 0.45 + rawDist, y: 0.4, z: 0 };

  // Index Tip: landmark 8
  landmarks[8] = { x: 0.48, y: 0.35, z: 0 };

  return landmarks;
}

describe('SnapDetector - Temporal Gesture Recognizer', () => {
  let detector: SnapDetector;
  let snapTriggerCount = 0;

  beforeEach(() => {
    snapTriggerCount = 0;
    detector = new SnapDetector({
      sensitivity: 0.65,
      cooldownMs: 1000,
      onSnapDetected: () => {
        snapTriggerCount++;
      },
    });
  });

  it('1. Handles null or no hand visible cleanly', () => {
    const result = detector.processHandLandmarks(null, 'Unknown', 1000);
    expect(result).toBe(false);
    expect(detector.getDiagnostics().handDetected).toBe(false);
    expect(detector.getDiagnostics().currentState).toBe('IDLE');
  });

  it('2. Does not trigger on static open hand', () => {
    // Open hand has large thumb-middle distance (e.g. 1.2 normalized)
    const openHand = createSyntheticHand(1.2);
    for (let t = 1000; t <= 1500; t += 33) {
      detector.processHandLandmarks(openHand, 'Right', t);
    }
    expect(snapTriggerCount).toBe(0);
    expect(detector.getDiagnostics().currentState).toBe('IDLE');
  });

  it('3. Does not trigger on static pinching fingers without release', () => {
    // Contact distance (e.g. 0.1 normalized) held static
    const pinchHand = createSyntheticHand(0.1);
    for (let t = 1000; t <= 2000; t += 33) {
      detector.processHandLandmarks(pinchHand, 'Right', t);
    }
    expect(snapTriggerCount).toBe(0);
    expect(detector.getDiagnostics().currentState).toBe('FINGERS_CONTACT');
  });

  it('4. Does not trigger on slow finger release (slow pinch open)', () => {
    let t = 1000;
    // Step A: Contact fingers
    const contactHand = createSyntheticHand(0.1);
    for (let i = 0; i < 5; i++) {
      detector.processHandLandmarks(contactHand, 'Right', t);
      t += 33;
    }

    // Step B: Very slow separation over 1500ms
    for (let d = 0.12; d <= 0.9; d += 0.05) {
      detector.processHandLandmarks(createSyntheticHand(d), 'Right', t);
      t += 100; // Slow 100ms steps -> velocity very low
    }

    expect(snapTriggerCount).toBe(0);
  });

  it('5. Successfully recognizes a valid rapid finger snap', () => {
    let t = 1000;

    // Phase 1: Preparation (approaching)
    detector.processHandLandmarks(createSyntheticHand(0.25), 'Right', t);
    t += 33;

    // Phase 2: Contact
    detector.processHandLandmarks(createSyntheticHand(0.12), 'Right', t);
    t += 50;
    detector.processHandLandmarks(createSyntheticHand(0.10), 'Right', t);
    t += 50;

    // Phase 3: Rapid explosive release (jumps from 0.10 to 0.65 in 33ms)
    // High velocity = (0.65 - 0.10) / 0.033 ≈ 16.6 / sec
    detector.processHandLandmarks(createSyntheticHand(0.65), 'Right', t);
    t += 30;

    // Phase 4: Follow-through
    const snapped = detector.processHandLandmarks(createSyntheticHand(0.85), 'Right', t);

    expect(snapped).toBe(true);
    expect(snapTriggerCount).toBe(1);
    expect(detector.getDiagnostics().snapCount).toBe(1);
    expect(detector.getDiagnostics().currentState).toBe('COOLDOWN');
  });

  it('6. Enforces cooldown period to prevent duplicate triggers', () => {
    let t = 1000;

    // Trigger first snap
    detector.processHandLandmarks(createSyntheticHand(0.10), 'Right', t);
    t += 80;
    detector.processHandLandmarks(createSyntheticHand(0.70), 'Right', t);
    t += 30;
    detector.processHandLandmarks(createSyntheticHand(0.85), 'Right', t);
    expect(snapTriggerCount).toBe(1);

    // Immediate second snap attempt during 1000ms cooldown
    t += 200;
    detector.processHandLandmarks(createSyntheticHand(0.10), 'Right', t);
    t += 50;
    detector.processHandLandmarks(createSyntheticHand(0.70), 'Right', t);
    // Should NOT trigger because cooldown is active
    expect(snapTriggerCount).toBe(1);

    // After cooldown expires (> 1000ms)
    t += 1100;
    detector.processHandLandmarks(createSyntheticHand(0.10), 'Right', t);
    t += 80;
    detector.processHandLandmarks(createSyntheticHand(0.70), 'Right', t);
    t += 30;
    detector.processHandLandmarks(createSyntheticHand(0.85), 'Right', t);
    expect(snapTriggerCount).toBe(2);
  });

  it('7. Supports both Left and Right hand input', () => {
    let t = 1000;
    // Left hand snap
    detector.processHandLandmarks(createSyntheticHand(0.10, 'Left'), 'Left', t);
    t += 80;
    detector.processHandLandmarks(createSyntheticHand(0.70, 'Left'), 'Left', t);
    t += 30;
    const snapped = detector.processHandLandmarks(createSyntheticHand(0.85, 'Left'), 'Left', t);
    expect(snapped).toBe(true);
    expect(detector.getDiagnostics().handedness).toBe('Left');
  });

  it('8. Supports manual trigger simulation', () => {
    detector.triggerManualSnap();
    expect(snapTriggerCount).toBe(1);
    expect(detector.getDiagnostics().snapCount).toBe(1);
  });
});
