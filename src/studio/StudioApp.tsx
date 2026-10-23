import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Play,
  Square,
  Sparkles,
  RotateCcw,
  ExternalLink,
  Sliders,
  Activity,
  Layers,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Tv,
} from 'lucide-react';
import { CameraManager, CameraDeviceInfo } from '@/camera/CameraManager';
import { VideoOutputManager, PreviewDisplayMode } from '@/streaming/VideoOutputManager';
import { BackgroundManager, BackgroundState } from '@/background/BackgroundManager';
import { AnimationController, AnimationMetrics } from '@/effects/animation/AnimationController';
import { VisionEngine, VisionDiagnostics } from '@/vision/VisionEngine';
import { SettingsStore, SnapShiftSettings, PerformancePreset } from '@/state/settingsStore';
import { VirtualCameraManager } from '@/integrations/virtualCamera/VirtualCameraManager';

export const StudioApp: React.FC = () => {
  const cameraManager = CameraManager.getInstance();
  const outputManager = VideoOutputManager.getInstance();
  const bgManager = BackgroundManager.getInstance();
  const animController = AnimationController.getInstance();
  const visionEngine = VisionEngine.getInstance();
  const settingsStore = SettingsStore.getInstance();
  const virtualCameraManager = VirtualCameraManager.getInstance();

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cleanOutputRef = useRef<HTMLCanvasElement | null>(null);
  const [isCleanOutput, setIsCleanOutput] = useState(false);

  // Local state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [devices, setDevices] = useState<CameraDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [bgState, setBgState] = useState<BackgroundState>(bgManager.getState());
  const [animMetrics, setAnimMetrics] = useState<AnimationMetrics>(animController.getMetrics());
  const [settings, setSettings] = useState<SnapShiftSettings>(settingsStore.getSettings());
  const [visionDiag, setVisionDiag] = useState<VisionDiagnostics>(visionEngine.getDiagnostics());
  const [previewMode, setPreviewMode] = useState<PreviewDisplayMode>('processed');
  const [fps, setFps] = useState(30);
  const [webrtcConnected, setWebrtcConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'controls' | 'settings' | 'obs' | 'diagnostics'>('controls');

  useEffect(() => {
    // 1. Initialize vision models
    visionEngine.initialize().catch((err) => {
      console.warn('Vision engine initial load notice:', err);
    });

    // 2. Discover cameras
    cameraManager.refreshDeviceList().then((devs) => {
      setDevices(devs);
      if (devs.length > 0 && !selectedDevice) {
        setSelectedDevice(devs[0].deviceId);
      }
    });

    // 3. Subscriptions
    const unsubBg = bgManager.subscribe(setBgState);
    const unsubAnim = animController.subscribe(setAnimMetrics);
    const unsubSettings = settingsStore.subscribe(setSettings);
    const unsubCam = cameraManager.subscribe((cs) => {
      setIsCameraActive(cs.isStreaming);
      setSelectedDevice(cs.selectedDeviceId);
    });

    // 4. Connect output canvas to preview view
    const renderCanvas = outputManager.getOutputCanvas();
    let animId: number;

    const copyLoop = () => {
      for (const displayCanvas of [previewCanvasRef.current, cleanOutputRef.current]) {
        if (!displayCanvas) continue;
        if (displayCanvas.width !== renderCanvas.width || displayCanvas.height !== renderCanvas.height) {
          displayCanvas.width = renderCanvas.width;
          displayCanvas.height = renderCanvas.height;
        }
        displayCanvas.getContext('2d')?.drawImage(renderCanvas, 0, 0);
      }
      setFps(outputManager.getFPS());
      setVisionDiag(visionEngine.getDiagnostics());
      animId = requestAnimationFrame(copyLoop);
    };

    animId = requestAnimationFrame(copyLoop);

    return () => {
      unsubBg();
      unsubAnim();
      unsubSettings();
      unsubCam();
      cancelAnimationFrame(animId);
    };
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCleanOutput(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
    const handleCommand = (message: { type?: string; command?: string }) => {
      if (message.type !== 'SNAPSHIFT_KEYBOARD_COMMAND') return;
      const video = cameraManager.getVideoElement() || undefined;
      if (message.command === 'disappear') animController.triggerDisappear(video);
      if (message.command === 'reappear') animController.triggerReappear(video);
      if (message.command === 'reset') animController.reset();
    };
    chrome.runtime.onMessage.addListener(handleCommand);
    return () => chrome.runtime.onMessage.removeListener(handleCommand);
  }, []);

  const enterCleanOutput = () => {
    // OBS must capture the SAME running page, otherwise camera and calibration state are lost.
    if (!isCameraActive) {
      console.warn('SnapShift: Start your camera before opening clean output.');
      return;
    }
    if (!bgState.hasCleanBackground) {
      console.warn('SnapShift: Calibrate the background before opening clean output.');
      return;
    }
    outputManager.setPreviewMode('processed');
    setPreviewMode('processed');
    setIsCleanOutput(true);
  };

  const handleToggleCamera = async () => {
    if (isCameraActive) {
      cameraManager.stopCamera();
      outputManager.stopRenderLoop();
    } else {
      try {
        await cameraManager.startCamera(selectedDevice, settings.targetResolution);
        outputManager.startRenderLoop();
      } catch (e) {
        console.error('Failed to start camera:', e);
      }
    }
  };

  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const devId = e.target.value;
    setSelectedDevice(devId);
    if (isCameraActive) {
      await cameraManager.startCamera(devId, settings.targetResolution);
    }
  };

  const handleCalibrateBackground = () => {
    const video = cameraManager.getVideoElement();
    if (!video) return;
    bgManager.startCalibration(video, (success) => {
      if (success) {
        console.log('Background successfully calibrated!');
      }
    });
  };

  const handlePreviewModeChange = (mode: PreviewDisplayMode) => {
    setPreviewMode(mode);
    outputManager.setPreviewMode(mode);
  };

  // WebRTC Loopback Test (Self-contained receiver verification)
  const runWebRtcLoopback = async () => {
    try {
      const stream = outputManager.getProcessedStream();
      const pc1 = new RTCPeerConnection();
      const pc2 = new RTCPeerConnection();

      pc1.onicecandidate = (e) => e.candidate && pc2.addIceCandidate(e.candidate);
      pc2.onicecandidate = (e) => e.candidate && pc1.addIceCandidate(e.candidate);

      pc2.ontrack = (e) => {
        if (e.streams[0]) {
          setWebrtcConnected(true);
          console.log('SnapShift: WebRTC Loopback Peer successfully received processed video track!');
        }
      };

      for (const track of stream.getTracks()) {
        pc1.addTrack(track, stream);
      }

      const offer = await pc1.createOffer();
      await pc1.setLocalDescription(offer);
      await pc2.setRemoteDescription(offer);

      const answer = await pc2.createAnswer();
      await pc2.setLocalDescription(answer);
      await pc1.setRemoteDescription(answer);
    } catch (e) {
      console.error('WebRTC loopback test failed:', e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>
      {/* Top Navigation Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(15, 12, 32, 0.9)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #38bdf8 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(56, 189, 248, 0.4)',
            }}
          >
            <Zap size={20} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px', color: '#ffffff' }}>
                SnapShift
              </span>
              <span
                style={{
                  fontSize: '11px',
                  background: 'rgba(139, 92, 246, 0.2)',
                  color: '#a78bfa',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                  fontWeight: 600,
                }}
              >
                STUDIO PRO
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Snap. Vanish. Reappear.</div>
          </div>
        </div>

        {/* Global Live Status Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className={`status-pill ${isCameraActive ? 'status-pill-success' : 'status-pill-warning'}`}>
            <span
              className="pulse-dot"
              style={{ background: isCameraActive ? 'var(--status-success)' : 'var(--status-warning)' }}
            />
            {isCameraActive ? 'Camera Live' : 'Camera Idle'}
          </div>

          <div
            className={`status-pill ${
              bgState.calibrationState === 'CALIBRATED'
                ? 'status-pill-success'
                : bgState.calibrationState === 'CAPTURING'
                ? 'status-pill-warning'
                : 'status-pill-info'
            }`}
          >
            {bgState.calibrationState === 'CALIBRATED' ? (
              <CheckCircle2 size={13} />
            ) : (
              <AlertTriangle size={13} />
            )}
            {bgState.calibrationState === 'CALIBRATED'
              ? 'Background Calibrated'
              : bgState.calibrationState === 'CAPTURING'
              ? `Capturing (${bgState.countdownSeconds}s)`
              : 'Background Not Calibrated'}
          </div>

          <div className="status-pill status-pill-info">
            <Radio size={13} />
            {animMetrics.state}
          </div>

          <button
            className="btn btn-secondary"
            onClick={enterCleanOutput}
            title="Switch this Studio window into clean OBS capture mode (Esc to exit)"
          >
            <Tv size={15} />
            Clean Output (OBS)
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Central Viewport */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            position: 'relative',
          }}
        >
          {/* Video Preview Container */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '960px',
              aspectRatio: '16 / 9',
              background: '#04030a',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 0 1px var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <canvas
              ref={previewCanvasRef}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: isCameraActive ? 'block' : 'none',
              }}
            />

            {!isCameraActive && (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <Camera size={52} color="#64748b" style={{ marginBottom: '14px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>
                  Camera is Inactive
                </h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '340px', marginBottom: '18px' }}>
                  Start your webcam to test real-time gesture recognition, background calibration, and the cinematic
                  disappearance particles.
                </p>
                <button className="btn btn-primary" onClick={handleToggleCamera}>
                  <Play size={16} />
                  Start Camera
                </button>
              </div>
            )}

            {/* Countdown Overlay during Background Calibration */}
            {bgState.calibrationState === 'CAPTURING' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(15, 12, 32, 0.75)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 20,
                }}
              >
                <div style={{ fontSize: '16px', color: '#38bdf8', fontWeight: 600, marginBottom: '10px' }}>
                  STEP OUT OF THE CAMERA FRAME
                </div>
                <div
                  style={{
                    fontSize: '92px',
                    fontWeight: 900,
                    color: '#ffffff',
                    lineHeight: 1,
                    textShadow: '0 0 30px #8b5cf6',
                  }}
                >
                  {bgState.countdownSeconds}
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '12px' }}>
                  Capturing clean background in seconds...
                </div>
              </div>
            )}

            {/* Gesture Detection Sparkle Badge */}
            {visionDiag.handDiagnostics.currentState === 'SNAP_CONFIRMED' && (
              <div
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'linear-gradient(135deg, #38bdf8 0%, #8b5cf6 100%)',
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: '#ffffff',
                  boxShadow: '0 0 25px rgba(56, 189, 248, 0.8)',
                  animation: 'pulseAnim 0.5s',
                }}
              >
                <Sparkles size={16} />
                SNAP DETECTED!
              </div>
            )}
          </div>

          {/* View Mode Switcher Pills */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              marginTop: '16px',
              background: 'rgba(19, 15, 38, 0.8)',
              padding: '4px',
              borderRadius: '9999px',
              border: '1px solid var(--border-color)',
            }}
          >
            {(
              [
                { id: 'processed', label: 'Processed Output' },
                { id: 'original', label: 'Raw Camera' },
                { id: 'mask', label: 'Person Mask' },
                { id: 'background', label: 'Clean Background' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => handlePreviewModeChange(item.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: previewMode === item.id ? 'var(--accent-violet)' : 'transparent',
                  color: previewMode === item.id ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.2s ease',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right Side Control Panel */}
        <aside
          style={{
            width: '380px',
            maxWidth: '100%',
            flexShrink: 0,
            minWidth: 0,
            overflow: 'hidden',
            borderLeft: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Panel Tabs */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-color)',
              background: 'rgba(10, 8, 21, 0.6)',
            }}
          >
            {(
              [
                { id: 'controls', label: 'Controls', icon: Sliders },
                { id: 'settings', label: 'Effects', icon: Sparkles },
                { id: 'obs', label: 'OBS Guide', icon: Tv },
                { id: 'diagnostics', label: 'Metrics', icon: Activity },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '12px 6px',
                    border: 'none',
                    background: activeTab === tab.id ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                    borderBottom: activeTab === tab.id ? '2px solid var(--accent-violet)' : '2px solid transparent',
                    color: activeTab === tab.id ? '#ffffff' : 'var(--text-muted)',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', padding: '20px' }}>
            {activeTab === 'controls' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Camera Source Selector */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
                    CAMERA SOURCE
                  </label>
                  <select
                    className="select-input"
                    value={selectedDevice}
                    onChange={handleDeviceChange}
                    disabled={!devices.length}
                  >
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Primary Action Buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                  <button
                    className={`btn ${isCameraActive ? 'btn-danger' : 'btn-primary'}`}
                    onClick={handleToggleCamera}
                  >
                    {isCameraActive ? <Square size={16} /> : <Play size={16} />}
                    {isCameraActive ? 'Stop Camera' : 'Start Camera'}
                  </button>

                  <button
                    className="btn btn-cyan"
                    onClick={handleCalibrateBackground}
                    disabled={!isCameraActive || bgState.calibrationState === 'CAPTURING'}
                  >
                    <Layers size={16} />
                    {bgState.calibrationState === 'CALIBRATED' ? 'Recalibrate' : 'Calibrate BG'}
                  </button>
                </div>

                {/* Manual Effect Testing */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'rgba(26, 21, 51, 0.5)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    Manual Effect Triggers
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginBottom: '14px' }}>
                    Test animations directly or press keyboard shortcuts.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginBottom: '10px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => animController.triggerDisappear(cameraManager.getVideoElement() || undefined)}
                      disabled={animMetrics.state !== 'VISIBLE' || !isCameraActive}
                      title="Disappear (Ctrl+Shift+D)"
                    >
                      Disappear
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => animController.triggerReappear(cameraManager.getVideoElement() || undefined)}
                      disabled={animMetrics.state !== 'INVISIBLE' || !isCameraActive}
                      title="Reappear (Ctrl+Shift+R)"
                    >
                      Reappear
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => visionEngine.triggerManualSnap()}
                    >
                      <Sparkles size={14} />
                      Simulate Snap
                    </button>

                    <button
                      className="btn btn-secondary"
                      onClick={() => animController.reset()}
                      title="Reset effect (Ctrl+Shift+0)"
                    >
                      <RotateCcw size={14} />
                      Reset
                    </button>
                  </div>
                </div>

                {/* Recognition Mode Selector */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
                    GESTURE RECOGNITION MODE
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { id: 'visual', title: 'Visual Snap Only', desc: 'Real-time 21 hand landmarks temporal velocity' },
                      { id: 'visual_audio', title: 'Visual + Audio Confirmation', desc: 'Correlates hand motion with acoustic transient' },
                      { id: 'manual', title: 'Manual Trigger Only', desc: 'Buttons & shortcuts only (disables auto snap)' },
                    ].map((mode) => (
                      <label
                        key={mode.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: settings.detectionMode === mode.id ? 'rgba(139, 92, 246, 0.15)' : 'rgba(15, 12, 32, 0.4)',
                          border: `1px solid ${settings.detectionMode === mode.id ? 'var(--accent-violet)' : 'var(--border-color)'}`,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name="detectionMode"
                          checked={settings.detectionMode === mode.id}
                          onChange={() => settingsStore.updateSettings({ detectionMode: mode.id as any })}
                          style={{ marginTop: '3px' }}
                        />
                        <div>
                          <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>{mode.title}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{mode.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* WebRTC Loopback Test Button */}
                <div style={{ marginTop: '8px' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={runWebRtcLoopback}
                    style={{ width: '100%', fontSize: '12px' }}
                  >
                    <Tv size={14} />
                    Run WebRTC Peer Receiver Test {webrtcConnected ? '(✓ Connected)' : ''}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Particle Preset */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
                    PARTICLE DENSITY PRESET
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {(['battery', 'balanced', 'high', 'cinematic'] as PerformancePreset[]).map((preset) => (
                      <button
                        key={preset}
                        onClick={() => settingsStore.updateSettings({ particleDensityPreset: preset })}
                        style={{
                          padding: '10px',
                          borderRadius: '8px',
                          border: `1px solid ${settings.particleDensityPreset === preset ? 'var(--accent-violet)' : 'var(--border-color)'}`,
                          background: settings.particleDensityPreset === preset ? 'rgba(139, 92, 246, 0.2)' : 'rgba(15, 12, 32, 0.5)',
                          color: settings.particleDensityPreset === preset ? '#ffffff' : '#94a3b8',
                          fontSize: '12px',
                          fontWeight: 600,
                          textTransform: 'capitalize',
                          cursor: 'pointer',
                        }}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Animation Duration Slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>ANIMATION DURATION</label>
                    <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 600 }}>
                      {settings.animationDurationSec.toFixed(1)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="3.5"
                    step="0.1"
                    value={settings.animationDurationSec}
                    onChange={(e) => settingsStore.updateSettings({ animationDurationSec: parseFloat(e.target.value) })}
                    className="slider-input"
                  />
                </div>

                {/* Snap Sensitivity Slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>SNAP SENSITIVITY</label>
                    <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 600 }}>
                      {Math.round(settings.sensitivity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="0.95"
                    step="0.05"
                    value={settings.sensitivity}
                    onChange={(e) => settingsStore.updateSettings({ sensitivity: parseFloat(e.target.value) })}
                    className="slider-input"
                  />
                </div>

                {/* Dissolve Direction */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
                    DISSOLVE DIRECTION
                  </label>
                  <select
                    className="select-input"
                    value={settings.dissolveDirection}
                    onChange={(e) => settingsStore.updateSettings({ dissolveDirection: e.target.value as any })}
                  >
                    <option value="bottom_up">Bottom to Top (Classic)</option>
                    <option value="radial_out">Radial Outwards</option>
                    <option value="wind_right">Wind Right Drift</option>
                  </select>
                </div>

                {/* Show Hand Landmarks in Preview */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settings.showLandmarks}
                    onChange={(e) => settingsStore.updateSettings({ showLandmarks: e.target.checked })}
                  />
                  <span style={{ fontSize: '13px', color: '#f8fafc' }}>Show hand tracking landmarks in preview</span>
                </label>
              </div>
            )}

            {activeTab === 'obs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                  OBS Studio Virtual Camera Guide
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                  The most reliable, universal fallback for Google Meet, Zoom, Microsoft Teams, and Discord.
                </p>

                <button
                  className="btn btn-cyan"
                  onClick={enterCleanOutput}
                  style={{ width: '100%' }}
                >
                  <ExternalLink size={15} />
                  Switch to Clean OBS Output (Esc to return)
                </button>

                <div
                  style={{
                    background: 'rgba(15, 12, 32, 0.6)',
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <ol style={{ paddingLeft: '16px', fontSize: '12px', color: '#cbd5e1', lineHeight: 1.8 }}>
                    {virtualCameraManager.getOBSSetupSteps().map((step, idx) => (
                      <li key={idx} style={{ marginBottom: '6px' }}>
                        {step.slice(3)}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {activeTab === 'diagnostics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>System Diagnostics</div>

                {[
                  { label: 'Output Frame Rate', val: `${fps} FPS` },
                  { label: 'Vision Inference Latency', val: `${visionDiag.inferenceLatencyMs} ms` },
                  { label: 'Hand Model Ready', val: visionDiag.handLandmarkerReady ? 'YES (Local)' : 'NO' },
                  { label: 'Segmentation Model Ready', val: visionDiag.segmenterReady ? 'YES (Local)' : 'NO' },
                  { label: 'Current Gesture State', val: visionDiag.handDiagnostics.currentState },
                  { label: 'Handedness', val: visionDiag.handDiagnostics.handedness },
                  { label: 'Normalized Finger Distance', val: visionDiag.handDiagnostics.thumbMiddleDistanceNorm },
                  { label: 'Release Velocity', val: `${visionDiag.handDiagnostics.releaseVelocity}/s` },
                  { label: 'Total Snaps Confirmed', val: visionDiag.handDiagnostics.snapCount },
                  { label: 'Active Particle Count', val: animMetrics.activeParticles },
                  { label: 'Audio Transient Active', val: visionDiag.audioActive ? 'Active' : 'Off' },
                ].map((m, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'rgba(15, 12, 32, 0.5)',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ color: '#94a3b8' }}>{m.label}</span>
                    <span style={{ color: '#38bdf8', fontWeight: 600, fontFamily: 'monospace' }}>{m.val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
      {isCleanOutput && (
        <div
          aria-label="SnapShift clean camera output for OBS Window Capture"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: '#000',
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
          }}
        >
          <canvas
            ref={cleanOutputRef}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      )}
    </div>
  );
};
