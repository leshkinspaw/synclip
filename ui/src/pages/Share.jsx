import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStatusStore } from "@/store/statusStore";
import browser from 'webextension-polyfill';
import {
  Monitor,
  Camera,
  StopCircle,
  Play,
  ExternalLink,
  Copy,
  Check,
  Laptop,
  Eye,
  AlertCircle
} from "lucide-react";

export default function Share() {
  const { devices, myId } = useStatusStore();
  const [sharing, setSharing] = useState({ screen: false, camera: false });
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    const myDevice = devices.find(d => d.socketId === myId);
    if (myDevice?.sharing) {
      setSharing(myDevice.sharing);
    } else {
      setSharing({ screen: false, camera: false });
    }
  }, [devices, myId]);

  const handleStartShare = async (type) => {
    try {
      const tabs = await browser.tabs.query({ url: browser.runtime.getURL('share-stream.html*') });
      if (tabs.length > 0) {
        const tab = tabs[0];
        await browser.tabs.update(tab.id, { active: true });
        if (tab.windowId) {
          await browser.windows.update(tab.windowId, { focused: true });
        }
        browser.runtime.sendMessage({ type: "START_SHARE_FROM_POPUP", streamType: type });
      } else {
        const url = browser.runtime.getURL(`share-stream.html?type=${type}`);
        await browser.tabs.create({ url });
      }
    } catch (err) {
      console.error(`Failed to start ${type} share:`, err);
    }
  };

  const handleStopShare = (type) => {
    browser.runtime.sendMessage({ type: "STOP_SHARE", streamType: type });
  };

  const handleWatch = async (targetSocketId, streamType) => {
    try {
      const url = browser.runtime.getURL(`watch.html?targetId=${targetSocketId}&type=${streamType}`);
      const tabs = await browser.tabs.query({ url: browser.runtime.getURL('watch.html*') });
      const existingTab = tabs.find(tab => tab.url === url);

      if (existingTab) {
        await browser.tabs.update(existingTab.id, { active: true });
        if (existingTab.windowId) {
          await browser.windows.update(existingTab.windowId, { focused: true });
        }
      } else {
        await browser.tabs.create({ url });
      }
    } catch (err) {
      console.error(`Failed to watch ${streamType}:`, err);
      // Fallback
      const url = browser.runtime.getURL(`watch.html?targetId=${targetSocketId}&type=${streamType}`);
      browser.tabs.create({ url });
    }
  };

  const copyOBSLink = (targetSocketId) => {
    const url = browser.runtime.getURL(`watch.html?targetId=${targetSocketId}&type=camera&obs=true`);
    navigator.clipboard.writeText(url);
    setCopiedId(targetSocketId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const otherDevices = devices.filter(d => d.socketId !== myId);
  const myDevice = devices.find(d => d.socketId === myId);

  // Group monitors for "My Broadcast"
  const groupedMonitors = myDevice?.monitors?.reduce((acc, m) => {
    if (!acc[m.socketId]) {
      acc[m.socketId] = { deviceName: m.deviceName, types: [] };
    }
    acc[m.socketId].types.push(m.type);
    return acc;
  }, {}) || {};

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" />
            This Device
          </CardTitle>
          <CardDescription>Share your screen or camera with other devices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {!sharing.screen ? (
              <Button 
                onClick={() => handleStartShare('screen')}
                className="flex-1 flex items-center gap-2"
                variant="outline"
              >
                <Monitor className="w-4 h-4" />
                Share Screen
              </Button>
            ) : (
              <Button 
                onClick={() => handleStopShare('screen')}
                className="flex-1 flex items-center gap-2"
                variant="destructive"
              >
                <StopCircle className="w-4 h-4" />
                Stop Screen
              </Button>
            )}

            {!sharing.camera ? (
              <Button 
                onClick={() => handleStartShare('camera')}
                className="flex-1 flex items-center gap-2"
                variant="outline"
              >
                <Camera className="w-4 h-4" />
                Share Camera
              </Button>
            ) : (
              <Button 
                onClick={() => handleStopShare('camera')}
                className="flex-1 flex items-center gap-2"
                variant="destructive"
              >
                <StopCircle className="w-4 h-4" />
                Stop Camera
              </Button>
            )}
          </div>

          {Object.keys(groupedMonitors).length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                Watchers ({Object.keys(groupedMonitors).length}):
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(groupedMonitors).map(([socketId, data]) => (
                  <div key={socketId} className="text-xs bg-secondary px-2 py-1 rounded-full flex items-center gap-2">
                    <span className="font-medium">{data.deviceName}</span>
                    <div className="flex gap-1 border-l pl-1.5 ml-0.5 border-muted-foreground/30">
                      {data.types.includes('screen') && <Monitor className="w-3 h-3" />}
                      {data.types.includes('camera') && <Camera className="w-3 h-3" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Other Devices</h3>
        {otherDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <AlertCircle className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-sm">No other devices connected</p>
          </div>
        ) : (
          (() => {
            const sharingDevices = otherDevices.filter(d => d.sharing?.screen || d.sharing?.camera);
            if (sharingDevices.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <p className="text-sm">No other devices are sharing right now</p>
                </div>
              );
            }
            return sharingDevices.map(device => (
              <Card key={device.socketId} className="overflow-hidden border-l-4 border-l-primary">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-primary/10 p-1.5 rounded-md">
                        <Laptop className="w-4 h-4 text-primary" />
                      </div>
                      <p className="text-sm font-bold">{device.deviceName}</p>
                    </div>
                    {device.monitors && device.monitors.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                         <Eye className="w-2.5 h-2.5" />
                         {device.monitors.length}
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {device.sharing?.screen && (
                      <div className="flex items-center justify-between bg-secondary/30 p-2 rounded-md border border-border/50">
                        <div className="flex items-center gap-2 text-xs">
                          <Monitor className="w-3.5 h-3.5 text-primary" />
                          <span>Screen</span>
                        </div>
                        <Button size="xs" className="h-7 px-3 text-[10px]" onClick={() => handleWatch(device.socketId, 'screen')}>
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Watch
                        </Button>
                      </div>
                    )}
                    {device.sharing?.camera && (
                      <div className="flex items-center justify-between bg-secondary/30 p-2 rounded-md border border-border/50">
                        <div className="flex items-center gap-2 text-xs">
                          <Camera className="w-3.5 h-3.5 text-primary" />
                          <span>Camera + Mic</span>
                        </div>
                        <div className="flex gap-2.5">
                          <Button variant="outline" size="xs" className="h-7 px-2 text-[10px]" onClick={() => copyOBSLink(device.socketId)}>
                            {copiedId === device.socketId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span className="ml-1">OBS</span>
                          </Button>
                          <Button size="xs" className="h-7 px-3 text-[10px]" onClick={() => handleWatch(device.socketId, 'camera')}>
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Watch
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ));
          })()
        )}
      </div>
    </div>
  );
}
