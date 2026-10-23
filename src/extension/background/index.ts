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

  // Relay shortcut command to all active tabs
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'KEYBOARD_COMMAND', command }).catch(() => {});
      }
    }
  });
});

// Handle extension messaging
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OPEN_STUDIO') {
    chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') });
    sendResponse({ ok: true });
  } else if (message.type === 'OPEN_OUTPUT') {
    // Open clean 16:9 frameless pop-up window for OBS Window Capture
    chrome.windows.create({
      url: chrome.runtime.getURL('output.html'),
      type: 'popup',
      width: 1280,
      height: 720,
      focused: true,
    });
    sendResponse({ ok: true });
  }
});
