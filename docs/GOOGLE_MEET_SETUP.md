# Google Meet integration (accurate status)

SnapShift has a real webcam processing engine, but the previous MAIN-world `getUserMedia` interceptor returned the **original camera video track** instead of a processed track. It never delivered the effect to a remote participant.

To avoid breaking Meet or misleading users, direct interception has been **disabled** pending a properly tested processed-video pipeline.

## Current recommended mode — OBS Virtual Camera

1. Open SnapShift Studio.
2. Start the webcam and calibrate an empty background.
3. Test disappearance and reappearance in Studio.
4. Enable **Clean Output (OBS)** in the **same Studio window**.
5. Capture that window in OBS Studio, then start OBS Virtual Camera.
6. In Google Meet's video settings, select **OBS Virtual Camera**, not the raw webcam.
7. Verify in a second participant's view that the effect is visible.
8. Use the normal microphone in Google Meet; it is separate from the video-only OBS source.

See [OBS_SETUP.md](./OBS_SETUP.md).

## Direct integration roadmap

A future direct integration must supply the fully processed MediaStream video track to Meet, preserve microphone audio, handle track re-acquisition and Meet updates, and be verified from a separate receiving peer. The extension badge alone is not proof of integration.
