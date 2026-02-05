import React, { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useStatusStore } from "@/store/statusStore"
import browser from 'webextension-polyfill'
import { cn } from "@/lib/utils"
import Devices from './pages/Devices'
import Settings from './pages/Settings'
import Share from './pages/Share'
import {Button} from "@/components/ui/button.jsx";
import {ChevronRight} from "lucide-react";

function App() {
  const { fetchStatus, updateStatus } = useStatusStore();
  const [isSidebar, setIsSidebar] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsSidebar(params.get('view') === 'sidebar');

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
        <div className={cn(
            "bg-background text-foreground flex flex-col overflow-hidden",
            isSidebar ? "w-full h-screen" : "w-[400px] h-[600px]"
        )}>
          <div className="flex h-full">
            {isSidebar && (
              <Button 
                variant="ghost" 
                className="h-full rounded-none shrink-0 px-0" 
                onClick={window.close}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              >
                <ChevronRight className="!size-4" />
              </Button>
            )}
            <Tabs 
              defaultValue="share" 
              className={cn(
                "w-full flex-1 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out",
                isSidebar && isHovered ? "translate-x-2" : "translate-x-0"
              )}
            >
              <div className="pr-4 pl-0 pt-2 shrink-0">
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
        </div>
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App
