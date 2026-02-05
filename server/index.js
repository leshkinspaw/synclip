const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const allRooms = io.sockets.adapter.rooms;
  let roomCount = 0;
  for (const [name, set] of allRooms) {
    if (!io.sockets.sockets.has(name)) {
      roomCount++;
    }
  }
  res.status(200).json({ status: 'ok', rooms: roomCount });
});

app.get('/obs', (req, res) => {
  res.sendFile(path.join(__dirname, 'obs.html'));
});

async function broadcastRoomStatus(room) {
  const sockets = await io.in(room).fetchSockets();
  const devices = sockets.map(s => ({
    socketId: s.id,
    deviceName: s.data.deviceName || 'Unknown Device',
    sharing: s.data.sharing || { screen: false, camera: false },
    monitors: []
  }));

  // Reconstruct monitors list
  sockets.forEach(s => {
    if (s.data.watching) {
      s.data.watching.forEach(w => {
        const target = devices.find(d => d.socketId === w.targetSocketId);
        if (target) {
          target.monitors.push({
            socketId: s.id,
            deviceName: s.data.deviceName,
            type: w.streamType
          });
        }
      });
    }
  });

  io.to(room).emit('room_status', devices);
}

function log(...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}]`, ...args);
}

io.on('connection', (socket) => {
  log('a user connected:', socket.id);
  let currentRoom = null;

  socket.on('join', async (data) => {
    if (!data || !data.room) {
      log('Join attempt without room info');
      return;
    }
    const { room, deviceName } = data;
    await socket.join(room);
    currentRoom = room;
    
    socket.data.deviceName = deviceName || 'Unknown Device';
    socket.data.sharing = { screen: false, camera: false };
    socket.data.watching = [];
    
    log(`User ${socket.id} (${deviceName}) joined room: ${room}`);
    await broadcastRoomStatus(room);
  });

  socket.on('start_share', async (data) => {
    if (!currentRoom || !data || !data.type) return;
    const { type } = data; // 'screen' or 'camera'
    
    if (!socket.data.sharing) socket.data.sharing = { screen: false, camera: false };
    socket.data.sharing[type] = true;
    
    log(`User ${socket.id} started sharing ${type} in room: ${currentRoom}`);
    await broadcastRoomStatus(currentRoom);
  });

  socket.on('stop_share', async (data) => {
    if (!currentRoom || !data || !data.type) return;
    const { type } = data;
    
    if (!socket.data.sharing) socket.data.sharing = { screen: false, camera: false };
    socket.data.sharing[type] = false;
    
    // Also remove any of our "watching" that were for this type? 
    // Wait, stop_share means THIS device stops sharing. 
    // Monitors are OTHER devices watching THIS device.
    // Reconstructing monitors will naturally handle this because sharing[type] is now false.
    
    log(`User ${socket.id} stopped sharing ${type} in room: ${currentRoom}`);
    await broadcastRoomStatus(currentRoom);
  });

  socket.on('signal', (data) => {
    if (!data || !data.to) return;
    // data: { to, from, signal, streamType }
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal,
      streamType: data.streamType
    });
  });

  socket.on('join_watch', async (data) => {
    if (!currentRoom || !data || !data.targetSocketId || !data.streamType) return;
    const { targetSocketId, streamType } = data;
    
    if (!socket.data.watching) socket.data.watching = [];
    
    // Add to watching if not already there
    if (!socket.data.watching.find(w => w.targetSocketId === targetSocketId && w.streamType === streamType)) {
      socket.data.watching.push({ targetSocketId, streamType });
      await broadcastRoomStatus(currentRoom);
    }
  });

  socket.on('leave_watch', async (data) => {
    if (!currentRoom || !data || !data.targetSocketId || !data.streamType) return;
    const { targetSocketId, streamType } = data;
    
    if (socket.data.watching) {
      socket.data.watching = socket.data.watching.filter(w => !(w.targetSocketId === targetSocketId && w.streamType === streamType));
      await broadcastRoomStatus(currentRoom);
    }
  });

  socket.on('clipboard_update', (data) => {
    if (!data || !data.room || !data.encryptedData) return;
    const { room, encryptedData } = data;
    socket.to(room).emit('clipboard_update', encryptedData);
  });

  socket.on('exclude_device', async (data) => {
    if (!data || !data.room || !data.socketId) return;
    const { room, socketId } = data;
    
    log(`Excluding device ${socketId} from room ${room}`);
    // Notify the specific device to leave
    io.to(socketId).emit('excluded');
    
    // Force the socket to leave the room on server side
    const targetSocket = io.sockets.sockets.get(socketId);
    if (targetSocket) {
      await targetSocket.leave(room);
    }
    
    await broadcastRoomStatus(room);
  });

  socket.on('ping_device', (data) => {
    if (!data || !data.targetSocketId || !data.fromSocketId) return;
    const { targetSocketId, fromSocketId } = data;
    io.to(targetSocketId).emit('ping_device', { fromSocketId });
  });

  socket.on('pong_device', (data) => {
    if (!data || !data.targetSocketId || !data.fromSocketId) return;
    const { targetSocketId, fromSocketId } = data;
    io.to(targetSocketId).emit('pong_device', { fromSocketId });
  });

  socket.on('disconnect', async (reason) => {
    if (currentRoom) {
      await broadcastRoomStatus(currentRoom);
    }
    log(`user disconnected: ${socket.id}, reason: ${reason}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log(`Server listening on port ${PORT}`);
});
