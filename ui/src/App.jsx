import React, { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useStatusStore } from "@/store/statusStore"
import browser from 'webextension-polyfill'
import Devices from './pages/Devices'
import Settings from './pages/Settings'
import Share from './pages/Share'

function App() {
  const { fetchStatus, updateStatus } = useStatusStore();

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    const listener = (message) => {
      if (message.type === "ROOM_STATUS_UPDATED") {
        updateStatus({ 
          devices: message.devices,
          myId: message.socketId || undefined
        });
      } else if (message.type === "EXCLUDED") {
        window.location.reload();
      }
    };

    browser.runtime.onMessage.addListener(listener);

    return () => {
      clearInterval(interval);
      browser.runtime.onMessage.removeListener(listener);
    };
  }, [fetchStatus, updateStatus]);

  return (
    <ThemeProvider defaultTheme="system" storageKey="synclip-theme">
      <TooltipProvider>
        <div className="w-[400px] h-[600px] bg-background text-foreground flex flex-col overflow-hidden">
          <Tabs defaultValue="devices" className="w-full flex-1 flex flex-col overflow-hidden">
            <div className="px-4 pt-2 shrink-0">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="devices">Devices</TabsTrigger>
                <TabsTrigger value="share">Share</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-hidden">
              <TabsContent value="devices" className="m-0 h-full">
                <Devices />
              </TabsContent>
              <TabsContent value="share" className="m-0 h-full">
                <Share />
              </TabsContent>
              <TabsContent value="settings" className="m-0 h-full">
                <Settings />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App
