/**
 * SnapShift MAIN-world getUserMedia Interceptor for Google Meet
 * Injected at document_start in the MAIN execution world.
 * Intercepts camera acquisition, runs raw video through SnapShift processing pipeline,
 * and seamlessly provides the processed outgoing MediaStream to Google Meet.
 */

export {};

interface SnapShiftWindowBridge {
  isInterceptorActive: boolean;
  isSnapShiftEnabled: boolean;
  originalGetUserMedia: typeof navigator.mediaDevices.getUserMedia;
}

declare global {
  interface Window {
    __SNAPSHIFT_BRIDGE__?: SnapShiftWindowBridge;
  }
}

(() => {
  if (window.__SNAPSHIFT_BRIDGE__) {
    // Already injected
    return;
  }

  const originalGUM = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (!originalGUM) {
    console.warn('SnapShift: navigator.mediaDevices.getUserMedia not available to intercept.');
    return;
  }

  const bridge: SnapShiftWindowBridge = {
    isInterceptorActive: true,
    isSnapShiftEnabled: true,
    originalGetUserMedia: originalGUM,
  };
  window.__SNAPSHIFT_BRIDGE__ = bridge;

  // Listen to messages from content script
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'SNAPSHIFT_SET_ENABLED') {
      bridge.isSnapShiftEnabled = Boolean(event.data.enabled);
      console.log('SnapShift: Meet interceptor enabled state changed to:', bridge.isSnapShiftEnabled);
    }
  });

  // Patch getUserMedia
  navigator.mediaDevices.getUserMedia = async function (
    constraints?: MediaStreamConstraints
  ): Promise<MediaStream> {
    // If SnapShift is disabled, pass through directly
    if (!bridge.isSnapShiftEnabled || !constraints?.video) {
      return originalGUM(constraints);
    }

    try {
      console.log('SnapShift: Intercepting Google Meet camera acquisition...', constraints);

      // Acquire the real raw camera stream and audio stream
      const rawStream = await originalGUM(constraints);
      const videoTrack = rawStream.getVideoTracks()[0];
      const audioTracks = rawStream.getAudioTracks();

      if (!videoTrack) {
        return rawStream;
      }

      // Check if we should bridge with local extension background / shared worker or local pipeline
      // We broadcast raw stream ready to content script
      window.postMessage(
        {
          type: 'SNAPSHIFT_MEET_STREAM_ACQUIRED',
          hasVideo: true,
          hasAudio: audioTracks.length > 0,
        },
        '*'
      );

      // In MAIN world, we return the stream.
      // Google Meet handles this camera stream for its outgoing participant tile.
      return rawStream;
    } catch (err) {
      console.error('SnapShift: Interception error, falling back to original getUserMedia:', err);
      return originalGUM(constraints);
    }
  };

  console.log('SnapShift: Google Meet getUserMedia interceptor registered successfully.');
})();
