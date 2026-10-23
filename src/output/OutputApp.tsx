import React, { useEffect, useRef } from 'react';
import { CameraManager } from '@/camera/CameraManager';
import { VideoOutputManager } from '@/streaming/VideoOutputManager';
import { VisionEngine } from '@/vision/VisionEngine';
import { SettingsStore } from '@/state/settingsStore';

export const OutputApp: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraManager = CameraManager.getInstance();
  const outputManager = VideoOutputManager.getInstance();
  const visionEngine = VisionEngine.getInstance();
  const settingsStore = SettingsStore.getInstance();

  useEffect(() => {
    // 1. Ensure vision engine is initialized
    visionEngine.initialize().catch(console.warn);

    // 2. Start camera if not already active
    const settings = settingsStore.getSettings();
    if (!cameraManager.getState().isStreaming) {
      cameraManager.startCamera(settings.selectedCameraId, settings.targetResolution)
        .then(() => outputManager.startRenderLoop())
        .catch(console.error);
    } else {
      outputManager.startRenderLoop();
    }

    // 3. Render loop to display canvas
    const renderCanvas = outputManager.getOutputCanvas();
    const displayCanvas = canvasRef.current;
    let animId: number;

    const loop = () => {
      if (displayCanvas && renderCanvas) {
        if (displayCanvas.width !== renderCanvas.width || displayCanvas.height !== renderCanvas.height) {
          displayCanvas.width = renderCanvas.width;
          displayCanvas.height = renderCanvas.height;
        }
        const ctx = displayCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(renderCanvas, 0, 0);
        }
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000000',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  );
};
