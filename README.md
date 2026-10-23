# SnapShift

> **Snap. Vanish. Reappear.**  
> Real-time AI webcam effects and Manifest V3 Chrome extension for Google Meet.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-success.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Vision_Tasks-orange.svg)](https://developers.google.com/mediapipe)
[![CI](https://github.com/Rawhide-nihal/Thanos/actions/workflows/ci.yml/badge.svg)](https://github.com/Rawhide-nihal/Thanos/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](./LICENSE)

---

## 1. Overview

**SnapShift** transforms your ordinary webcam into a cinematic visual effects studio. While participating in a live video conference (such as Google Meet), performing a physical finger snap disintegrates your silhouette into thousands of particles, leaving your real room background visible. Snapping again reconstructs your body back into the meeting feed.

### Core Distinctions
- **Only YOU vanish**: Unlike naive filters that blur or replace every participant's tile, SnapShift only modifies your own outgoing video stream.
- **Real background stays visible**: Does not freeze your camera or blank the screen. When you vanish, your real background is cleanly displayed.
- **Audio continuity**: Your microphone remains active. You can speak to participants while visually invisible.
- **100% Local AI**: Zero cloud APIs, zero subscriptions, zero video recordings sent over the network. All MediaPipe models and WASM binaries run entirely offline on your device.

---

## 2. Key Features

- **Kinematic Finger-Snap Recognition**:
  - Analyzes 21 3D hand landmarks in real time with temporal velocity tracking.
  - State machine: `IDLE` → `SNAP_PREPARATION` → `FINGERS_CONTACT` → `RAPID_RELEASE` → `SNAP_CONFIRMED` → `COOLDOWN`.
  - Rejects false positives (waving, slow pinches, fists, mouse clicks).
  - Optional Web Audio API high-frequency acoustic transient confirmation.
- **Human Silhouette Segmentation**:
  - MediaPipe selfie segmentation generates continuous soft alpha masks with edge feathering and temporal smoothing.
- **Background Calibration**:
  - Guided 3...2...1 countdown to capture a clean room snapshot for seamless occlusion reconstruction.
- **Cinematic WebGL2 Particle VFX**:
  - Particles sample colors directly from your clothing and skin.
  - Spatially varying noise threshold dissolve (bottom-up, radial, or wind drift).
  - Adaptive density presets: Battery (2,000), Balanced (5,000), High (8,000), and Cinematic (12,000) particles.
- **Continuous Tracking during Invisibility**:
  - Continuously tracks your position even while vanished so that particles converge to your *new* location upon reappearance.
- **Google Meet integration**:
  - Supported workflow: calibrate in Studio, switch the SAME Studio window to clean capture mode, then capture with OBS Virtual Camera.
  - Direct Chrome `getUserMedia` interception is disabled while unverified; the previous interceptor returned raw webcam video.
- **SnapShift Studio Pro**:
  - Full-screen calibration test bench with live diagnostics (FPS, latency, landmark viewer, WebRTC loopback receiver test).

---

## 3. Technology Stack

- **Frontend & UI**: React 19, TypeScript, modern responsive glassmorphism CSS, Lucide icons.
- **Extension Architecture**: Chrome Manifest V3, Service Worker, Content Scripts, MAIN-world getUserMedia interceptor, `chrome.storage.local`.
- **Computer Vision**: `@mediapipe/tasks-vision`, MediaPipe Hand Landmarker, MediaPipe Selfie Segmenter.
- **Graphics**: WebGL2 instanced/point-sprite shaders with Canvas 2D fallback.
- **Streaming**: WebRTC, `HTMLCanvasElement.captureStream()`, `MediaStreamTrack`.
- **Bundler & Tooling**: Vite 6, Vitest, TypeScript.

---

## 4. Architecture

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
            Direct Meet integration: pending             OBS Virtual Camera (recommended)
            (not connected in this release)              (same-window Studio clean output)
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for in-depth design details.

---

## 5. Getting Started

### Installation
```bash
# Clone the repository
git clone https://github.com/Rawhide-nihal/Thanos.git
cd Thanos

# Install dependencies
npm install

# Run the local testing studio
npm run dev
```

### Build & Load Chrome Extension
```bash
# Build the production extension
npm run build
```

To load into Google Chrome:
1. Open `chrome://extensions`.
2. Toggle on **Developer mode** in the upper right.
3. Click **Load unpacked** and select the generated `dist/` directory.

See [docs/INSTALLATION.md](./docs/INSTALLATION.md) for full setup instructions.

---

## 6. How to Use

1. **Open SnapShift**: Click the SnapShift icon in your Chrome toolbar or visit `studio.html`.
2. **Start Camera**: Select your preferred webcam and click **Start Camera**.
3. **Calibrate Background**: Click **Calibrate Background** and step outside the frame during the 3...2...1 countdown.
4. **Select the processed camera**: Switch Studio to **Clean Output (OBS)** in the same window, capture it in OBS, start OBS Virtual Camera, then select **OBS Virtual Camera** in Google Meet. The extension does not automatically replace the Google Meet webcam.
5. **Snap to Vanish**: Perform a physical finger snap. Your silhouette dissolves into particles while your room remains visible!
6. **Snap to Reappear**: Snap again to reconstruct your silhouette.

### Keyboard Shortcuts
- `Ctrl + Shift + D`: Manually trigger disappearance
- `Ctrl + Shift + R`: Manually trigger reappearance
- `Ctrl + Shift + 0`: Instantly reset to normal webcam feed

---

## 7. OBS Virtual Camera Mode

For the recommended Google Meet workflow:
1. Start and calibrate the camera in SnapShift Studio.
2. In the **same Studio window**, click **Clean Output (OBS)**. Press Escape to return to controls.
3. In OBS Studio, add **Window Capture** of that Studio window and crop to the video area.
4. Start **OBS Virtual Camera**.
5. Select **OBS Virtual Camera** in Google Meet video settings.

See [docs/OBS_SETUP.md](./docs/OBS_SETUP.md) for step-by-step guidance.

---

## 8. Verification & Test Results

Run the automated test suite:
```bash
npm test
```

### Test scope and status

The repository includes unit tests for hand-gesture event recognition, animation state transitions, background calibration, camera lifecycle and stream construction. These tests are **not proof** that finger snapping works on a real webcam or that Meet receives a processed video track.

The previous README and test guide marked all remote-participant tests as verified without supporting evidence. Those claims have been removed. New CI runs TypeScript checks, unit tests and a production build, but real two-participant verification must be performed on a machine with Chrome, a webcam, OBS and Google Meet.

**Known limitation:** Direct Meet injection is not currently implemented. Use the same-window OBS capture workflow. The physical snap detector and particle realism require hands-on verification and calibration.

See [docs/TESTING.md](./docs/TESTING.md) for protocol details.

---

## 9. Project Structure

```
snapshift/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── manifest.json
├── README.md
├── LICENSE
├── public/
│   ├── icons/             # 16px, 48px, 128px PNG/SVG icons
│   ├── models/            # MediaPipe hand & segmentation models
│   └── wasm/              # MediaPipe WebAssembly binaries
├── src/
│   ├── camera/            # CameraManager & device enumeration
│   ├── vision/            # Hand tracking, snap detection, segmentation
│   ├── background/        # Clean background calibration & compositing
│   ├── effects/           # ParticleEngine, WebGL2 shaders, state machine
│   ├── streaming/         # Canvas captureStream & audio preservation
│   ├── integrations/      # Google Meet & OBS Virtual Camera managers
│   ├── studio/            # SnapShift Studio Pro app
│   ├── output/            # Clean 16:9 OBS capture app
│   ├── extension/         # Service worker, content script, MAIN interceptor, popup
│   ├── state/             # Settings store & persistence
│   └── styles/            # Dark glassmorphism theme system
├── tests/
│   ├── unit/              # Snap detection, animation, background, camera tests
│   └── integration/       # WebRTC loopback test
├── docs/                  # Architecture, setup, testing, troubleshooting guides
└── scripts/               # Icon generators & post-build verification
```

---

## 10. License

MIT License. See [LICENSE](./LICENSE) for details.
