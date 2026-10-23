# SnapShift Troubleshooting Guide

## 1. Camera Issues

### "Camera is already in use by another application"
- **Cause**: Windows allows only one application to hold an exclusive direct handle on certain USB webcams.
- **Solution**: Close any background apps holding the webcam (Zoom, Teams, Skype, or existing Chrome tabs). If using OBS Virtual Camera, start OBS after starting SnapShift.

### "Camera permission was denied"
- **Solution**:
  1. In Chrome, click the icon to the left of the URL bar (Site Settings).
  2. Set **Camera** to **Allow**.
  3. Reload the page.

---

## 2. Finger-Snap Detection

### Snap is not triggering
- **Ensure hand is in camera frame**: Hand landmarker needs to track wrist and all 5 fingers.
- **Adjust sensitivity**: Open SnapShift Studio > Effects > increase **Snap Sensitivity** (e.g. 75% - 85%).
- **Lighting**: Ensure sufficient lighting on hands to avoid motion blur.
- **Microphone**: If using **Visual + Audio Confirmation**, ensure microphone permission is granted and snap makes an audible click. Alternatively, switch to **Visual Snap Only**.

### Unwanted triggers (False positives)
- Lower **Snap Sensitivity** to 50% - 60%.
- Ensure you are not performing rapid thumb-to-middle pinching motions close to the lens.
- Switch to **Manual Trigger Only** if in an environment with high gesture noise.

---

## 3. Background Calibration

### Artifacts or halo when invisible
- **Step completely out of frame**: When clicking **Calibrate Clean Background**, step fully out of the camera view during the 3...2...1 countdown.
- **Stationary camera**: Ensure webcam does not shift or move after calibration. If you move your laptop or webcam, click **Recalibrate**.

---

## 4. Google Meet

### Processed video not showing in Meet
- **Extension Mode**: After enabling SnapShift, toggle your camera off and back on in the bottom toolbar of Google Meet.
- **OBS Mode**: Select **OBS Virtual Camera** in Google Meet Video Settings, and ensure OBS has "Start Virtual Camera" activated.
