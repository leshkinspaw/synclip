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
import { generateSeedPhrase, validateSeedPhrase } from "@/lib/crypto";
import { useStatusStore } from "@/store/statusStore";
import { useStatusUI } from "@/hooks/useStatusUI";
import browser from 'webextension-polyfill';
import {
  Laptop,
  Monitor,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  LogOut,
  RefreshCcw,
  Edit2,
  Copy,
  Check,
  Key,
  AlertCircle
} from "lucide-react";

export default function Devices() {
  const { 
    devices, status, lastError, myId, deviceName, 
    fetchStatus, updateStatus 
  } = useStatusStore();

  const { getStatusColor, getStatusIcon, getStatusLabel } = useStatusUI(status);

  const [editName, setEditName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pings, setPings] = useState({}); // socketId -> status
  const [seedPhrase, setSeedPhrase] = useState("");
  const [error, setError] = useState("");
  const [isSeedDialogOpen, setIsSeedDialogOpen] = useState(false);
  const [editSeedPhrase, setEditSeedPhrase] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const formatSeed = (phrase, maxWords = 6) =>
      phrase?.trim()
          ?.split(/\s+/)
          .slice(0, maxWords)
          .join(" ") || "";

  useEffect(() => {
    loadMyData();
    fetchStatus();
    
    const listener = (message) => {
      if (message.type === "PONG_RECEIVED") {
        setPings(prev => ({ ...prev, [message.fromSocketId]: 'success' }));
        setTimeout(() => {
          setPings(prev => ({ ...prev, [message.fromSocketId]: null }));
        }, 3000);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, [fetchStatus]);

  const loadMyData = async () => {
    const data = await getStorageData(['deviceName', 'seedPhrase']);
    if (data.deviceName) updateStatus({ deviceName: data.deviceName });
    if (data.seedPhrase) setSeedPhrase(data.seedPhrase);
  };

  const handleUpdateName = async () => {
    if (!editName.trim()) return;
    await setStorageData({ deviceName: editName });
    updateStatus({ deviceName: editName });
    setIsDialogOpen(false);
    await browser.runtime.sendMessage({ type: "RECONNECT" });
    fetchStatus();
  };

  const handleLeaveGroup = async () => {
    if (confirm("Are you sure you want to leave the sync group? This will clear your seed phrase and disconnect you.")) {
      await browser.runtime.sendMessage({ type: "LEAVE_GROUP" });
      window.location.reload();
    }
  };

  const handleExclude = (socketId, deviceName) => {
    if (confirm(`Are you sure you want to exclude "${deviceName}" from the sync group?`)) {
      browser.runtime.sendMessage({ type: "EXCLUDE_DEVICE", socketId });
    }
  };

  const handlePing = (socketId) => {
    setPings(prev => ({ ...prev, [socketId]: 'pending' }));
    browser.runtime.sendMessage({ type: "PING_DEVICE", socketId });
    
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

  const handleSaveSeed = async () => {
    setError("");
    if (!validateSeedPhrase(editSeedPhrase)) {
      setError("Please enter a valid 12 or 24 word mnemonic.");
      return;
    }
    await setStorageData({ seedPhrase: editSeedPhrase });
    setSeedPhrase(editSeedPhrase);
    setIsSeedDialogOpen(false);
    await browser.runtime.sendMessage({ type: "RECONNECT" });
    fetchStatus();
  };

  const handleGenerate = () => {
    const newSeed = generateSeedPhrase();
    setEditSeedPhrase(newSeed);
    setError("");
  };

  const handleCopySeed = () => {
    if (!seedPhrase) return;
    navigator.clipboard.writeText(seedPhrase).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div className="pr-4 py-4 flex flex-col h-full space-y-4 overflow-y-auto">
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
                  {getStatusLabel()}
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
        </CardContent>
      </Card>

      <Card className="shrink-0">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <Monitor className="w-5 h-5" /> Connected Devices
          </CardTitle>
          <CardDescription>{devices.length} device(s) in group</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {devices.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No other devices online.</p>
            )}
            {devices.map((device) => (
              <div key={device.socketId} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                <div className="flex flex-col">
                  <span className="text-sm font-medium flex items-center gap-2">
                    {device.deviceName}
                    {device.socketId === myId && <span className="text-[10px] bg-primary text-primary-foreground px-1 rounded">THIS DEVICE</span>}
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
                       pings[device.socketId] === 'success' ? <CheckCircle2 className="w-4 h-4 text-success" /> :
                       pings[device.socketId] === 'timeout' ? <XCircle className="w-4 h-4 text-destructive" /> :
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

      <Card className="shrink-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="w-5 h-5" /> Sync Group
          </CardTitle>
          <CardDescription>All devices must share the same seed phrase.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
            <div className="flex flex-col min-w-0 mr-4">
              <span className="text-sm font-medium truncate">{formatSeed(seedPhrase)}</span>
              <span className="text-[10px] text-muted-foreground">24-word sync key</span>
            </div>

            <div className="flex gap-2">
              <Dialog open={isSeedDialogOpen} onOpenChange={(open) => {
                setIsSeedDialogOpen(open);
                if (open) {
                  setEditSeedPhrase(seedPhrase);
                  setError("");
                }
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Edit2 className="w-4 h-4 mr-1" /> {seedPhrase ? "Edit" : "Add"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Sync Group Settings</DialogTitle>
                    <DialogDescription>
                      Enter your seed phrase to join a sync group.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <textarea
                          className={`w-full min-h-[100px] max-h-[200px] p-2 text-sm border rounded-md bg-muted/30 focus:outline-none focus:ring-1 focus:ring-ring ${error ? 'border-destructive' : ''}`}
                          value={editSeedPhrase}
                          onChange={(e) => {
                            setEditSeedPhrase(e.target.value);
                            if (error) setError("");
                          }}
                          placeholder="Enter your seed phrase..."
                      />
                      {error && (
                          <div className="flex items-center gap-2 text-xs text-destructive">
                            <AlertCircle className="w-3 h-3" />
                            {error}
                          </div>
                      )}
                    </div>
                  </div>
                  <DialogFooter className="flex flex-row gap-2 sm:justify-between">
                    <Button variant="outline" onClick={handleGenerate} className="flex-1 text-xs">Generate New</Button>
                    <Button onClick={handleSaveSeed} className="flex-1 text-xs">Save & Sync</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                  variant="outline"
                  size="sm"
                  title="copy seed phrase"
                  onClick={handleCopySeed}
              >
                {isCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <Button
            onClick={handleLeaveGroup}
            variant="destructive"
            className="w-full gap-2"
            size="sm"
            disabled={!seedPhrase}
          >
            <LogOut className="w-4 h-4" /> Leave Sync Group
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
