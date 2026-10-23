import React from 'react';
import { StudioApp } from '@/studio/StudioApp';

/**
 * Legacy output entry now uses the full Studio so the camera can be calibrated
 * and the OBS clean-output mode can run in this SAME document. Opening a
 * separate rendering context cannot inherit webcam tracks or canvas pixels.
 */
export const OutputApp: React.FC = () => <StudioApp />;
