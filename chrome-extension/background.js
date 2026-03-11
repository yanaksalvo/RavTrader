importScripts('utils.js', 'binance-api.js', 'signal-generator.js');

let signalGenerator;
let scanInterval;
let darkexTabId = null;
let darkexWindowId = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('RAV Trader Extension Installed');
  initializeSignalScanner();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('RAV Trader Extension Started');
  initializeSignalScanner();
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === darkexTabId) {
    darkexTabId = null;
    darkexWindowId = null;
    chrome.runtime.sendMessage({ type: 'DARKEX_TAB_CLOSED' }).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) return;

    const isDarkexTab = tab.url && tab.url.includes('darkex.com');
    chrome.runtime.sendMessage({
      type: 'TAB_CHANGED',
      isDarkexActive: isDarkexTab,
      darkexTabExists: darkexTabId !== null
    }).catch(() => {});
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'DARKEX_TAB_OPENED') {
    darkexTabId = request.tabId;
    darkexWindowId = request.windowId;
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'CHECK_DARKEX_TAB') {
    if (darkexTabId !== null) {
      chrome.tabs.get(darkexTabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          darkexTabId = null;
          darkexWindowId = null;
          sendResponse({ exists: false, isActive: false });
        } else {
          chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
            const isActive = activeTabs.length > 0 && activeTabs[0].id === darkexTabId;
            sendResponse({ exists: true, isActive: isActive });
          });
        }
      });
    } else {
      sendResponse({ exists: false, isActive: false });
    }
    return true;
  }

  if (request.type === 'GET_USER_DATA') {
    chrome.storage.local.get(['ravTraderUser', 'ravTraderApiKeys'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (request.type === 'SAVE_USER_DATA') {
    chrome.storage.local.set(request.data, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.type === 'SETTINGS_UPDATED') {
    chrome.storage.local.set({ ravTraderSettings: request.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.type === 'GET_SIGNALS') {
    chrome.storage.local.get(['ravTraderSignals'], (result) => {
      sendResponse({ signals: result.ravTraderSignals || [] });
    });
    return true;
  }

  if (request.type === 'START_SCANNING') {
    startSignalScanner();
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'STOP_SCANNING') {
    stopSignalScanner();
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'MANUAL_SCAN') {
    performManualScan().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.type === 'SIGNAL_APPROVED' || request.type === 'SIGNAL_REJECTED') {
    chrome.storage.local.get(['ravTraderSignals'], (result) => {
      const signals = result.ravTraderSignals || [];
      const filtered = signals.filter(s => s.id !== request.signalId);

      chrome.storage.local.set({ ravTraderSignals: filtered }, () => {
        console.log(`Signal ${request.signalId} removed from storage (${request.type})`);
        sendResponse({ success: true });
      });
    });
    return true;
  }
});

function initializeSignalScanner() {
  signalGenerator = new SignalGenerator();
  startSignalScanner();
}

function startSignalScanner() {
  if (scanInterval) {
    clearInterval(scanInterval);
  }

  performScan();

  scanInterval = setInterval(() => {
    performScan();
  }, 2 * 60 * 1000);

  console.log('Signal scanner started - scanning every 2 minutes');
}

function stopSignalScanner() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
    console.log('Signal scanner stopped');
  }
}

async function performScan() {
  try {
    console.log('Scanning market for signals...');
    const signals = await signalGenerator.generateSignals();
    console.log(`Found ${signals.length} new signals`);

    if (signals.length > 0) {
      chrome.runtime.sendMessage({ type: 'NEW_SIGNALS', signals: signals }).catch(() => {});
    }
  } catch (error) {
    console.error('Error during market scan:', error);
  }
}

setInterval(() => {
  chrome.storage.local.get(['ravTraderSignals'], (result) => {
    const signals = result.ravTraderSignals || [];
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000;

    const filtered = signals.filter(s => (now - s.timestamp) < maxAge);

    if (filtered.length < signals.length) {
      chrome.storage.local.set({ ravTraderSignals: filtered });
      console.log(`Removed ${signals.length - filtered.length} expired signals`);
    }
  });
}, 5 * 60 * 1000);

async function performManualScan() {
  await performScan();
}

chrome.alarms.create('signalScan', { periodInMinutes: 2 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'signalScan') {
    performScan();
  }
});
