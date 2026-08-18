import { io, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents, PlayerState } from '@watch-party/shared';

const LOG_PREFIX = '[WatchParty BG]';
function log(...args: unknown[]) { console.log(LOG_PREFIX, ...args); }
function warn(...args: unknown[]) { console.warn(LOG_PREFIX, ...args); }

// Use websocket transport to bypass XMLHttpRequest limitation in Service Workers
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let currentServerUrl = 'http://localhost:3001';

chrome.storage.local.get(['serverUrl'], (result) => {
  if (result.serverUrl) {
    currentServerUrl = result.serverUrl;
  }
  initSocket();
});

function initSocket() {
  if (socket) {
    socket.disconnect();
  }

  socket = io(currentServerUrl, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  // Socket connection events
  socket.on('connect', () => {
    log('Connected to server, socket id:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    warn('Disconnected from server:', reason);
  });

  socket.on('connect_error', (err) => {
    warn('Connection error:', err.message);
  });

  socket.on('playerSync', (state) => {
    log('Received playerSync:', state);
    if (currentTabId && state.source === 'netflix') {
      chrome.tabs.sendMessage(currentTabId, { type: 'SYNC_PLAYER', state }).catch(err => {
        warn('Failed to send SYNC_PLAYER to tab:', err);
      });
    }
  });

  socket.on('chatMessage', (msg) => {
    log('Received chatMessage from:', msg.userName);
    chrome.runtime.sendMessage({ type: 'CHAT_MESSAGE', msg }).catch(() => {});
  });

  socket.on('userJoined', (user) => {
    log('User joined:', user.name);
    chrome.runtime.sendMessage({ type: 'USER_JOINED', user }).catch(() => {});
  });

  socket.on('userLeft', (userId) => {
    log('User left:', userId);
    chrome.runtime.sendMessage({ type: 'USER_LEFT', userId }).catch(() => {});
  });
}

let currentRoomId: string | null = null;
let currentTabId: number | null = null;

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'UPDATE_URL') {
    log('Updating server URL to:', request.url);
    currentServerUrl = request.url;
    initSocket();
    sendResponse({ success: true });
    return;
  }

  if (request.type === 'JOIN_ROOM') {
    log('JOIN_ROOM request — room:', request.roomId, 'user:', request.userName, 'tab:', request.tabId);
    
    if (!socket) initSocket();
    
    if (socket && !socket.connected) {
      log('Socket not connected, connecting...');
      socket.connect();
    }

    currentTabId = request.tabId;

    // Wait for connection if needed, then join
    const doJoin = () => {
      socket?.emit('joinRoom', request.roomId, request.userName, '', '', (response) => {
        log('joinRoom response:', response);
        if (response.success) {
          currentRoomId = request.roomId;
        }
        sendResponse(response);
      });
    };

    if (socket?.connected) {
      doJoin();
    } else if (socket) {
      // Wait for connect event before joining
      socket.once('connect', () => {
        log('Socket connected, now joining room...');
        doJoin();
      });

      // Timeout if connection fails
      setTimeout(() => {
        if (!socket?.connected) {
          warn('Connection timeout — is the server running on ' + currentServerUrl + '?');
          sendResponse({ success: false, error: 'Could not connect to server. Is it running?' });
        }
      }, 5000);
    }

    return true; // async response
  }

  if (request.type === 'LEAVE_ROOM') {
    if (currentRoomId && socket) {
      log('Leaving room:', currentRoomId);
      socket.emit('leaveRoom', currentRoomId);
      currentRoomId = null;
      currentTabId = null;
    }
  }

  if (request.type === 'SEND_MESSAGE') {
    if (currentRoomId && socket) {
      socket.emit('sendMessage', currentRoomId, request.text);
    } else {
      warn('SEND_MESSAGE but not in a room');
    }
  }

  if (request.type === 'LOCAL_PLAYER_UPDATE') {
    // Received from content script
    if (currentRoomId && socket) {
      const state: Partial<PlayerState> = {
        source: 'netflix',
        isPlaying: request.state.isPlaying,
        currentTime: request.state.currentTime
      };
      log('Sending syncPlayer:', state);
      socket.emit('syncPlayer', currentRoomId, state);
    } else {
      log('LOCAL_PLAYER_UPDATE received but not in a room — ignoring.');
    }
  }

  if (request.type === 'GET_STATUS') {
    sendResponse({
      connected: socket?.connected || false,
      roomId: currentRoomId,
      tabId: currentTabId,
    });
    return true;
  }
});

log('Background service worker loaded.');
