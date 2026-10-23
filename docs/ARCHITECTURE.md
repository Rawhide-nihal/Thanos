# SnapShift Architecture & Technical Specification

## 1. System Overview

SnapShift is an end-to-end real-time computer vision, particle VFX, and camera virtualization system packaged as a Chrome Extension (Manifest V3) and standalone Web Studio.

When a participant in a Google Meet video conference performs a physical finger snap, the system recognizes the gesture and disintegrates the participant's silhouette into thousands of organic particles, leaving the real background intact. Snapping again reconstructs the participant back into the meeting feed.

```
Physical Webcam
      │
      ▼
CameraManager (640x480 / 1280x720 @ 30 FPS)
      │
      ├────────────────────────────────────────┐
      ▼                                        ▼
MediaPipe Hand Landmarker             MediaPipe Image Segmenter
(21 3D Hand Landmarks)                (Person Foreground Confidence Mask)
      │                                        │
      ▼                                        ▼
SnapDetector State Machine            BackgroundManager
• IDLE                                • Clean Background Calibration
• SNAP_PREPARATION                    • Seamless Edge Blending
• FINGERS_CONTACT                     • Real-time Occlusion Replacement
• RAPID_RELEASE                                │
• SNAP_CONFIRMED                               ▼
      │                              Compositing Pipeline
      └───────────────────────────────────────►│
                                               ▼
                                      ParticleEngine (WebGL2 / 2D)
                                      • Spatially varying dissolve
                                      • Palette-mapped fragments
                                      • Turbulence / curl drift
                                               │
                                               ▼
                                      VideoOutputManager
                                      (Canvas captureStream @ 30 FPS)
                                               │
                         ┌─────────────────────┴─────────────────────┐
                         ▼                                           ▼
            Direct Google Meet Interception              OBS Virtual Camera Fallback
            (MAIN-world getUserMedia Hook)               (Clean 16:9 Window Capture)
```

---

## 2. Component Breakdown

### 2.1 CameraManager (`src/camera/CameraManager.ts`)
- Manages single-owner webcam stream capture via `navigator.mediaDevices.getUserMedia`.
- Auto-detects device resolution capabilities (prefers 720p @ 30fps with automatic fallback to 480p).
- Handles track endings, device changes, and `NotReadableError` (when camera is busy).

### 2.2 HandLandmarker & SnapDetector (`src/vision/`)
- Uses locally bundled MediaPipe vision WASM and `hand_landmarker.task`.
- Normalizes landmark distances by the user's hand scale (wrist-to-MCP distance $L_{palm}$) to maintain consistent detection at varying distances from the webcam.
- Evaluates temporal kinematics: requires finger contact ($D_{norm} < 0.16$), minimum tension dwell time (40ms-850ms), and rapid separation release ($velocity > 2.4/s$).
- Rejects waving, static pinches, fists, and mouse clicks.
- Optional Web Audio API transient detector correlates acoustic impulse (<15ms attack) with hand gesture within $\pm 250\text{ms}$.

### 2.3 PersonSegmenter (`src/vision/personSegmentation/`)
- Executes locally bundled `selfie_segmenter.tflite` model.
- Generates soft foreground confidence masks with anti-jitter temporal smoothing.
- Incorporates drop-frame scheduling: inference never queues up behind rendering.

### 2.4 BackgroundManager (`src/background/BackgroundManager.ts`)
- Calibrates clean room frame via interactive 3...2...1 countdown.
- Caches background frame in high-speed canvas buffer.
- Seamlessly composites clean background into occluded body regions when invisible.

### 2.5 ParticleEngine (`src/effects/particles/ParticleEngine.ts`)
- WebGL2 instanced/point-sprite renderer with zero-allocation Float32Array buffers.
- Samples colors directly from current video foreground pixels.
- Disappearance: Spatially progressive dissolve front with simplex noise jitter.
- Reappearance: Continues tracking user position while invisible; particles converge towards the user's *new* position if they moved.

### 2.6 Streaming & Google Meet Integration (`src/streaming/`, `src/extension/`)
- Canvas output captures processed stream via `canvas.captureStream(30)`.
- Recombines original audio track unmodified to maintain full microphone continuity.
- Injects `interceptor.js` into Google Meet's MAIN world at `document_start` to intercept `getUserMedia`.
- OBS fallback provides a dedicated clean 16:9 frameless window (`output.html`) for zero-latency Window Capture.
