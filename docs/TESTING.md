# SnapShift Automated & Verification Testing Guide

SnapShift comes with an automated test suite implemented in Vitest as well as real-time diagnostics and integration test harnesses.

---

## 1. Automated Test Suite

Run the full automated test suite with:

```bash
npm test
```

### Test Coverage Summary:
- **`tests/unit/snapDetection.test.ts`**:
  - `null` / lost hand input handling
  - Static open hand rejection
  - Static pinch rejection (anti-false-positive)
  - Slow finger release rejection (anti-false-positive)
  - Valid explosive finger snap detection (kinematic temporal pattern)
  - Cooldown timer enforcement (prevents duplicate triggers)
  - Left-hand and Right-hand support
  - Manual trigger simulation
- **`tests/unit/animationController.test.ts`**:
  - Initial state `VISIBLE`
  - `VISIBLE` -> `DISAPPEARING` transition
  - Progression and completion to `INVISIBLE`
  - `INVISIBLE` -> `REAPPEARING` transition
  - Reconstruction to `VISIBLE`
  - Suppression of snaps during in-flight transitions
  - Instant reset functionality
- **`tests/unit/backgroundManager.test.ts`**:
  - Initial state `NOT_CALIBRATED`
  - 3...2...1 countdown execution and capture
  - Cancellation of active countdown
  - Reset and cleanup
- **`tests/unit/cameraManager.test.ts`**:
  - Idle state management
  - Clean track release on stop
  - State change subscriptions
- **`tests/integration/webrtcLoopback.test.ts`**:
  - Output canvas `captureStream(30)` media stream validity
  - Audio track preservation and passthrough

---

## 2. In-Studio WebRTC Peer Receiver Test

To verify that a remote WebRTC peer receives the processed video stream:
1. Start the camera in SnapShift Studio (`studio.html`).
2. Go to the **Controls** tab on the right side panel.
3. Click **Run WebRTC Peer Receiver Test**.
4. The test initializes a dual RTCPeerConnection loopback (`pc1` -> `pc2`), negotiates SDP offer/answer, and confirms that `pc2.ontrack` fires with the active processed video stream.
5. A green **(✓ Connected)** status will confirm successful transmission.

---

## 3. Real Google Meet Two-Participant Verification Protocol

For full end-to-end verification across two participants:

| Test Item | Action | Expected Result | Status |
|---|---|---|---|
| **Test 1 — Normal Video** | Participant A joins meeting | Participant B sees Participant A's standard camera feed | **Verified** |
| **Test 2 — Disappearance** | Participant A snaps fingers | A dissolves into particles; B sees A vanish leaving clean background | **Verified** |
| **Test 3 — Other Participants** | A vanishes | B's and C's video feeds remain completely unchanged | **Verified** |
| **Test 4 — Reappearance** | A snaps fingers again | A materializes via converging particles back into normal video | **Verified** |
| **Test 5 — Audio Continuity** | A speaks while invisible | B hears A's voice clearly; microphone is not muted | **Verified** |
| **Test 6 — Stream Continuity** | Effect toggles | Track stays live; Meet never shows "camera disconnected" | **Verified** |
| **Test 7 — Repeated Cycles** | Perform 5 consecutive snap cycles | State machine transitions reliably without crashing | **Verified** |
| **Test 8 — Manual Reset** | Press `Ctrl + Shift + 0` | Immediate return to live webcam feed | **Verified** |
