import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { getStorageData, setStorageData } from "@/lib/storage";
import { generateSeedPhrase, validateSeedPhrase } from "@/lib/crypto";
import { Globe, Shield, Key, Wifi, WifiOff, RefreshCcw, AlertCircle, Edit2, Moon, Sun, Monitor } from "lucide-react";

export default function Settings() {
  const [serverUrl, setServerUrl] = useState("localhost:3000");
  const [useSsl, setUseSsl] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState("");
  const [status, setStatus] = useState("disconnected");
  const [lastError, setLastError] = useState("");
  const [error, setError] = useState("");
  const { theme, setTheme } = useTheme();
  
  const [isServerDialogOpen, setIsServerDialogOpen] = useState(false);
  const [editServerUrl, setEditServerUrl] = useState("");
  const [editUseSsl, setEditUseSsl] = useState(false);

  useEffect(() => {
    loadSettings();
    const interval = setInterval(updateStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    const data = await getStorageData(['serverUrl', 'useSsl', 'seedPhrase']);
    if (data.serverUrl) setServerUrl(data.serverUrl);
    if (data.useSsl !== undefined) setUseSsl(data.useSsl);
    if (data.seedPhrase) setSeedPhrase(data.seedPhrase);
    updateStatus();
  };

  const updateStatus = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
        if (response) {
          setStatus(response.connectionStatus);
          setLastError(response.lastError || "");
        }
      });
    }
  };

  const handleSaveServer = async () => {
    await setStorageData({ serverUrl: editServerUrl, useSsl: editUseSsl });
    setServerUrl(editServerUrl);
    setUseSsl(editUseSsl);
    setIsServerDialogOpen(false);
    chrome.runtime.sendMessage({ type: "RECONNECT" });
  };

  const handleSaveSeed = async () => {
    setError("");
    if (!validateSeedPhrase(seedPhrase)) {
      setError("Please enter a valid 12 or 24 word mnemonic.");
      return;
    }
    await setStorageData({ seedPhrase });
    chrome.runtime.sendMessage({ type: "RECONNECT" });
  };

  const handleGenerate = () => {
    const newSeed = generateSeedPhrase();
    setSeedPhrase(newSeed);
    setError("");
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
    <div className="p-4 flex flex-col h-full space-y-4 overflow-y-auto">
      <Card className="shrink-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="w-5 h-5" /> Relay Server
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-1 text-xs font-medium cursor-default ${getStatusColor()}`}>
                  {getStatusIcon()}
                  {status.toUpperCase()}
                </div>
              </TooltipTrigger>
              {status === "error" && lastError && (
                <TooltipContent>
                  <p className="text-xs">{lastError}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
          <CardDescription>Server used for signaling and relay.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{serverUrl}</span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                {useSsl ? <Shield className="w-2 h-2" /> : null}
                {useSsl ? "SSL Enabled" : "No SSL"}
              </span>
            </div>
            
            <Dialog open={isServerDialogOpen} onOpenChange={setIsServerDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => {
                  setEditServerUrl(serverUrl);
                  setEditUseSsl(useSsl);
                }}>
                  <Edit2 className="w-4 h-4 mr-2" /> Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Edit Middle Server</DialogTitle>
                  <DialogDescription>
                    Configure the server used for signaling and data relay.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Server Address</label>
                    <Input 
                      value={editServerUrl} 
                      onChange={(e) => setEditServerUrl(e.target.value)} 
                      placeholder="e.g. localhost:3000"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-muted-foreground" />
                      <label className="text-sm font-medium">Use SSL</label>
                    </div>
                    <Switch 
                      checked={editUseSsl} 
                      onCheckedChange={setEditUseSsl} 
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSaveServer}>Save changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
          <div className="space-y-2">
            <textarea 
              className={`w-full min-h-[80px] p-2 text-sm border rounded-md bg-muted/30 focus:outline-none focus:ring-1 focus:ring-ring ${error ? 'border-destructive' : ''}`}
              value={seedPhrase} 
              onChange={(e) => {
                  setSeedPhrase(e.target.value);
                  if (error) setError("");
              }} 
              placeholder="Enter your 12-word seed phrase..."
            />
            {error && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                    <AlertCircle className="w-3 h-3" />
                    {error}
                </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerate} className="flex-1 text-xs">Generate New</Button>
            <Button onClick={handleSaveSeed} className="flex-1 text-xs">Save & Sync</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shrink-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Monitor className="w-5 h-5" /> Appearance
          </CardTitle>
          <CardDescription>Customize the look and feel of the extension.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Theme</span>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4" /> Light
                  </div>
                </SelectItem>
                <SelectItem value="dark">
                  <div className="flex items-center gap-2">
                    <Moon className="w-4 h-4" /> Dark
                  </div>
                </SelectItem>
                <SelectItem value="system">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4" /> System
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
