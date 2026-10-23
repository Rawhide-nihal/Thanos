import { describe, it, expect, beforeEach } from 'vitest';
import { CameraManager } from '@/camera/CameraManager';

describe('CameraManager - Device and Lifecycle Management', () => {
  let cameraManager: CameraManager;

  beforeEach(() => {
    cameraManager = CameraManager.getInstance();
    cameraManager.stopCamera();
  });

  it('1. Initializes with idle streaming state', () => {
    const state = cameraManager.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.error).toBeNull();
  });

  it('2. Stops active stream and releases tracks', () => {
    cameraManager.stopCamera();
    expect(cameraManager.getState().isStreaming).toBe(false);
    expect(cameraManager.getRawStream()).toBeNull();
  });

  it('3. Subscribes to camera state updates', () => {
    let callCount = 0;
    const unsub = cameraManager.subscribe((state) => {
      callCount++;
      expect(state).toBeDefined();
    });
    expect(callCount).toBe(1);
    unsub();
  });
});
