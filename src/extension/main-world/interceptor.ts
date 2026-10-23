/**
 * Direct Google Meet stream interception is intentionally disabled.
 * Previous code intercepted getUserMedia but returned the raw stream,
 * misleading users into thinking the effects were being sent to Meet.
 * Use SnapShift Studio -> Clean Output -> OBS Virtual Camera instead.
 * Do not monkey-patch Meet's media APIs until a genuine processed-track
 * handoff and an external receiving-peer test are implemented.
 */
export {};
console.info('SnapShift: direct Meet interception not installed; select OBS Virtual Camera in Meet.');
