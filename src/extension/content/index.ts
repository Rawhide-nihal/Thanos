/**
 * SnapShift Content Script for Google Meet (https://meet.google.com/*)
 */

function injectMainWorldScript(): void {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('interceptor.js');
    script.type = 'text/javascript';
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
    console.log('SnapShift: Injected MAIN-world interceptor script.');
  } catch (e) {
    console.warn('SnapShift: Failed to inject interceptor script:', e);
  }
}

function createMeetFloatingBadge(): void {
  if (document.getElementById('snapshift-meet-badge')) return;

  const badge = document.createElement('div');
  badge.id = 'snapshift-meet-badge';
  badge.innerHTML = `
    <div style="
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(15, 12, 32, 0.85);
      border: 1px solid rgba(139, 92, 246, 0.4);
      backdrop-filter: blur(12px);
      padding: 8px 14px;
      border-radius: 9999px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: #f1f5f9;
      cursor: pointer;
      transition: all 0.2s ease;
    ">
      <span style="
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #38bdf8;
        box-shadow: 0 0 10px #38bdf8;
        display: inline-block;
      "></span>
      <span>SnapShift</span>
      <span style="color: #fbbf24; font-size: 11px;">(Use OBS camera)</span>
    </div>
  `;

  badge.addEventListener('click', () => {
    // Open SnapShift Studio in a new tab when badge is clicked
    chrome.runtime.sendMessage({ type: 'OPEN_STUDIO' });
  });

  document.body.appendChild(badge);
}

// Inject interceptor at document_start
injectMainWorldScript();

// Inject floating indicator when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    createMeetFloatingBadge();
  });
} else {
  createMeetFloatingBadge();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_MEET_STATUS') {
    sendResponse({ active: false, mode: 'OBS_REQUIRED', url: window.location.href });
  } else if (message.type === 'SNAPSHIFT_SET_ENABLED') {
    window.postMessage({ type: 'SNAPSHIFT_SET_ENABLED', enabled: message.enabled }, '*');
    sendResponse({ ok: true });
  }
});
