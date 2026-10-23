# OBS Studio Virtual Camera Setup

The OBS Virtual Camera mode provides 100% reliable compatibility with any video-conferencing tool (Google Meet, Zoom, Microsoft Teams, Discord, Webex).

---

## Prerequisites
- [OBS Studio](https://obsproject.com/) (version 27 or later, free and open-source)

---

## 1-Minute Setup Guide

1. **Open SnapShift Clean Output**:
   - In SnapShift Studio or the Extension Popup, click **Open Clean Output (OBS)** (or visit `output.html`).
   - A clean, frameless 16:9 window displaying only your processed camera feed will appear.

2. **Configure OBS Studio**:
   - Open OBS Studio on Windows.
   - In the **Sources** dock at the bottom, click the **`+`** icon and choose **Window Capture**.
   - Name the source `SnapShift Output` and click OK.
   - In the window dropdown, select:
     `[chrome.exe]: SnapShift Clean Output` (or `[output.html] SnapShift Clean Output`).
   - Set **Capture Method** to `Windows 10 (1903 and up)` for zero-latency GPU capture.
   - Leave "Capture Cursor" unchecked.
   - Click OK.

3. **Start OBS Virtual Camera**:
   - In the bottom-right **Controls** panel of OBS Studio, click **Start Virtual Camera**.

4. **Select OBS Camera in Google Meet**:
   - Open Google Meet (`meet.google.com`).
   - Click the 3 dots (More options) > **Settings** > **Video**.
   - Under **Camera**, select **OBS Virtual Camera**.
   - Keep your standard physical microphone selected under **Audio**.
   - Close settings.

5. **You're All Set**:
   - Perform a snap to dissolve into particles!
   - Every participant in your meeting will see your video tile disintegrate and leave your real room visible.
