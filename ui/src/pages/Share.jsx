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
  Users,
  AlertCircle
} from "lucide-react";

export default function Share() {
  const { devices, myId, deviceName } = useStatusStore();
  const [sharing, setSharing] = useState({ screen: false, camera: false });
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    const myDevice = devices.find(d => d.socketId === myId);
    if (myDevice?.sharing) {
      setSharing(myDevice.sharing);
    }
  }, [devices, myId]);

  const handleStartShare = async (type) => {
    try {
      // For extensions, we should open a new tab that will handle the stream
      // because the popup might close.
      const url = browser.runtime.getURL(`share-stream.html?type=${type}`);
      await browser.tabs.create({ url });
    } catch (err) {
      console.error(`Failed to start ${type} share:`, err);
    }
  };

  const handleStopShare = (type) => {
    browser.runtime.sendMessage({ type: "STOP_SHARE", streamType: type });
  };

  const handleWatch = (targetSocketId, streamType) => {
    const url = browser.runtime.getURL(`watch.html?targetId=${targetSocketId}&type=${streamType}`);
    browser.tabs.create({ url });
  };

  const copyOBSLink = (targetSocketId) => {
    const url = browser.runtime.getURL(`watch.html?targetId=${targetSocketId}&type=camera&obs=true`);
    navigator.clipboard.writeText(url);
    setCopiedId(targetSocketId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const otherDevices = devices.filter(d => d.socketId !== myId);
  const myDevice = devices.find(d => d.socketId === myId);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" />
            My Broadcast
          </CardTitle>
          <CardDescription>Share your screen or camera with the group</CardDescription>
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

          {myDevice?.monitors && myDevice.monitors.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Watching now ({myDevice.monitors.length}):
              </h4>
              <div className="flex flex-wrap gap-2">
                {myDevice.monitors.map((m, idx) => (
                  <span key={idx} className="text-xs bg-secondary px-2 py-1 rounded-full flex items-center gap-1">
                    {m.deviceName} 
                    <span className="text-[10px] text-muted-foreground">({m.type})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Shares</h3>
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
                  <p className="text-sm">No one is sharing right now</p>
                </div>
              );
            }
            return sharingDevices.map(device => (
              <div key={device.socketId} className="space-y-2">
                {device.sharing?.screen && (
                  <Card key={`${device.socketId}-screen`}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-full">
                          <Monitor className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{device.deviceName}</p>
                          <p className="text-xs text-muted-foreground">Screenshare</p>
                        </div>
                      </div>
                      <Button size="sm" onClick={() => handleWatch(device.socketId, 'screen')}>
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Watch
                      </Button>
                    </CardContent>
                  </Card>
                )}
                {device.sharing?.camera && (
                  <Card key={`${device.socketId}-camera`}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-full">
                          <Camera className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{device.deviceName}</p>
                          <p className="text-xs text-muted-foreground">Camera + Mic</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => copyOBSLink(device.socketId)}>
                          {copiedId === device.socketId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          <span className="ml-1 hidden sm:inline">OBS</span>
                        </Button>
                        <Button size="sm" onClick={() => handleWatch(device.socketId, 'camera')}>
                          <ExternalLink className="w-4 h-4 mr-1" />
                          Watch
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ));
          })()
        )}
      </div>
    </div>
  );
}
