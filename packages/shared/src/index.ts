export interface User {
  id: string;
  name: string;
  avatar?: string;
  isReady: boolean;
}

export type VideoSource = 'youtube' | 'netflix';

export interface PlayerState {
  source: VideoSource;
  videoId: string | null;
  isPlaying: boolean;
  currentTime: number;
  timestamp: number; // Server timestamp when this state was recorded for drift calculation
}

export interface Room {
  id: string;
  users: User[];
  playerState: PlayerState;
  hostId: string;
  playlist: string[];
  isLocked?: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

// Socket.io Events Definition
export interface ServerToClientEvents {
  roomState: (room: Room) => void;
  chatMessage: (message: ChatMessage) => void;
  playerSync: (state: PlayerState) => void;
  userJoined: (user: User) => void;
  userLeft: (userId: string) => void;
  userTyping: (userId: string, isTyping: boolean) => void;
  reactionReceived: (userId: string, emoji: string) => void;
  playlistUpdated: (playlist: string[]) => void;
  webrtcSignal: (signal: any, fromUserId: string) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  joinRoom: (roomId: string, userName: string, avatar: string, pin: string, callback: (response: { success: boolean; room?: Room; error?: string }) => void) => void;
  leaveRoom: (roomId: string) => void;
  sendMessage: (roomId: string, text: string) => void;
  syncPlayer: (roomId: string, state: Partial<PlayerState>) => void;
  userTyping: (roomId: string, isTyping: boolean) => void;
  sendReaction: (roomId: string, emoji: string) => void;
  addToPlaylist: (roomId: string, videoId: string) => void;
  playNext: (roomId: string) => void;
  webrtcSignal: (roomId: string, signal: any, targetUserId?: string) => void;
  setRoomPin: (roomId: string, pin: string) => void;
}
