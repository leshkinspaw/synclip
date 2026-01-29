import React, { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import Devices from './pages/Devices'
import Settings from './pages/Settings'

function App() {
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    // Detect Windows platform
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getPlatformInfo) {
      chrome.runtime.getPlatformInfo((info) => {
        if (info.os === 'win') {
          setIsWindows(true);
        }
      });
    } else {
      // Fallback for development
      const platform = navigator.platform.toLowerCase();
      if (platform.includes('win')) {
        setIsWindows(true);
      }
    }
  }, []);

  return (
    <ThemeProvider defaultTheme="system" storageKey="synclip-theme">
      <TooltipProvider>
        <div className="w-[400px] h-[600px] bg-background text-foreground flex flex-col overflow-hidden">
          <Tabs defaultValue="devices" className="w-full flex-1 flex flex-col overflow-hidden">
            <div className="px-4 pt-2 shrink-0">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="devices">Devices</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-hidden">
              <TabsContent value="devices" className="m-0 h-full">
                <Devices />
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
