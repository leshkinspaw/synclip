const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

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

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);
  let currentRoom = null;

  socket.on('join', (data) => {
    const { room, deviceName } = data;
    socket.join(room);
    currentRoom = room;
    
    if (!rooms[room]) rooms[room] = [];
    
    // Remove if already exists (should not happen normally)
    rooms[room] = rooms[room].filter(d => d.socketId !== socket.id);
    rooms[room].push({ socketId: socket.id, deviceName: deviceName || 'Unknown Device' });
    
    console.log(`User ${socket.id} (${deviceName}) joined room: ${room}`);
    broadcastRoomStatus(room);
  });

  socket.on('clipboard_update', (data) => {
    const { room, encryptedData } = data;
    socket.to(room).emit('clipboard_update', encryptedData);
  });

  socket.on('exclude_device', (data) => {
    const { room, socketId } = data;
    // Notify the specific device to leave
    io.to(socketId).emit('excluded');
  });

  socket.on('ping_device', (data) => {
    const { targetSocketId, fromSocketId } = data;
    io.to(targetSocketId).emit('ping_device', { fromSocketId });
  });

  socket.on('pong_device', (data) => {
    const { targetSocketId, fromSocketId } = data;
    io.to(targetSocketId).emit('pong_device', { fromSocketId });
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom] = rooms[currentRoom].filter(d => d.socketId !== socket.id);
      if (rooms[currentRoom].length === 0) {
        delete rooms[currentRoom];
      } else {
        broadcastRoomStatus(currentRoom);
      }
    }
    console.log('user disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
