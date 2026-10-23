# OBS Virtual Camera — supported Google Meet workflow

The current supported integration is **SnapShift Studio → same-window Clean Output → OBS Virtual Camera → Google Meet**.

**Important:** the Google Meet browser interceptor is not active in this release. Merely seeing a SnapShift badge on Meet does not mean the processed video is connected. Use OBS Virtual Camera.

## Steps

1. Open `studio.html` through the extension or `npm run dev`.
2. Start the webcam in Studio and verify that the preview displays your body.
3. Click **Calibrate BG**, step completely out of frame during the countdown, and return.
4. Use **Simulate Snap** to verify the local disappearance and reappearance. You may need to wait for the gesture cooldown.
5. Keep Studio open in the same window. Click **Clean Output (OBS)**. This overlays its controls and uses the *same* running camera, background image, and animation. **Escape** returns to controls.
6. Launch [OBS Studio](https://obsproject.com/). Add a **Window Capture** source selecting that Chrome/SnapShift Studio window. Disable cursor capture.
7. Adjust the OBS source transform to fit the video canvas (typically 16:9). Do not capture another, uncalibrated Studio window.
8. Choose **Start Virtual Camera** in OBS.
9. Open Google Meet > Settings > Video > Camera and select **OBS Virtual Camera**. Leave your normal microphone selected separately.
10. Snap while keeping the camera and Studio window running. OBS should broadcast the **processed** person-only effect. Ask someone in the meeting to confirm the actual received video.

### Controls and limitations

- Use **Escape** inside the Studio window to return from clean mode. Set the preview back to processed output before entering clean mode again.
- The background requires a stationary webcam and a clean calibration image.
- Google Meet integration, webcam frame rate, and true finger-snap recognition still require testing on your physical Windows setup.
- Do not minimize or close the Studio window during Window Capture; capture behavior depends on OS/OBS capture method.
- If OBS shows a black frame, change Window Capture method or enable browser hardware acceleration, then reacquire the window.
- If Chrome displays a dark frame instead of your room, recalibrate and confirm MediaPipe segmentation loaded.
- **Direct Chrome camera injection does not currently work** and must not be described as tested.
