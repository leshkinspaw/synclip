import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { ThemeProvider } from "@/components/theme-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StopCircle, Users, Monitor, Camera } from "lucide-react";
import "@/index.css";

function ShareStream() {
  const [stream, setStream] = useState(null);
  const [type, setType] = useState(null);
  const [monitors, setMonitors] = useState([]);
  const peersRef = useRef({}); // socketId -> RTCPeerConnection
  const pendingCandidatesRef = useRef({}); // socketId -> [candidates]
  const streamRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const streamType = params.get('type') || 'screen';
    setType(streamType);

    startStreaming(streamType);

    const messageListener = (message) => {
      if (message.type === "SIGNAL" && message.streamType === streamType) {
        handleSignal(message.from, message.signal, streamType);
      } else if (message.type === "STOP_SHARE_LOCAL" && message.streamType === streamType) {
        stopStreaming();
      } else if (message.type === "ROOM_STATUS_UPDATED") {
        updateMonitors(message.devices);
      }
    };

    browser.runtime.onMessage.addListener(messageListener);

    // Initial monitor check
    browser.runtime.sendMessage({ type: "GET_STATUS" }).then(status => {
      if (status && status.roomDevices) {
        updateMonitors(status.roomDevices);
      }
    });

    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
      stopStreaming();
    };
  }, []);

  const updateMonitors = (devices) => {
    const sType = new URLSearchParams(window.location.search).get('type') || 'screen';
    browser.runtime.sendMessage({ type: "GET_STATUS" }).then(status => {
      const myId = status?.socketId;
      const me = devices.find(d => d.socketId === myId);
      if (me?.monitors) {
        setMonitors(me.monitors.filter(m => m.type === sType));
      }
    });
  };

  const startStreaming = async (streamType) => {
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

      setStream(mediaStream);
      streamRef.current = mediaStream;

      mediaStream.getVideoTracks()[0].onended = () => {
        stopStreaming();
      };

      browser.runtime.sendMessage({ type: "START_SHARE", streamType });
    } catch (err) {
      console.error("Error starting stream:", err);
      window.close();
    }
  };

  const stopStreaming = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    const sType = new URLSearchParams(window.location.search).get('type') || 'screen';
    browser.runtime.sendMessage({ type: "STOP_SHARE", streamType: sType });
    
    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};
    pendingCandidatesRef.current = {};
    
    try {
      window.close();
    } catch (e) {}
  };

  const handleSignal = async (fromId, signal, sType) => {
    try {
      const finalType = sType || type;
      if (signal.type === 'offer') {
        console.log(`Received offer from ${fromId}`);
        const pc = createPeerConnection(fromId, finalType);
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        browser.runtime.sendMessage({
          type: "SIGNAL",
          to: fromId,
          signal: pc.localDescription,
          streamType: finalType
        });

        // Process pending candidates
        if (pendingCandidatesRef.current[fromId]) {
          while (pendingCandidatesRef.current[fromId].length > 0) {
            const candidate = pendingCandidatesRef.current[fromId].shift();
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }
      } else if (signal.candidate) {
        const pc = peersRef.current[fromId];
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal));
        } else {
          if (!pendingCandidatesRef.current[fromId]) {
            pendingCandidatesRef.current[fromId] = [];
          }
          pendingCandidatesRef.current[fromId].push(signal);
        }
      }
    } catch (err) {
      console.error(`Error handling signal from ${fromId}:`, err);
    }
  };

  const createPeerConnection = (socketId, sType) => {
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].close();
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peersRef.current[socketId] = pc;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, streamRef.current);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        browser.runtime.sendMessage({
          type: "SIGNAL",
          to: socketId,
          signal: event.candidate,
          streamType: sType || type
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE Connection State for ${socketId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        delete peersRef.current[socketId];
        delete pendingCandidatesRef.current[socketId];
      }
    };

    return pc;
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="synclip-theme">
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {type === 'screen' ? <Monitor className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
              {type === 'screen' ? 'Sharing Screen' : 'Sharing Camera'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center border">
              {stream ? (
                <video 
                  autoPlay 
                  muted 
                  playsInline 
                  ref={el => { if (el) el.srcObject = stream; }}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="animate-pulse flex flex-col items-center gap-2">
                  <div className="w-12 h-12 bg-primary/20 rounded-full" />
                  <p className="text-sm text-muted-foreground">Initializing stream...</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Monitors ({monitors.length})
              </h4>
              <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-secondary/30 rounded-md">
                {monitors.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No one is watching yet</p>
                ) : (
                  monitors.map((m, idx) => (
                    <span key={idx} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full border border-primary/20">
                      {m.deviceName}
                    </span>
                  ))
                )}
              </div>
            </div>

            <Button variant="destructive" className="w-full" onClick={stopStreaming}>
              <StopCircle className="w-4 h-4 mr-2" />
              Stop Sharing
            </Button>
            
            <p className="text-[10px] text-center text-muted-foreground italic">
              Keep this tab open to continue sharing.
            </p>
          </CardContent>
        </Card>
      </div>
    </ThemeProvider>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<ShareStream />);
