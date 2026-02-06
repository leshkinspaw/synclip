import { io } from "socket.io-client";
import { getStorageData, removeStorageData } from "./lib/storage";
import { deriveKey, encryptData, decryptData, getRoomId } from "./lib/crypto";
import browser from 'webextension-polyfill';

let socket = null;
let lastClipboardText = "";
let encryptionKey = null;
let roomId = null;
let roomDevices = [];
let connectionStatus = "disconnected";
let lastError = "";
let deviceName = "Unknown Device";
let serverUrl = "";
let pollInterval = 1;
let receiveClipboard = true;
let sendClipboard = true;
let interfaceMode = "sidebar";
let localSharing = { screen: false, camera: false };
let activeTabs = {}; // tabId -> { shares: Set(), watches: Set() }

async function setupOffscreen() {
  if (await browser.offscreen.hasDocument()) return;
  await browser.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['CLIPBOARD'],
    justification: 'Monitor and update clipboard for syncing between devices.',
  });
}

async function getClipboardText() {
  await setupOffscreen();
  try {
    const response = await browser.runtime.sendMessage({
      type: 'READ_CLIPBOARD',
      target: 'offscreen'
    });
    return response?.text || "";
  } catch (e) {
    console.error("Failed to get clipboard text", e);
    return "";
  }
}

async function setClipboardText(text) {
  await setupOffscreen();
  try {
    const response = await browser.runtime.sendMessage({
      type: 'WRITE_CLIPBOARD',
      target: 'offscreen',
      text
    });
    return response?.success || false;
  } catch (e) {
    console.error("Failed to set clipboard text", e);
    return false;
  }
}

async function setupPollAlarm(interval) {
  pollInterval = interval;
  await browser.alarms.clear('poll_clipboard');
  if (sendClipboard) {
    browser.alarms.create('poll_clipboard', { periodInMinutes: pollInterval / 60 });
    console.log(`Clipboard polling alarm set to ${pollInterval} seconds`);
  } else {
    console.log("Clipboard polling alarm disabled (sendClipboard is false)");
  }
}

async function applyInterfaceMode(mode) {
  interfaceMode = mode;
  if (mode === 'popup') {
    if (chrome.action) {
      await chrome.action.setPopup({ popup: 'index.html' });
    }
    if (chrome.sidePanel && chrome.sidePanel.setOptions) {
      await chrome.sidePanel.setOptions({
        enabled: false
      }).catch(() => {});
    }
  } else {
    if (chrome.action) {
      await chrome.action.setPopup({ popup: '' });
    }
    if (chrome.sidePanel && chrome.sidePanel.setOptions) {
      await chrome.sidePanel.setOptions({
        path: 'index.html?view=sidebar',
        enabled: true
      }).catch(err => console.error("Error setting side panel options:", err));
    }
  }
}

async function initSync() {
  try {
    const data = await getStorageData(['seedPhrase', 'serverUrl', 'useSsl', 'deviceName', 'pollInterval', 'receiveClipboard', 'sendClipboard', 'interfaceMode']);
    if (!data.seedPhrase) {
      console.log("No seed phrase found, skipping sync init.");
      connectionStatus = "no_seed";
      return;
    }

    deviceName = data.deviceName || `Device ${Math.floor(Math.random() * 1000)}`;
    const newPollInterval = data.pollInterval || pollInterval;
    receiveClipboard = data.receiveClipboard !== undefined ? data.receiveClipboard : true;
    sendClipboard = data.sendClipboard !== undefined ? data.sendClipboard : true;
    interfaceMode = data.interfaceMode || "sidebar";
    const srvUrl = data.serverUrl || "localhost:3000";

    // Apply interface mode
    await applyInterfaceMode(interfaceMode);

    const protocol = data.useSsl ? "https://" : "http://";
    serverUrl = srvUrl.includes("://") ? srvUrl : protocol + srvUrl;

    // Setup alarm with the interval
    await setupPollAlarm(newPollInterval);

    encryptionKey = deriveKey(data.seedPhrase);
    roomId = getRoomId(data.seedPhrase);

    if (socket) {
      socket.disconnect();
    }

    connectionStatus = "connecting";
    lastError = "";
    socket = io(serverUrl, { 
      reconnection: true,
      transports: ['websocket'],
      timeout: 10000
    });

    socket.on('connect', () => {
      console.log("Connected to sync server");
      connectionStatus = "connected";
      socket.emit('join', { room: roomId, deviceName });
      
      // Restore sharing state on reconnect
      if (localSharing.screen) socket.emit('start_share', { type: 'screen' });
      if (localSharing.camera) socket.emit('start_share', { type: 'camera' });
    });

    socket.on('room_status', (devices) => {
      roomDevices = devices;
      browser.runtime.sendMessage({ 
        type: "ROOM_STATUS_UPDATED", 
        devices,
        socketId: socket?.id,
        localSharing
      }).catch(() => {
        // Ignore errors if no one is listening (popup closed)
      });
    });

    socket.on('signal', (data) => {
      // Forward signaling data to any open watch or share tabs
      console.log(`Received signal from ${data.from} for ${data.streamType}`);
      browser.runtime.sendMessage({ type: "SIGNAL", ...data }).catch(() => {});
    });

    socket.on('excluded', async () => {
      console.log("This device was excluded from the sync group");
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'SynClip',
        message: 'This device was excluded from the sync group.'
      });
      // Clear seed phrase to effectively leave
      await removeStorageData('seedPhrase');
      if (socket) socket.disconnect();
      connectionStatus = "no_seed";
      roomId = null;
      encryptionKey = null;
      browser.runtime.sendMessage({ type: "EXCLUDED" }).catch(() => {});
    });

    socket.on('ping_device', (data) => {
      socket.emit('pong_device', { targetSocketId: data.fromSocketId, fromSocketId: socket.id });
    });

    socket.on('pong_device', (data) => {
      browser.runtime.sendMessage({ type: "PONG_RECEIVED", fromSocketId: data.fromSocketId }).catch(() => {});
    });

    socket.on('clipboard_update', (encryptedData) => {
      if (!receiveClipboard) return;
      try {
        const decryptedText = decryptData(encryptedData, encryptionKey);
        if (decryptedText && decryptedText !== lastClipboardText) {
          lastClipboardText = decryptedText;
          setClipboardText(decryptedText).then(success => {
            if (success) {
              console.log("Clipboard updated from remote");
              browser.notifications.create({
                  type: 'basic',
                  iconUrl: 'icon48.png',
                  title: 'SynClip',
                  message: 'Clipboard updated from another device'
              });
            }
          });
        }
      } catch (e) {
        console.error("Failed to decrypt or update clipboard", e);
      }
    });

    socket.on('connect_error', (error) => {
      console.error("Connection error:", error);
      connectionStatus = "error";
      lastError = error.message || String(error);
    });

    socket.on('disconnect', (reason) => {
      console.log("Disconnected from sync server:", reason);
      connectionStatus = "disconnected";
      roomDevices = [];
    });
  } catch (err) {
    console.error("Failed to initialize sync:", err);
    connectionStatus = "error";
    lastError = err.message || String(err);
  }
}

// Poll for clipboard changes
async function pollClipboard() {
  if (socket?.connected && encryptionKey && roomId && sendClipboard) {
    try {
      const currentText = await getClipboardText();
      if (currentText && currentText !== lastClipboardText) {
        lastClipboardText = currentText;
        const encryptedData = encryptData(currentText, encryptionKey);
        socket.emit('clipboard_update', { room: roomId, encryptedData });
        console.log("Sent clipboard update to remote");
      }
    } catch (e) {
      console.error("Poll clipboard failed:", e);
    }
  }
}

browser.runtime.onInstalled.addListener(() => {
  console.log("SynClip Extension Installed");
  initSync();
});

// Open side panel on action click
if (chrome.action && chrome.sidePanel && chrome.sidePanel.open) {
  chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId })
      .catch((error) => console.error("Error opening side panel:", error));
  });
}

browser.runtime.onStartup.addListener(() => {
    initSync();
});

const handlers = {
  "RECONNECT": async () => {
    await initSync();
  },
  "UPDATE_POLL_INTERVAL": async (message) => {
    await setupPollAlarm(message.pollInterval);
    return { success: true };
  },
  "UPDATE_CLIPBOARD_SETTINGS": async (message) => {
    if (message.receiveClipboard !== undefined) receiveClipboard = message.receiveClipboard;
    if (message.sendClipboard !== undefined) {
      sendClipboard = message.sendClipboard;
      await setupPollAlarm(pollInterval); // Re-setup alarm to respect new sendClipboard state
    }
    return { success: true };
  },
  "UPDATE_INTERFACE_MODE": async (message) => {
    if (message.interfaceMode) {
      await applyInterfaceMode(message.interfaceMode);
    }
    return { success: true };
  },
  "GET_STATUS": async () => {
    return {
      connectionStatus,
      lastError,
      roomDevices,
      socketId: socket?.id,
      roomId,
      serverUrl,
      deviceName,
      pollInterval,
      receiveClipboard,
      sendClipboard,
      interfaceMode,
      localSharing
    };
  },
  "EXCLUDE_DEVICE": async (message) => {
    if (socket?.connected && roomId) {
      socket.emit('exclude_device', { room: roomId, socketId: message.socketId });
    }
  },
  "LEAVE_GROUP": async () => {
    await removeStorageData('seedPhrase');
    if (socket) socket.disconnect();
    connectionStatus = "no_seed";
    roomId = null;
    encryptionKey = null;
    roomDevices = [];
    return { success: true };
  },
  "PING_DEVICE": async (message) => {
    if (socket?.connected && roomId) {
      socket.emit('ping_device', { targetSocketId: message.socketId, fromSocketId: socket.id });
    }
  },
  "START_SHARE": async (message, sender) => {
    localSharing[message.streamType] = true;
    browser.runtime.sendMessage({ type: "LOCAL_SHARING_UPDATED", localSharing }).catch(() => {});
    if (sender?.tab?.id) {
      const tabId = sender.tab.id;
      if (!activeTabs[tabId]) activeTabs[tabId] = { shares: new Set(), watches: new Set() };
      activeTabs[tabId].shares.add(message.streamType);
    }
    if (socket?.connected) {
      socket.emit('start_share', { type: message.streamType });
    }
  },
  "STOP_SHARE": async (message, sender) => {
    localSharing[message.streamType] = false;
    browser.runtime.sendMessage({ type: "LOCAL_SHARING_UPDATED", localSharing }).catch(() => {});
    if (sender?.tab?.id) {
      const tabId = sender.tab.id;
      if (activeTabs[tabId]) {
        activeTabs[tabId].shares.delete(message.streamType);
        if (activeTabs[tabId].shares.size === 0 && activeTabs[tabId].watches.size === 0) {
          delete activeTabs[tabId];
        }
      }
    }
    
    // Always notify any open share-stream tabs to stop locally
    browser.runtime.sendMessage({ type: "STOP_SHARE_LOCAL", streamType: message.streamType }).catch(() => {});

    if (socket?.connected) {
      socket.emit('stop_share', { type: message.streamType });
    }
  },
  "SIGNAL": async (message) => {
    if (socket?.connected) {
      socket.emit('signal', {
        to: message.to,
        signal: message.signal,
        streamType: message.streamType
      });
    }
  },
  "JOIN_WATCH": async (message, sender) => {
    if (sender?.tab?.id) {
      const tabId = sender.tab.id;
      if (!activeTabs[tabId]) activeTabs[tabId] = { shares: new Set(), watches: new Set() };
      // Store watch as stringified object to allow easy removal
      activeTabs[tabId].watches.add(JSON.stringify({ 
        targetSocketId: message.targetSocketId, 
        streamType: message.streamType 
      }));
    }
    if (socket?.connected) {
      socket.emit('join_watch', {
        targetSocketId: message.targetSocketId,
        streamType: message.streamType,
        deviceName: message.deviceName
      });
    }
  },
  "LEAVE_WATCH": async (message, sender) => {
    if (sender?.tab?.id) {
      const tabId = sender.tab.id;
      if (activeTabs[tabId]) {
        activeTabs[tabId].watches.delete(JSON.stringify({ 
          targetSocketId: message.targetSocketId, 
          streamType: message.streamType 
        }));
        if (activeTabs[tabId].shares.size === 0 && activeTabs[tabId].watches.size === 0) {
          delete activeTabs[tabId];
        }
      }
    }
    if (socket?.connected) {
      socket.emit('leave_watch', {
        targetSocketId: message.targetSocketId,
        streamType: message.streamType
      });
    }
  }
};

browser.runtime.onMessage.addListener((message, sender) => {
  if (handlers[message.type]) {
    return handlers[message.type](message, sender);
  }
});

// Use Alarms for periodic polling (service workers can be killed)
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'poll_clipboard') {
    pollClipboard();
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  if (activeTabs[tabId]) {
    console.log(`Tab ${tabId} closed, cleaning up activities`);
    const { shares, watches } = activeTabs[tabId];
    
    shares.forEach(type => {
      console.log(`Auto-stopping share: ${type}`);
      localSharing[type] = false;
      browser.runtime.sendMessage({ type: "LOCAL_SHARING_UPDATED", localSharing }).catch(() => {});
      if (socket?.connected) {
        socket.emit('stop_share', { type });
      }
    });

    watches.forEach(watchStr => {
      const { targetSocketId, streamType } = JSON.parse(watchStr);
      console.log(`Auto-leaving watch: ${streamType} from ${targetSocketId}`);
      if (socket?.connected) {
        socket.emit('leave_watch', { targetSocketId, streamType });
      }
    });

    delete activeTabs[tabId];
  }
});

initSync();
