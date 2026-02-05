import { create } from 'zustand';
import browser from 'webextension-polyfill';

export const useStatusStore = create((set, get) => ({
  status: 'disconnected',
  lastError: '',
  devices: [],
  myId: '',
  roomId: '',
  serverUrl: '',
  deviceName: '',
  pollInterval: 1,
  receiveClipboard: true,
  sendClipboard: true,
  interfaceMode: 'sidebar',

  updateStatus: (data) => set((state) => ({ ...state, ...data })),

  fetchStatus: async () => {
    try {
      const response = await browser.runtime.sendMessage({ type: "GET_STATUS" });
      if (response) {
        set({
          status: response.connectionStatus,
          lastError: response.lastError || "",
          devices: response.roomDevices || [],
          myId: response.socketId,
          roomId: response.roomId || "",
          serverUrl: response.serverUrl || "",
          deviceName: response.deviceName || get().deviceName,
          pollInterval: response.pollInterval || get().pollInterval,
          receiveClipboard: response.receiveClipboard !== undefined ? response.receiveClipboard : get().receiveClipboard,
          sendClipboard: response.sendClipboard !== undefined ? response.sendClipboard : get().sendClipboard,
          interfaceMode: response.interfaceMode || get().interfaceMode
        });
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  },
}));
