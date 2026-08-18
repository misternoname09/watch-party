import { Server, Socket } from 'socket.io'; 
import { 
  ClientToServerEvents, 
  ServerToClientEvents, 
  Room, 
  User,
  PlayerState,
  ChatMessage
} from '@watch-party/shared';
import { randomUUID } from 'crypto';

// In-memory store for development (will be replaced by Redis/DB later)
const rooms: Record<string, Room> = {};
const roomPins: Record<string, string> = {};

export function setupSockets(io: Server<ClientToServerEvents, ServerToClientEvents>) {
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`User connected: ${socket.id}`);
    
    // Store current room id for cleanup on disconnect
    let currentRoomId: string | null = null;

    socket.on('joinRoom', (roomId, userName, avatar, pin, callback) => {
      console.log('>>> joinRoom received:', { roomId, userName, avatar, pin, hasCallback: typeof callback === 'function' });
      
      try {
        // If callback wasn't passed correctly, bail out
        if (typeof callback !== 'function') {
          console.error('joinRoom: callback is not a function! Type:', typeof callback);
          return;
        }

        // Check PIN if room exists and is locked
        if (rooms[roomId] && roomPins[roomId] && roomPins[roomId] !== pin) {
          callback({ success: false, error: 'Incorrect PIN for this private room.' });
          return;
        }
        
        // Create room if it doesn't exist
        if (!rooms[roomId]) {
          rooms[roomId] = {
            id: roomId,
            users: [],
            playerState: {
              source: 'youtube',
              videoId: null,
              isPlaying: false,
              currentTime: 0,
              timestamp: Date.now()
            },
            hostId: socket.id,
            playlist: [],
            isLocked: false
          };
        }

        const room = rooms[roomId];

        // Remove any existing entry for this socket (reconnection case)
        room.users = room.users.filter(u => u.id !== socket.id);

        // Max 2 users per room
        if (room.users.length >= 2) {
          callback({ success: false, error: 'Room is full (max 2 users)' });
          return;
        }

        const newUser: User = {
          id: socket.id,
          name: userName,
          avatar: avatar || undefined,
          isReady: false
        };

        room.users.push(newUser);
        socket.join(roomId);
        currentRoomId = roomId;

        // Notify others in the room
        socket.to(roomId).emit('userJoined', newUser);
        
        // Send current state to the joining user
        callback({ success: true, room });
        
        console.log(`✅ ${userName} joined room ${roomId} (${room.users.length} users)`);
      } catch (err) {
        console.error('joinRoom ERROR:', err);
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Server error' });
        }
      }
    });

    socket.on('leaveRoom', (roomId) => {
      leaveRoom(socket, roomId);
    });

    socket.on('sendMessage', (roomId, text) => {
      const room = rooms[roomId];
      if (!room) return;

      const user = room.users.find(u => u.id === socket.id);
      if (!user) return;

      const message: ChatMessage = {
        id: randomUUID(),
        userId: user.id,
        userName: user.name,
        text,
        timestamp: Date.now()
      };

      io.to(roomId).emit('chatMessage', message);
    });

    socket.on('syncPlayer', (roomId, state) => {
      const room = rooms[roomId];
      if (!room) return;

      // Update room state
      room.playerState = {
        ...room.playerState,
        ...state,
        timestamp: Date.now()
      };

      // Broadcast to other users in the room
      socket.to(roomId).emit('playerSync', room.playerState);
    });

    socket.on('userTyping', (roomId, isTyping) => {
      const room = rooms[roomId];
      if (!room) return;
      socket.to(roomId).emit('userTyping', socket.id, isTyping);
    });

    socket.on('sendReaction', (roomId, emoji) => {
      const room = rooms[roomId];
      if (!room) return;
      socket.to(roomId).emit('reactionReceived', socket.id, emoji);
    });

    socket.on('addToPlaylist', (roomId, videoId) => {
      const room = rooms[roomId];
      if (!room) return;
      
      // Ensure only host can add to playlist (optional, but good for admin controls)
      if (room.hostId !== socket.id) return;
      
      if (!room.playlist.includes(videoId)) {
        room.playlist.push(videoId);
        io.to(roomId).emit('playlistUpdated', room.playlist);
        
        // If nothing is playing, auto-play the first video added
        if (!room.playerState.videoId && room.playlist.length === 1) {
          room.playerState = {
            source: 'youtube',
            videoId: videoId,
            isPlaying: true,
            currentTime: 0,
            timestamp: Date.now()
          };
          room.playlist.shift();
          io.to(roomId).emit('playerSync', room.playerState);
          io.to(roomId).emit('playlistUpdated', room.playlist);
        }
      }
    });

    socket.on('playNext', (roomId) => {
      const room = rooms[roomId];
      if (!room) return;
      
      if (room.hostId !== socket.id) return;
      
      if (room.playlist.length > 0) {
        const nextVideo = room.playlist.shift();
        if (nextVideo) {
          room.playerState = {
            source: 'youtube',
            videoId: nextVideo,
            isPlaying: true,
            currentTime: 0,
            timestamp: Date.now()
          };
          io.to(roomId).emit('playerSync', room.playerState);
          io.to(roomId).emit('playlistUpdated', room.playlist);
        }
      } else {
        // Empty playlist, stop video
        room.playerState = {
          source: 'youtube',
          videoId: null,
          isPlaying: false,
          currentTime: 0,
          timestamp: Date.now()
        };
        io.to(roomId).emit('playerSync', room.playerState);
      }
    });

    socket.on('webrtcSignal', (roomId, signal, targetUserId) => {
      if (targetUserId) {
        socket.to(targetUserId).emit('webrtcSignal', signal, socket.id);
      } else {
        socket.to(roomId).emit('webrtcSignal', signal, socket.id);
      }
    });

    socket.on('setRoomPin', (roomId, pin) => {
      const room = rooms[roomId];
      if (room && room.hostId === socket.id) {
        if (pin.trim() === '') {
          delete roomPins[roomId];
          room.isLocked = false;
        } else {
          roomPins[roomId] = pin;
          room.isLocked = true;
        }
        io.to(roomId).emit('roomState', room);
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      if (currentRoomId) {
        leaveRoom(socket, currentRoomId);
      }
    });

    function leaveRoom(socket: Socket, roomId: string) {
      socket.leave(roomId);
      const room = rooms[roomId];
      if (room) {
        room.users = room.users.filter(u => u.id !== socket.id);
        socket.to(roomId).emit('userLeft', socket.id);
        
        if (room.users.length === 0) {
          delete rooms[roomId];
        } else if (room.hostId === socket.id) {
          // Reassign host
          room.hostId = room.users[0].id;
          io.to(roomId).emit('roomState', room);
        }
      }
      currentRoomId = null;
    }
  });
}
