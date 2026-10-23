/**
 * Virtual Camera and OBS Fallback Manager
 */

export interface OBSInstructions {
  steps: string[];
}

export class VirtualCameraManager {
  private static instance: VirtualCameraManager;

  private constructor() {}

  public static getInstance(): VirtualCameraManager {
    if (!VirtualCameraManager.instance) {
      VirtualCameraManager.instance = new VirtualCameraManager();
    }
    return VirtualCameraManager.instance;
  }

  public openCleanOutputWindow(): void {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.windows) {
      chrome.windows.create({
        url: chrome.runtime.getURL('output.html'),
        type: 'popup',
        width: 1280,
        height: 720,
        focused: true,
      });
    } else {
      window.open('/output.html', 'SnapShiftOutput', 'width=1280,height=720,menubar=no,toolbar=no,location=no');
    }
  }

  public getOBSSetupSteps(): string[] {
    return [
      '1. Open SnapShift Studio or click "Open Clean Output Window".',
      '2. Launch OBS Studio on Windows.',
      '3. Under "Sources", click + and add "Window Capture".',
      '4. Select the window: "[output.html] SnapShift Clean Output".',
      '5. Set Capture Method to "Windows 10 (1903 and up)" for 60fps hardware capture.',
      '6. Click "Start Virtual Camera" in the bottom right Controls panel of OBS.',
      '7. Open Google Meet (meet.google.com) and go to Settings > Video > Camera.',
      '8. Select "OBS Virtual Camera". Keep your regular physical microphone selected.',
      '9. Perform your snap in SnapShift! Google Meet will broadcast your cinematic vanishing acts to everyone.',
    ];
  }
}
