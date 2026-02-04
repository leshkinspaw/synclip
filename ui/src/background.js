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
let pollInterval = 1;

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
  browser.alarms.create('poll_clipboard', { periodInMinutes: pollInterval / 60 });
  console.log(`Clipboard polling alarm set to ${pollInterval} seconds`);
}

async function initSync() {
  try {
    const data = await getStorageData(['seedPhrase', 'serverUrl', 'useSsl', 'deviceName', 'pollInterval']);
    if (!data.seedPhrase) {
      console.log("No seed phrase found, skipping sync init.");
      connectionStatus = "no_seed";
      return;
    }

    deviceName = data.deviceName || `Device ${Math.floor(Math.random() * 1000)}`;
    const newPollInterval = data.pollInterval || pollInterval;
    const serverUrl = data.serverUrl || "localhost:3000";
    const protocol = data.useSsl ? "https://" : "http://";
    const fullUrl = serverUrl.includes("://") ? serverUrl : protocol + serverUrl;

    // Setup alarm with the interval
    await setupPollAlarm(newPollInterval);

    encryptionKey = deriveKey(data.seedPhrase);
    roomId = getRoomId(data.seedPhrase);

    if (socket) {
      socket.disconnect();
    }

    connectionStatus = "connecting";
    lastError = "";
    socket = io(fullUrl, { 
      reconnection: true,
      transports: ['websocket'],
      timeout: 10000
    });

    socket.on('connect', () => {
      console.log("Connected to sync server");
      connectionStatus = "connected";
      socket.emit('join', { room: roomId, deviceName });
    });

    socket.on('room_status', (devices) => {
      roomDevices = devices;
      browser.runtime.sendMessage({ type: "ROOM_STATUS_UPDATED", devices }).catch(() => {
        // Ignore errors if no one is listening (popup closed)
      });
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
  if (socket?.connected && encryptionKey && roomId) {
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
  "GET_STATUS": async () => {
    return {
      connectionStatus,
      lastError,
      roomDevices,
      socketId: socket?.id,
      roomId,
      deviceName,
      pollInterval
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
  }
};

browser.runtime.onMessage.addListener((message, sender) => {
  if (handlers[message.type]) {
    return handlers[message.type](message);
  }
});

// Use Alarms for periodic polling (service workers can be killed)
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'poll_clipboard') {
    pollClipboard();
  }
});

initSync();
