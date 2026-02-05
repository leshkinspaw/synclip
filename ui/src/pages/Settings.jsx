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
import { useStatusStore } from "@/store/statusStore";
import { useStatusUI } from "@/hooks/useStatusUI";
import browser from 'webextension-polyfill';
import { Globe, Shield, Edit2, Moon, Sun, Monitor, Clock, Info, ClipboardList, RefreshCcw } from "lucide-react";

export default function Settings() {
  const [serverUrl, setServerUrl] = useState("localhost:3000");
  const [useSsl, setUseSsl] = useState(false);
  const { status, lastError, pollInterval, receiveClipboard, sendClipboard, interfaceMode, fetchStatus, updateStatus } = useStatusStore();
  const { theme, setTheme } = useTheme();
  
  const { getStatusColor, getStatusIcon, getStatusLabel } = useStatusUI(status);

  const [isServerDialogOpen, setIsServerDialogOpen] = useState(false);
  const [editServerUrl, setEditServerUrl] = useState("");
  const [editUseSsl, setEditUseSsl] = useState(false);

  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [editPollInterval, setEditPollInterval] = useState(1);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const data = await getStorageData(['serverUrl', 'useSsl', 'pollInterval', 'receiveClipboard', 'sendClipboard']);
    if (data.serverUrl) setServerUrl(data.serverUrl);
    if (data.useSsl !== undefined) setUseSsl(data.useSsl);
    if (data.pollInterval) setEditPollInterval(data.pollInterval);
    updateStatus({
      receiveClipboard: data.receiveClipboard !== undefined ? data.receiveClipboard : true,
      sendClipboard: data.sendClipboard !== undefined ? data.sendClipboard : true
    });
    fetchStatus();
  };

  const handleToggleReceive = async (val) => {
    await setStorageData({ receiveClipboard: val });
    updateStatus({ receiveClipboard: val });
    await browser.runtime.sendMessage({ type: "UPDATE_CLIPBOARD_SETTINGS", receiveClipboard: val });
  };

  const handleToggleSend = async (val) => {
    await setStorageData({ sendClipboard: val });
    updateStatus({ sendClipboard: val });
    await browser.runtime.sendMessage({ type: "UPDATE_CLIPBOARD_SETTINGS", sendClipboard: val });
  };

  const handleToggleInterface = (val) => {
    // Determine if we are currently in a sidebar or popup
    const params = new URLSearchParams(window.location.search);
    const isSidebar = params.get('view') === 'sidebar';

    // 1. Update state and notify background immediately (non-blocking)
    setStorageData({ interfaceMode: val });
    updateStatus({ interfaceMode: val });
    browser.runtime.sendMessage({ type: "UPDATE_INTERFACE_MODE", interfaceMode: val });

    // 2. Handle the UI opening IMMEDIATELY to preserve user gesture
    if (val === 'sidebar' && !isSidebar) {
      if (window.chrome && chrome.sidePanel && chrome.sidePanel.setOptions && chrome.sidePanel.open) {
        // Ensure side panel is enabled and configured BEFORE opening it
        chrome.sidePanel.setOptions({
          path: 'index.html?view=sidebar',
          enabled: true
        });

        // Use callback to better preserve user gesture context
        chrome.windows.getLastFocused({ windowTypes: ['normal'] }, (currentWindow) => {
          if (currentWindow) {
            chrome.sidePanel.open({ windowId: currentWindow.id }).catch(e => {
              console.error("Side panel open error:", e);
            });
          }
          window.close();
        });
      }
    } else if (val === 'popup' && isSidebar) {
      if (window.chrome && chrome.action && chrome.action.openPopup) {
        // CRITICAL: Ensure popup is configured BEFORE attempting to open it
        // This avoids the race condition with the background script's applyInterfaceMode
        chrome.action.setPopup({ popup: 'index.html' });

        chrome.windows.getLastFocused({ windowTypes: ['normal'] }, (currentWindow) => {
          if (currentWindow) {
            chrome.action.openPopup({ windowId: currentWindow.id }).catch(e => {
              console.error("Popup open error:", e);
            });
          }
          window.close();
        });
      }
    }
  };

  const handleSaveServer = async () => {
    await setStorageData({ serverUrl: editServerUrl, useSsl: editUseSsl });
    setServerUrl(editServerUrl);
    setUseSsl(editUseSsl);
    setIsServerDialogOpen(false);
    await browser.runtime.sendMessage({ type: "RECONNECT" });
    fetchStatus();
  };

  const handleSaveSync = async () => {
    const interval = parseFloat(editPollInterval);
    if (isNaN(interval) || interval <= 0) return;
    
    await setStorageData({ pollInterval: interval });
    updateStatus({ pollInterval: interval });
    setIsSyncDialogOpen(false);
    await browser.runtime.sendMessage({ type: "UPDATE_POLL_INTERVAL", pollInterval: interval });
    fetchStatus();
  };

  const hasSidePanelSupport = !!(window.chrome && chrome.sidePanel && chrome.sidePanel.setOptions);

  return (
    <div className="pr-4 pl-0 py-4 flex flex-col h-full space-y-4 overflow-y-auto">
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
          <div className="flex items-center justify-between">
            <CardDescription>Server used for signaling and relay.</CardDescription>
            {status !== "connecting" && (
              <Button 
                variant="link"
                size="icon"
                className="h-4 w-4 text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  await browser.runtime.sendMessage({ type: "RECONNECT" });
                  fetchStatus();
                }}
                title="Reconnect to Relay Server"
              >
                <RefreshCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
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
                  <DialogTitle>Edit Relay Server</DialogTitle>
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> Clipboard Settings
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[320px]">
                <div className="space-y-2 py-1">
                  <p className="text-xs font-semibold">Why Polling?</p>
                  <p className="text-[11px] leading-relaxed">
                    Browsers do not provide a direct listener for clipboard changes. We periodically check via the Alarms API to detect updates.
                  </p>
                  <p className="text-xs font-semibold mt-2">Chrome Technical Note:</p>
                  <div className="text-[10px] leading-relaxed opacity-90 space-y-1">
                    <p>• In Chrome (unless unpacked), alarms fire at most once every 30 seconds.</p>
                    <p>• Setting an interval &lt; 0.5 minutes (30s) causes a warning and defaults to 30s in production.</p>
                    <p>• Intervals as low as 1s are fully supported in "Unpacked" mode (Developer Mode), offering near-instant sync.</p>
                    <p>• Alarm firings can be arbitrarily delayed. (Before Chrome 120, the limit was 60s).</p>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          <CardDescription>Configure how your clipboard is synced.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 divide-y">
          <div className="flex items-center justify-between pt-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Receive Updates</span>
              <span className="text-[10px] text-muted-foreground">Receive clipboard from other devices</span>
            </div>
            <Switch checked={receiveClipboard} onCheckedChange={handleToggleReceive} />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Send Updates</span>
              <span className="text-[10px] text-muted-foreground">Share this device's clipboard</span>
            </div>
            <Switch checked={sendClipboard} onCheckedChange={handleToggleSend} />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{pollInterval} s</span>
              <span className="text-[10px] text-muted-foreground">Polling interval in seconds</span>
            </div>

            <Dialog open={isSyncDialogOpen} onOpenChange={setIsSyncDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="xs" className="mt-0.5" onClick={() => {
                  setEditPollInterval(pollInterval);
                }}>
                  <Edit2 className="w-4 h-4 mr-2" /> Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Sync Settings</DialogTitle>
                  <DialogDescription>
                    Adjust how frequently the extension checks for clipboard changes.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Polling Interval (seconds)</label>
                    <Input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={editPollInterval}
                        onChange={(e) => setEditPollInterval(e.target.value)}
                        placeholder="e.g. 1.2"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Lower values mean faster sync but higher battery/CPU usage.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSaveSync}>Save changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
        <CardContent className="space-y-4">
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

          {hasSidePanelSupport && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex flex-col">
                <span className="text-sm font-medium">Sidebar Mode</span>
                <span className="text-[10px] text-muted-foreground">Show extension in the side panel</span>
              </div>
              <Switch 
                checked={interfaceMode === 'sidebar'} 
                onCheckedChange={(val) => handleToggleInterface(val ? 'sidebar' : 'popup')} 
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
