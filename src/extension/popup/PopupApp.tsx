import React, { useEffect, useState } from 'react';
import {
  Zap,
  Play,
  Square,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Tv,
} from 'lucide-react';
import { CameraManager, CameraDeviceInfo } from '@/camera/CameraManager';
import { BackgroundManager, BackgroundState } from '@/background/BackgroundManager';
import { AnimationController, AnimationMetrics } from '@/effects/animation/AnimationController';
import { VisionEngine, VisionDiagnostics } from '@/vision/VisionEngine';
import { SettingsStore, SnapShiftSettings } from '@/state/settingsStore';
import { MeetIntegrationManager, MeetStatus } from '@/integrations/googleMeet/MeetIntegrationManager';

export const PopupApp: React.FC = () => {
  const cameraManager = CameraManager.getInstance();
  const bgManager = BackgroundManager.getInstance();
  const animController = AnimationController.getInstance();
  const visionEngine = VisionEngine.getInstance();
  const settingsStore = SettingsStore.getInstance();
  const meetManager = MeetIntegrationManager.getInstance();

  const [settings, setSettings] = useState<SnapShiftSettings>(settingsStore.getSettings());
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [devices, setDevices] = useState<CameraDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [bgState, setBgState] = useState<BackgroundState>(bgManager.getState());
  const [, setAnimMetrics] = useState<AnimationMetrics>(animController.getMetrics());
  const [visionDiag, setVisionDiag] = useState<VisionDiagnostics>(visionEngine.getDiagnostics());
  const [meetStatus, setMeetStatus] = useState<MeetStatus>({ isMeetTabOpen: false, tabUrl: null, interceptorReady: false });

  useEffect(() => {
    // Check devices & Meet status
    cameraManager.refreshDeviceList().then((devs) => {
      setDevices(devs);
      if (devs.length > 0 && !selectedDevice) {
        setSelectedDevice(devs[0].deviceId);
      }
    });

    meetManager.checkMeetStatus().then(setMeetStatus);

    const unsubSettings = settingsStore.subscribe(setSettings);
    const unsubBg = bgManager.subscribe(setBgState);
    const unsubAnim = animController.subscribe(setAnimMetrics);
    const unsubCam = cameraManager.subscribe((cs) => {
      setIsCameraActive(cs.isStreaming);
      setSelectedDevice(cs.selectedDeviceId);
    });

    const interval = setInterval(() => {
      setVisionDiag(visionEngine.getDiagnostics());
    }, 500);

    return () => {
      unsubSettings();
      unsubBg();
      unsubAnim();
      unsubCam();
      clearInterval(interval);
    };
  }, []);

  const handleToggleEnable = () => {
    const next = !settings.enabled;
    settingsStore.updateSettings({ enabled: next });
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
        for (const t of tabs) {
          if (t.id) {
            chrome.tabs.sendMessage(t.id, { type: 'SNAPSHIFT_SET_ENABLED', enabled: next }).catch(() => {});
          }
        }
      });
    }
  };

  const handleToggleCamera = async () => {
    if (isCameraActive) {
      cameraManager.stopCamera();
    } else {
      await cameraManager.startCamera(selectedDevice, settings.targetResolution);
    }
  };

  const openStudio = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') });
    } else {
      window.open('/studio.html', '_blank');
    }
  };

  const openOutput = () => {
    if (typeof chrome !== 'undefined' && chrome.windows) {
      chrome.windows.create({
        url: chrome.runtime.getURL('studio.html'),
        type: 'popup',
        width: 1280,
        height: 720,
      });
    } else {
      window.open('/studio.html', '_blank');
    }
  };

  return (
    <div
      style={{
        width: '360px',
        background: 'var(--bg-primary)',
        color: '#f8fafc',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #38bdf8 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.4)',
            }}
          >
            <Zap size={16} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.2px' }}>SnapShift</div>
            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Snap. Vanish. Reappear.</div>
          </div>
        </div>

        {/* Master Enable Toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={handleToggleEnable}
            style={{ accentColor: 'var(--accent-violet)', width: '16px', height: '16px' }}
          />
          <span style={{ fontSize: '12px', fontWeight: 600, color: settings.enabled ? '#38bdf8' : '#64748b' }}>
            {settings.enabled ? 'ON' : 'OFF'}
          </span>
        </label>
      </div>

      {/* Status Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px',
          background: 'rgba(26, 21, 51, 0.4)',
          padding: '10px',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
          <span
            className="pulse-dot"
            style={{ background: isCameraActive ? 'var(--status-success)' : 'var(--status-warning)' }}
          />
          <span>{isCameraActive ? 'Camera Active' : 'Camera Off'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
          {visionDiag.isModelsReady ? (
            <CheckCircle2 size={12} color="#10b981" />
          ) : (
            <AlertTriangle size={12} color="#f59e0b" />
          )}
          <span>{visionDiag.isModelsReady ? 'AI Vision Ready' : 'Loading Vision'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
          {bgState.calibrationState === 'CALIBRATED' ? (
            <CheckCircle2 size={12} color="#10b981" />
          ) : (
            <AlertTriangle size={12} color="#f59e0b" />
          )}
          <span>{bgState.calibrationState === 'CALIBRATED' ? 'BG Calibrated' : 'BG Pending'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
          {meetStatus.isMeetTabOpen ? (
            <CheckCircle2 size={12} color="#10b981" />
          ) : (
            <AlertTriangle size={12} color="#94a3b8" />
          )}
          <span>{meetStatus.isMeetTabOpen ? 'Meet tab (use OBS)' : 'No Meet Tab'}</span>
        </div>
      </div>

      {/* Camera Dropdown */}
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
          CAMERA
        </label>
        <select
          className="select-input"
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          disabled={!devices.length}
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <button
          className={`btn ${isCameraActive ? 'btn-danger' : 'btn-primary'}`}
          onClick={handleToggleCamera}
          style={{ fontSize: '12px', padding: '8px' }}
        >
          {isCameraActive ? <Square size={14} /> : <Play size={14} />}
          {isCameraActive ? 'Stop Camera' : 'Start Camera'}
        </button>

        <button
          className="btn btn-secondary"
          onClick={openStudio}
          style={{ fontSize: '12px', padding: '8px' }}
        >
          <ExternalLink size={14} />
          Open Studio
        </button>
      </div>

      {/* Quick Triggers */}
      <div
        style={{
          background: 'rgba(15, 12, 32, 0.6)',
          borderRadius: '8px',
          padding: '10px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
          QUICK ACTIONS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <button
            className="btn btn-secondary"
            onClick={openStudio}
            
            style={{ fontSize: '11px', padding: '6px' }}
          >
            Disappear in Studio
          </button>
          <button
            className="btn btn-secondary"
            onClick={openStudio}
            
            style={{ fontSize: '11px', padding: '6px' }}
          >
            Reappear in Studio
          </button>
        </div>
      </div>

      {/* Virtual Camera Fallback link */}
      <button
        className="btn btn-secondary"
        onClick={openOutput}
        style={{ width: '100%', fontSize: '12px', justifyContent: 'center' }}
      >
        <Tv size={14} />
        Open Studio for OBS Setup
      </button>
    </div>
  );
};
