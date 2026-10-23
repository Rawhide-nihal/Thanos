import { describe, it, expect, beforeEach } from 'vitest';
import { AnimationController } from '@/effects/animation/AnimationController';

describe('AnimationController - State Machine & Transitions', () => {
  let controller: AnimationController;

  beforeEach(() => {
    controller = AnimationController.getInstance();
    controller.reset();
  });

  it('1. Initializes in VISIBLE state', () => {
    expect(controller.getState()).toBe('VISIBLE');
    expect(controller.getMetrics().progress).toBe(0);
  });

  it('2. Transitions VISIBLE -> DISAPPEARING upon disappear trigger', () => {
    controller.triggerDisappear();
    expect(controller.getState()).toBe('DISAPPEARING');
  });

  it('3. Advances animation progress and completes DISAPPEARING -> INVISIBLE', () => {
    controller.triggerDisappear();
    const startTime = performance.now();

    // Halfway through
    controller.update(startTime + 900);
    expect(controller.getState()).toBe('DISAPPEARING');
    expect(controller.getAnimationProgress()).toBeGreaterThanOrEqual(0.45);

    // After full duration (1800ms)
    controller.update(startTime + 2000);
    expect(controller.getState()).toBe('INVISIBLE');
    expect(controller.getAnimationProgress()).toBe(1.0);
  });

  it('4. Transitions INVISIBLE -> REAPPEARING upon reappear trigger', () => {
    // Set to invisible
    controller.triggerDisappear();
    controller.update(performance.now() + 2500);
    expect(controller.getState()).toBe('INVISIBLE');

    // Reappear trigger
    controller.triggerReappear();
    expect(controller.getState()).toBe('REAPPEARING');
  });

  it('5. Completes REAPPEARING -> VISIBLE', () => {
    controller.triggerDisappear();
    controller.update(performance.now() + 2500);
    controller.triggerReappear();
    const startReappear = performance.now();

    controller.update(startReappear + 2000);
    expect(controller.getState()).toBe('VISIBLE');
  });

  it('6. Suppresses duplicate snaps while an animation is in flight', () => {
    controller.triggerDisappear();
    expect(controller.getState()).toBe('DISAPPEARING');

    // Attempting another trigger during transition must be ignored
    controller.handleSnapTrigger();
    expect(controller.getState()).toBe('DISAPPEARING');
  });

  it('7. Instant reset restores ordinary VISIBLE state from any point', () => {
    controller.triggerDisappear();
    controller.update(performance.now() + 500);
    expect(controller.getState()).toBe('DISAPPEARING');

    controller.reset();
    expect(controller.getState()).toBe('VISIBLE');
    expect(controller.getAnimationProgress()).toBe(0);
  });
});
