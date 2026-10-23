import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BackgroundManager } from '@/background/BackgroundManager';

describe('BackgroundManager - Calibration Lifecycle', () => {
  let bgManager: BackgroundManager;

  beforeEach(() => {
    bgManager = BackgroundManager.getInstance();
    bgManager.resetCalibration();
  });

  it('1. Initializes in NOT_CALIBRATED state', () => {
    const state = bgManager.getState();
    expect(state.calibrationState).toBe('NOT_CALIBRATED');
    expect(state.hasCleanBackground).toBe(false);
  });

  it('2. Enters CAPTURING state with countdown', () => {
    vi.useFakeTimers();
    const mockVideo = {
      readyState: 4,
      videoWidth: 1280,
      videoHeight: 720,
    } as unknown as HTMLVideoElement;

    bgManager.startCalibration(mockVideo);
    let state = bgManager.getState();
    expect(state.calibrationState).toBe('CAPTURING');
    expect(state.countdownSeconds).toBe(3);

    // Advance 1 second
    vi.advanceTimersByTime(1000);
    state = bgManager.getState();
    expect(state.countdownSeconds).toBe(2);

    // Advance 2 more seconds -> capture occurs!
    vi.advanceTimersByTime(2000);
    state = bgManager.getState();
    expect(state.calibrationState).toBe('CALIBRATED');
    expect(state.hasCleanBackground).toBe(true);

    vi.useRealTimers();
  });

  it('3. Can cancel an ongoing calibration', () => {
    vi.useFakeTimers();
    const mockVideo = {} as HTMLVideoElement;
    bgManager.startCalibration(mockVideo);
    expect(bgManager.getState().calibrationState).toBe('CAPTURING');

    bgManager.cancelCalibration();
    expect(bgManager.getState().calibrationState).toBe('NOT_CALIBRATED');

    vi.useRealTimers();
  });

  it('4. Resets cleanly and clears background canvas', () => {
    bgManager.resetCalibration();
    expect(bgManager.getState().hasCleanBackground).toBe(false);
    expect(bgManager.getCleanBackgroundCanvas()).toBeNull();
  });
});
