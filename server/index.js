const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', rooms: Object.keys(rooms).length });
});

app.get('/obs', (req, res) => {
  res.sendFile(path.join(__dirname, 'obs.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {}; // room -> [ { socketId, deviceName } ]

function getRoomDevices(room) {
  return rooms[room] || [];
}

function broadcastRoomStatus(room) {
  const devices = getRoomDevices(room);
  io.to(room).emit('room_status', devices);
}

function log(...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}]`, ...args);
}

io.on('connection', (socket) => {
  log('a user connected:', socket.id);
  let currentRoom = null;

  socket.on('join', (data) => {
    if (!data || !data.room) {
      log('Join attempt without room info');
      return;
    }
    const { room, deviceName } = data;
    socket.join(room);
    currentRoom = room;
    
    if (!rooms[room]) rooms[room] = [];
    
    // Remove if already exists (should not happen normally)
    rooms[room] = rooms[room].filter(d => d.socketId !== socket.id);
    rooms[room].push({ 
      socketId: socket.id, 
      deviceName: deviceName || 'Unknown Device',
      sharing: { screen: false, camera: false },
      monitors: [] // { socketId, deviceName, type }
    });
    
    log(`User ${socket.id} (${deviceName}) joined room: ${room}`);
    broadcastRoomStatus(room);
  });

  socket.on('start_share', (data) => {
    if (!currentRoom || !data || !data.type) return;
    const { type } = data; // 'screen' or 'camera'
    if (rooms[currentRoom]) {
      const device = rooms[currentRoom].find(d => d.socketId === socket.id);
      if (device) {
        if (!device.sharing) device.sharing = { screen: false, camera: false };
        device.sharing[type] = true;
        log(`User ${socket.id} started sharing ${type} in room: ${currentRoom}`);
        broadcastRoomStatus(currentRoom);
      }
    }
  });

  socket.on('stop_share', (data) => {
    if (!currentRoom || !data || !data.type) return;
    const { type } = data;
    if (rooms[currentRoom]) {
      const device = rooms[currentRoom].find(d => d.socketId === socket.id);
      if (device) {
        if (!device.sharing) device.sharing = { screen: false, camera: false };
        device.sharing[type] = false;
        // Also remove monitors for this share type
        if (!device.monitors) device.monitors = [];
        device.monitors = device.monitors.filter(m => m.type !== type);
        log(`User ${socket.id} stopped sharing ${type} in room: ${currentRoom}`);
        broadcastRoomStatus(currentRoom);
      }
    }
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

  socket.on('join_watch', (data) => {
    if (!currentRoom || !data || !data.targetSocketId || !data.streamType) return;
    const { targetSocketId, streamType, deviceName } = data;
    if (rooms[currentRoom]) {
      const targetDevice = rooms[currentRoom].find(d => d.socketId === targetSocketId);
      if (targetDevice) {
        // Add to monitors if not already there
        if (!targetDevice.monitors.find(m => m.socketId === socket.id && m.type === streamType)) {
          targetDevice.monitors.push({ socketId: socket.id, deviceName, type: streamType });
          broadcastRoomStatus(currentRoom);
        }
      }
    }
  });

  socket.on('leave_watch', (data) => {
    if (!currentRoom || !data || !data.targetSocketId || !data.streamType) return;
    const { targetSocketId, streamType } = data;
    if (rooms[currentRoom]) {
      const targetDevice = rooms[currentRoom].find(d => d.socketId === targetSocketId);
      if (targetDevice) {
        targetDevice.monitors = targetDevice.monitors.filter(m => !(m.socketId === socket.id && m.type === streamType));
        broadcastRoomStatus(currentRoom);
      }
    }
  });

  socket.on('clipboard_update', (data) => {
    if (!data || !data.room || !data.encryptedData) return;
    const { room, encryptedData } = data;
    socket.to(room).emit('clipboard_update', encryptedData);
  });

  socket.on('exclude_device', (data) => {
    if (!data || !data.room || !data.socketId) return;
    const { room, socketId } = data;
    
    log(`Excluding device ${socketId} from room ${room}`);
    // Notify the specific device to leave
    io.to(socketId).emit('excluded');
    
    // Force the socket to leave the room on server side
    const targetSocket = io.sockets.sockets.get(socketId);
    if (targetSocket) {
      targetSocket.leave(room);
    }
    
    // Update our rooms list immediately
    if (rooms[room]) {
      rooms[room] = rooms[room].filter(d => d.socketId !== socketId);
      broadcastRoomStatus(room);
    }
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

  socket.on('disconnect', (reason) => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom] = rooms[currentRoom].filter(d => d.socketId !== socket.id);
      if (rooms[currentRoom].length === 0) {
        delete rooms[currentRoom];
      } else {
        broadcastRoomStatus(currentRoom);
      }
    }
    log(`user disconnected: ${socket.id}, reason: ${reason}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log(`Server listening on port ${PORT}`);
});
