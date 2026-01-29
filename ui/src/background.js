import { io } from "socket.io-client";
import { getStorageData, removeStorageData } from "./lib/storage";
import { deriveKey, encryptData, decryptData, getRoomId } from "./lib/crypto";

let socket = null;
let lastClipboardText = "";
let encryptionKey = null;
let roomId = null;
let roomDevices = [];
let connectionStatus = "disconnected";
let lastError = "";
let deviceName = "Unknown Device";

async function setupOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['CLIPBOARD'],
    justification: 'Monitor and update clipboard for syncing between devices.',
  });
}

async function getClipboardText() {
  await setupOffscreen();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'READ_CLIPBOARD',
      target: 'offscreen'
    }, (response) => {
      resolve(response?.text || "");
    });
  });
}

async function setClipboardText(text) {
  await setupOffscreen();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'WRITE_CLIPBOARD',
      target: 'offscreen',
      text
    }, (response) => {
      resolve(response?.success || false);
    });
  });
}

async function initSync() {
  const data = await getStorageData(['seedPhrase', 'serverUrl', 'useSsl', 'deviceName']);
  if (!data.seedPhrase) {
    console.log("No seed phrase found, skipping sync init.");
    connectionStatus = "no_seed";
    return;
  }

  deviceName = data.deviceName || `Device ${Math.floor(Math.random() * 1000)}`;
  const serverUrl = data.serverUrl || "localhost:3000";
  const protocol = data.useSsl ? "https://" : "http://";
  const fullUrl = serverUrl.includes("://") ? serverUrl : protocol + serverUrl;

  encryptionKey = deriveKey(data.seedPhrase);
  roomId = getRoomId(data.seedPhrase);

  if (socket) {
    socket.disconnect();
  }

  connectionStatus = "connecting";
  lastError = "";
  socket = io(fullUrl, { 
    reconnection: true,
    transports: ['websocket']
  });

  socket.on('connect', () => {
    console.log("Connected to sync server");
    connectionStatus = "connected";
    socket.emit('join', { room: roomId, deviceName });
  });

  socket.on('room_status', (devices) => {
    roomDevices = devices;
    chrome.runtime.sendMessage({ type: "ROOM_STATUS_UPDATED", devices });
  });

  socket.on('excluded', async () => {
    console.log("This device was excluded from the sync group");
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'SynClip',
      message: 'This device was excluded from the sync group.'
    });
    // Clear seed phrase to effectively leave
    await removeStorageData('seedPhrase');
    if (socket) socket.disconnect();
    connectionStatus = "disconnected";
    roomId = null;
    encryptionKey = null;
    chrome.runtime.sendMessage({ type: "EXCLUDED" });
  });

  socket.on('ping_device', (data) => {
    socket.emit('pong_device', { targetSocketId: data.fromSocketId, fromSocketId: socket.id });
  });

  socket.on('pong_device', (data) => {
    chrome.runtime.sendMessage({ type: "PONG_RECEIVED", fromSocketId: data.fromSocketId });
  });

  socket.on('clipboard_update', (encryptedData) => {
    try {
      const decryptedText = decryptData(encryptedData, encryptionKey);
      if (decryptedText && decryptedText !== lastClipboardText) {
        lastClipboardText = decryptedText;
        setClipboardText(decryptedText);
        console.log("Clipboard updated from remote");
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'SynClip',
            message: 'Clipboard updated from another device'
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

  socket.on('disconnect', () => {
    console.log("Disconnected from sync server");
    connectionStatus = "disconnected";
    roomDevices = [];
  });
}

// Poll for clipboard changes
async function pollClipboard() {
  if (socket && socket.connected && encryptionKey && roomId) {
    const currentText = await getClipboardText();
    if (currentText && currentText !== lastClipboardText) {
      lastClipboardText = currentText;
      const encryptedData = encryptData(currentText, encryptionKey);
      socket.emit('clipboard_update', { room: roomId, encryptedData });
      console.log("Sent clipboard update to remote");
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("SynClip Extension Installed");
  initSync();
});

chrome.runtime.onStartup.addListener(() => {
    initSync();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "RECONNECT") {
        initSync();
    } else if (message.type === "GET_STATUS") {
        sendResponse({ 
          connectionStatus, 
          lastError,
          roomDevices, 
          socketId: socket?.id,
          roomId,
          deviceName
        });
    } else if (message.type === "EXCLUDE_DEVICE") {
        if (socket && socket.connected) {
            socket.emit('exclude_device', { room: roomId, socketId: message.socketId });
        }
    } else if (message.type === "LEAVE_GROUP") {
        (async () => {
            await removeStorageData('seedPhrase');
            if (socket) socket.disconnect();
            connectionStatus = "disconnected";
            roomId = null;
            encryptionKey = null;
            roomDevices = [];
            sendResponse({ success: true });
        })();
        return true; // Keep channel open for async response
    } else if (message.type === "PING_DEVICE") {
        if (socket && socket.connected) {
            socket.emit('ping_device', { targetSocketId: message.socketId, fromSocketId: socket.id });
        }
    }
});

// Use Alarms for periodic polling (service workers can be killed)
chrome.alarms.create('poll_clipboard', { periodInMinutes: 0.1 }); // Every 6 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'poll_clipboard') {
    pollClipboard();
  }
});

initSync();
