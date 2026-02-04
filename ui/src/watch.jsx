import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Monitor, Camera, Loader2, AlertCircle, Maximize2, Minimize2 } from "lucide-react";
import "@/index.css";

function Watch() {
  const [stream, setStream] = useState(null);
  const [type, setType] = useState(null);
  const [targetId, setTargetId] = useState(null);
  const [isObs, setIsObs] = useState(false);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pcRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const streamType = params.get('type');
    const target = params.get('targetId');
    const obs = params.get('obs') === 'true';

    setType(streamType);
    setTargetId(target);
    setIsObs(obs);

    if (target && streamType) {
      startWatching(target, streamType);
    } else {
      setError("Invalid parameters");
    }

    const messageListener = (message) => {
      if (message.type === "SIGNAL" && message.from === target && message.streamType === streamType) {
        handleSignal(message.signal);
      } else if (message.type === "ROOM_STATUS_UPDATED") {
        const targetDevice = message.devices.find(d => d.socketId === target);
        if (!targetDevice || !targetDevice.sharing?.[streamType]) {
          setError("Stream ended");
          stopWatching();
        }
      }
    };

    browser.runtime.onMessage.addListener(messageListener);

    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
      stopWatching();
    };
  }, []);

  const startWatching = async (target, streamType) => {
    try {
      console.log(`Starting to watch ${streamType} from ${target}`);
      const status = await browser.runtime.sendMessage({ type: "GET_STATUS" });
      const deviceName = status.deviceName || "Viewer";

      browser.runtime.sendMessage({
        type: "JOIN_WATCH",
        targetSocketId: target,
        streamType,
        deviceName
      });

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      // Add transceivers to express intent to receive
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        console.log("Track received:", event.track.kind);
        if (event.streams && event.streams[0]) {
          setStream(event.streams[0]);
        } else {
          setStream(new MediaStream([event.track]));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          browser.runtime.sendMessage({
            type: "SIGNAL",
            to: target,
            signal: event.candidate,
            streamType
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          setError("Connection failed. Please try again.");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      browser.runtime.sendMessage({
        type: "SIGNAL",
        to: target,
        signal: pc.localDescription,
        streamType
      });

    } catch (err) {
      console.error("Failed to start watching:", err);
      setError("Failed to connect: " + err.message);
    }
  };

  const handleSignal = async (signal) => {
    if (!pcRef.current) return;

    try {
      if (signal.type === 'answer') {
        console.log("Received answer");
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
        
        // Process any candidates that arrived before the answer
        while (pendingCandidatesRef.current.length > 0) {
          const candidate = pendingCandidatesRef.current.shift();
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } else if (signal.candidate) {
        if (pcRef.current.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(signal));
        } else {
          pendingCandidatesRef.current.push(signal);
        }
      }
    } catch (err) {
      console.error("Error handling signal:", err);
    }
  };

  const stopWatching = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    const params = new URLSearchParams(window.location.search);
    const finalTargetId = params.get('targetId');
    const finalType = params.get('type');
    
    if (finalTargetId && finalType) {
      browser.runtime.sendMessage({
        type: "LEAVE_WATCH",
        targetSocketId: finalTargetId,
        streamType: finalType
      }).catch(() => {});
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-4">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h1 className="text-xl font-bold">{error}</h1>
        <p className="text-muted-foreground mt-2 text-center max-w-xs">The stream might have ended or there was a connection problem.</p>
      </div>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="synclip-theme">
      <div className="h-screen w-screen bg-black flex items-center justify-center overflow-hidden">
        {stream ? (
          <video 
            autoPlay 
            playsInline 
            ref={el => { if (el) el.srcObject = stream; }}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-white">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm font-medium">Connecting to {type === 'screen' ? 'screenshare' : 'camera'}...</p>
          </div>
        )}

        {!isObs && (
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              className="bg-black/50 backdrop-blur-md text-white border-white/10 hover:bg-white/10 h-8 w-8"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <div className="bg-black/50 backdrop-blur-md p-2 h-8 rounded-lg border border-white/10 flex items-center gap-2 text-white">
              {type === 'screen' ? <Monitor className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
              <span className="text-xs font-medium uppercase tracking-wider">{type === 'screen' ? 'Screenshare' : 'Camera'}</span>
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<Watch />);
