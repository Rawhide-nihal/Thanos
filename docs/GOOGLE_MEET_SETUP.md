# Google Meet Integration Guide

SnapShift provides two operating modes for Google Meet.

---

## Mode A — Direct Chrome Extension Integration

The Chrome Extension automatically injects into Google Meet (`https://meet.google.com/*`) to intercept outgoing webcam video.

### Step-by-Step Instructions:

1. **Start & Calibrate SnapShift**:
   - Click the SnapShift extension icon in Chrome or open SnapShift Studio (`studio.html`).
   - Click **Start Camera**.
   - Click **Calibrate Background** and step outside the frame during the 3...2...1 countdown.
   - Test a snap to ensure you disintegrate smoothly and the background remains visible.

2. **Join Google Meet**:
   - Open [meet.google.com](https://meet.google.com).
   - Look for the small **SnapShift (Ready)** badge floating in the bottom-left corner of the Meet window.
   - Join your meeting with camera turned on.

3. **Perform the Snap**:
   - Raise your hand in front of your camera and perform a natural finger snap.
   - Your outgoing participant tile will disintegrate into particles and vanish into the background.
   - Your microphone remains 100% functional. Other meeting participants continue to hear you speak.
   - Other meeting participants' tiles remain completely untouched.

4. **Reappear**:
   - Snap again in front of the camera, or press `Ctrl + Shift + R` (or `Ctrl + Shift + 0` to reset).
   - Your silhouette will reconstruct with converging particles and restore ordinary live video.

> **Important Note:** If you toggle SnapShift on or off while already inside an active Google Meet room, Google Meet may cache its active media track. Simply toggle your camera off and back on in the Google Meet bottom toolbar, or refresh the Meet tab.

---

## Mode B — OBS Studio Virtual Camera (Recommended Universal Fallback)

If Google Meet updates its internal pipeline or security policies block direct stream patching, OBS Virtual Camera provides an ultra-reliable, hardware-accelerated 60 FPS fallback.

See [OBS_SETUP.md](./OBS_SETUP.md) for full instructions.
