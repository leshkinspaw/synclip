import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getStorageData, setStorageData } from "@/lib/storage";
import { Laptop, Monitor, Trash2, Send, CheckCircle2, XCircle, LogOut, RefreshCcw, Edit2, Wifi, WifiOff } from "lucide-react";

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [myId, setMyId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [editName, setEditName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [status, setStatus] = useState("disconnected");
  const [lastError, setLastError] = useState("");
  const [pings, setPings] = useState({}); // socketId -> status

  useEffect(() => {
    loadMyData();
    updateDevices();
    
    const interval = setInterval(updateDevices, 3000);
    
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const listener = (message) => {
        if (message.type === "ROOM_STATUS_UPDATED") {
          setDevices(message.devices);
        } else if (message.type === "PONG_RECEIVED") {
          setPings(prev => ({ ...prev, [message.fromSocketId]: 'success' }));
          setTimeout(() => {
            setPings(prev => ({ ...prev, [message.fromSocketId]: null }));
          }, 3000);
        } else if (message.type === "EXCLUDED") {
            window.location.reload();
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => {
        clearInterval(interval);
        chrome.runtime.onMessage.removeListener(listener);
      };
    }
    return () => clearInterval(interval);
  }, []);

  const loadMyData = async () => {
    const data = await getStorageData(['deviceName']);
    if (data.deviceName) setDeviceName(data.deviceName);
  };

  const updateDevices = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
        if (response) {
          setDevices(response.roomDevices || []);
          setMyId(response.socketId);
          setStatus(response.connectionStatus);
          setLastError(response.lastError || "");
          if (!deviceName && response.deviceName) setDeviceName(response.deviceName);
        }
      });
    }
  };

  const handleUpdateName = async () => {
    if (!editName.trim()) return;
    await setStorageData({ deviceName: editName });
    setDeviceName(editName);
    setIsDialogOpen(false);
    chrome.runtime.sendMessage({ type: "RECONNECT" });
  };

  const handleLeaveGroup = () => {
    if (confirm("Are you sure you want to leave the sync group? This will clear your seed phrase.")) {
      chrome.runtime.sendMessage({ type: "LEAVE_GROUP" }, () => {
        window.location.reload();
      });
    }
  };

  const handleExclude = (socketId, name) => {
    if (confirm(`Are you sure you want to exclude "${name}"?`)) {
      chrome.runtime.sendMessage({ type: "EXCLUDE_DEVICE", socketId });
    }
  };

  const handlePing = (socketId) => {
    setPings(prev => ({ ...prev, [socketId]: 'pending' }));
    chrome.runtime.sendMessage({ type: "PING_DEVICE", socketId });
    
    // Timeout ping
    setTimeout(() => {
      setPings(prev => {
        if (prev[socketId] === 'pending') {
          return { ...prev, [socketId]: 'timeout' };
        }
        return prev;
      });
    }, 5000);
  };

  const getStatusColor = () => {
    switch (status) {
      case "connected": return "text-green-500";
      case "connecting": return "text-yellow-500";
      case "error": return "text-red-500";
      default: return "text-gray-500";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "connected": return <Wifi className="w-4 h-4" />;
      case "connecting": return <RefreshCcw className="w-4 h-4 animate-spin" />;
      default: return <WifiOff className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-4 flex flex-col h-full space-y-4 overflow-hidden">
      <Card className="shrink-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Laptop className="w-5 h-5" /> This Device
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-1 text-xs font-medium cursor-default ${getStatusColor()}`}>
                  {getStatusIcon()}
                  {status === "no_seed" ? "NO SEED" : status.toUpperCase()}
                </div>
              </TooltipTrigger>
              {status === "error" && lastError && (
                <TooltipContent>
                  <p className="text-xs">{lastError}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
          <CardDescription>How this device appears to others.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{deviceName || "Unnamed Device"}</span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {status === "connecting" ? "Connecting..." : (myId || "Disconnected")}
              </span>
            </div>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setEditName(deviceName)}>
                  <Edit2 className="w-4 h-4 mr-2" /> Rename
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Rename Device</DialogTitle>
                  <DialogDescription>
                    Change how this device appears to others in the sync group.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. MacBook Pro"
                  />
                </div>
                <DialogFooter>
                  <Button onClick={handleUpdateName}>Save changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Button onClick={handleLeaveGroup} variant="destructive" className="w-full gap-2" size="sm">
            <LogOut className="w-4 h-4" /> Leave Sync Group
          </Button>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <Monitor className="w-5 h-5" /> Connected Devices
          </CardTitle>
          <CardDescription>{devices.length} device(s) in group</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto min-h-0 no-scrollbar">
          <div className="space-y-4 pr-1">
            {devices.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No other devices online.</p>
            )}
            {devices.map((device) => (
              <div key={device.socketId} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                <div className="flex flex-col">
                  <span className="text-sm font-medium flex items-center gap-2">
                    {device.deviceName}
                    {device.socketId === myId && <span className="text-[10px] bg-primary text-primary-foreground px-1 rounded">YOU</span>}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">{device.socketId}</span>
                </div>
                
                {device.socketId !== myId && (
                  <div className="flex gap-1">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8" 
                        onClick={() => handlePing(device.socketId)}
                        title="Check Connection"
                    >
                      {pings[device.socketId] === 'pending' ? <RefreshCcw className="w-4 h-4 animate-spin" /> :
                       pings[device.socketId] === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-500" /> :
                       pings[device.socketId] === 'timeout' ? <XCircle className="w-4 h-4 text-red-500" /> :
                       <Send className="w-4 h-4" />}
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive" 
                        onClick={() => handleExclude(device.socketId, device.deviceName)}
                        title="Exclude Device"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
