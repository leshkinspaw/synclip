import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { ThemeProvider } from "@/components/theme-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StopCircle, Monitor, Camera, X, Eye } from "lucide-react";
import "@/index.css";

function ShareStream() {
  const [streams, setStreams] = useState({ screen: null, camera: null });
  const [monitors, setMonitors] = useState([]);
  const [isWindow, setIsWindow] = useState(false);
  const peersRef = useRef({}); // "socketId-streamType" -> RTCPeerConnection
  const pendingCandidatesRef = useRef({}); // "socketId-streamType" -> [candidates]
  const streamsRef = useRef({ screen: null, camera: null });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialType = params.get('type');
    setIsWindow(params.get('view') === 'window');
    
    if (initialType === 'screen' || initialType === 'camera') {
      startStreaming(initialType);
    }

    const messageListener = (message) => {
      if (message.type === "SIGNAL") {
        handleSignal(message.from, message.signal, message.streamType);
      } else if (message.type === "STOP_SHARE_LOCAL") {
        stopStreaming(message.streamType, true);
        if (message.fromExtension && !streamsRef.current.screen && !streamsRef.current.camera) {
          window.close();
        }
      } else if (message.type === "ROOM_STATUS_UPDATED") {
        updateMonitors(message.devices, message.socketId);
      } else if (message.type === "START_SHARE_FROM_POPUP") {
        startStreaming(message.streamType);
      }
    };

    browser.runtime.onMessage.addListener(messageListener);

    // Initial monitor check
    browser.runtime.sendMessage({ type: "GET_STATUS" }).then(status => {
      if (status && status.roomDevices) {
        updateMonitors(status.roomDevices, status.socketId);
      }
    });

    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
      // Stop everything on unmount
      if (streamsRef.current.screen) stopStreaming('screen');
      if (streamsRef.current.camera) stopStreaming('camera');
    };
  }, []);

  const updateMonitors = (devices, myIdFromMessage) => {
    const handleMyId = (myId) => {
      const me = devices.find(d => d.socketId === myId);
      if (me?.monitors) {
        setMonitors(me.monitors);
      }
    };

    if (myIdFromMessage) {
      handleMyId(myIdFromMessage);
    } else {
      browser.runtime.sendMessage({ type: "GET_STATUS" }).then(status => {
        if (status?.socketId) handleMyId(status.socketId);
      });
    }
  };

  const startStreaming = async (streamType) => {
    if (streamsRef.current[streamType]) return;

    try {
      let mediaStream;
      if (streamType === 'screen') {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: true
        });
      } else {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }

      setStreams(prev => ({ ...prev, [streamType]: mediaStream }));
      streamsRef.current[streamType] = mediaStream;

      mediaStream.getVideoTracks()[0].onended = () => {
        stopStreaming(streamType);
      };

      browser.runtime.sendMessage({ type: "START_SHARE", streamType });
    } catch (err) {
      console.error(`Error starting ${streamType} stream:`, err);
    }
  };

  const stopStreaming = (streamType, skipNotify = false) => {
    let changed = false;

    if (streamsRef.current[streamType]) {
      streamsRef.current[streamType].getTracks().forEach(track => track.stop());
      streamsRef.current[streamType] = null;
      setStreams(prev => ({ ...prev, [streamType]: null }));
      changed = true;
    }
    
    // Close connections for this stream type
    Object.keys(peersRef.current).forEach(key => {
      if (key.endsWith(`-${streamType}`)) {
        peersRef.current[key].close();
        delete peersRef.current[key];
        delete pendingCandidatesRef.current[key];
        changed = true;
      }
    });

    if (changed && !skipNotify) {
      browser.runtime.sendMessage({ type: "STOP_SHARE", streamType });
    }
  };

  const handleSignal = async (fromId, signal, sType) => {
    const key = `${fromId}-${sType}`;
    try {
      if (signal.type === 'offer') {
        console.log(`Received ${sType} offer from ${fromId}`);
        const pc = createPeerConnection(fromId, sType);
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        browser.runtime.sendMessage({
          type: "SIGNAL",
          to: fromId,
          signal: pc.localDescription,
          streamType: sType
        });

        if (pendingCandidatesRef.current[key]) {
          while (pendingCandidatesRef.current[key].length > 0) {
            const candidate = pendingCandidatesRef.current[key].shift();
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }
      } else if (signal.candidate) {
        const pc = peersRef.current[key];
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal));
        } else {
          if (!pendingCandidatesRef.current[key]) {
            pendingCandidatesRef.current[key] = [];
          }
          pendingCandidatesRef.current[key].push(signal);
        }
      }
    } catch (err) {
      console.error(`Error handling ${sType} signal from ${fromId}:`, err);
    }
  };

  const createPeerConnection = (socketId, sType) => {
    const key = `${socketId}-${sType}`;
    if (peersRef.current[key]) {
      peersRef.current[key].close();
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peersRef.current[key] = pc;

    const stream = streamsRef.current[sType];
    if (stream) {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        browser.runtime.sendMessage({
          type: "SIGNAL",
          to: socketId,
          signal: event.candidate,
          streamType: sType
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE Connection State for ${key}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        delete peersRef.current[key];
        delete pendingCandidatesRef.current[key];
      }
    };

    return pc;
  };

  const groupedMonitors = monitors.reduce((acc, m) => {
    if (!acc[m.socketId]) {
      acc[m.socketId] = { deviceName: m.deviceName, types: [] };
    }
    acc[m.socketId].types.push(m.type);
    return acc;
  }, {});

  const activeCount = Object.keys(groupedMonitors).length;

  const renderContent = () => (
    <>
      <div className="flex flex-wrap gap-4">
        {/* Screen Preview */}
        <div className="space-y-2 flex-1 min-w-36 max-w-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Screen
            </h4>
            {streams.screen && (
              <Button variant="destructive" size="xs" className="h-7 px-2 text-[10px]" onClick={() => stopStreaming('screen')}>
                Stop
              </Button>
            )}
          </div>
          <div className="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center border relative">
            {streams.screen ? (
              <video 
                autoPlay 
                muted 
                playsInline 
                ref={el => { if (el) el.srcObject = streams.screen; }}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Monitor className="w-8 h-8 opacity-20" />
                <Button variant="outline" size="sm" onClick={() => startStreaming('screen')}>Start sharing</Button>
              </div>
            )}
          </div>
        </div>

        {/* Camera Preview */}
        <div className="space-y-2 flex-1 min-w-36 max-w-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Camera className="w-4 h-4" /> Camera
            </h4>
            {streams.camera && (
              <Button variant="destructive" size="xs" className="h-7 px-2 text-[10px]" onClick={() => stopStreaming('camera')}>
                Stop
              </Button>
            )}
          </div>
          <div className="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center border relative">
            {streams.camera ? (
              <video 
                autoPlay 
                muted 
                playsInline 
                ref={el => { if (el) el.srcObject = streams.camera; }}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Camera className="w-8 h-8 opacity-20" />
                <Button variant="outline" size="sm" onClick={() => startStreaming('camera')}>Start camera</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t">
        <h4 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <Eye className="w-4 h-4" />
          Watchers ({activeCount})
        </h4>
        <div className="flex flex-wrap gap-3 min-h-[50px] p-3 bg-secondary/20 rounded-xl border border-border/50">
          {activeCount === 0 ? (
            <p className="text-xs text-muted-foreground italic self-center w-full text-center">No other devices are watching yet</p>
          ) : (
            Object.entries(groupedMonitors).map(([socketId, data]) => (
              <div key={socketId} className="flex items-center gap-2 bg-background border rounded-full pl-3 pr-2 py-1 shadow-sm">
                <span className="text-xs font-medium">{data.deviceName}</span>
                <div className="flex gap-1 border-l pl-2 ml-1">
                  {data.types.includes('screen') && (
                    <Monitor className="w-3 h-3 text-primary" />
                  )}
                  {data.types.includes('camera') && (
                    <Camera className="w-3 h-3 text-primary" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      <p className="text-[10px] text-center text-muted-foreground italic">
        Keep this tab open to continue sharing. You can share both screen and camera at the same time.
      </p>
    </>
  );

  return (
    <ThemeProvider defaultTheme="dark" storageKey="synclip-theme">
      <div className={cn(
        "bg-background text-foreground flex items-center justify-center",
        isWindow ? "min-h-0 p-2" : "min-h-screen p-4"
      )}>
        {isWindow ? (
          <div className="w-full space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                Device Broadcast
              </h1>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => window.close()}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            {renderContent()}
          </div>
        ) : (
          <Card className="w-full max-w-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                Device Broadcast
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => window.close()}>
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderContent()}
            </CardContent>
          </Card>
        )}
      </div>
    </ThemeProvider>
  );
}

function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}

const root = createRoot(document.getElementById('root'));
root.render(<ShareStream />);
