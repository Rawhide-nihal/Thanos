import { describe, it, expect } from 'vitest';
import { VideoOutputManager } from '@/streaming/VideoOutputManager';

describe('VideoOutputManager - Processed MediaStream & Loopback Verification', () => {
  it('1. Provides valid processed MediaStream with active video track', () => {
    const outputManager = VideoOutputManager.getInstance();
    const stream = outputManager.getProcessedStream(30);

    expect(stream).toBeDefined();
    expect(stream.getVideoTracks().length).toBeGreaterThanOrEqual(1);
    const videoTrack = stream.getVideoTracks()[0];
    expect(videoTrack.kind).toBe('video');
  });

  it('2. Preserves microphone audio track when combining streams', () => {
    const outputManager = VideoOutputManager.getInstance();

    // Mock an audio track representing real microphone
    const mockAudioTrack = {
      id: 'mock-mic-track',
      kind: 'audio',
      readyState: 'live',
      stop: () => {},
    } as unknown as MediaStreamTrack;

    const combined = outputManager.getCombinedStreamWithAudio(mockAudioTrack);
    expect(combined.getVideoTracks().length).toBe(1);
    expect(combined.getAudioTracks().length).toBe(1);
    expect(combined.getAudioTracks()[0].id).toBe('mock-mic-track');
  });
});
