/**
 * SnapShift Background Service Worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener((details) => {
  console.log('SnapShift Extension Installed:', details.reason);
  if (details.reason === 'install') {
    // Open studio page upon initial install to let user test and calibrate
    chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') });
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  console.log('SnapShift shortcut triggered:', command);

  // Studio is an extension page, not a content script in a normal tab.
  // tabs.sendMessage cannot reach its listeners; runtime messaging can.
  chrome.runtime.sendMessage({ type: 'SNAPSHIFT_KEYBOARD_COMMAND', command }).catch(() => {});
});

// Handle extension messaging
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OPEN_STUDIO') {
    chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') });
    sendResponse({ ok: true });
  } else if (message.type === 'OPEN_OUTPUT') {
    // Open clean 16:9 frameless pop-up window for OBS Window Capture
    chrome.windows.create({
      url: chrome.runtime.getURL('studio.html'),
      type: 'popup',
      width: 1280,
      height: 720,
      focused: true,
    });
    sendResponse({ ok: true });
  }
});
