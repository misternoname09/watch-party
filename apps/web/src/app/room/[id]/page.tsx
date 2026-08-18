"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube';
import { Play, Users, MessageSquare, Link as LinkIcon, AlertCircle, 
  Send, Copy, Check, Wifi, ChevronDown, Crown, ListVideo, Trash2,
  Mic, MicOff, Video, VideoOff, Moon, Sun, MonitorUp, Lock, Unlock
} from 'lucide-react';
import { socket } from '@/lib/socket';
import { Room, User, ChatMessage, PlayerState } from '@watch-party/shared';
import { Heart, Smile, Zap } from 'lucide-react';

// Generate a consistent color from a string
function stringToColor(str: string): string {
  const colors = [
    'linear-gradient(135deg, #6366f1, #8b5cf6)',
    'linear-gradient(135deg, #ec4899, #f472b6)',
    'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    'linear-gradient(135deg, #06b6d4, #22d3ee)',
    'linear-gradient(135deg, #f59e0b, #fbbf24)',
    'linear-gradient(135deg, #10b981, #34d399)',
    'linear-gradient(135deg, #ef4444, #f87171)',
    'linear-gradient(135deg, #3b82f6, #60a5fa)',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Wrapper to skip SSR entirely — prevents hydration mismatch from browser translation extensions
export default function RoomPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  
  if (!mounted) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#07080d' }}>
        <div className="text-center">
          <div 
            className="w-16 h-16 mx-auto rounded-full border-2 border-transparent mb-4"
            style={{
              borderTopColor: '#6366f1',
              borderRightColor: '#ec4899',
              animation: 'spin-slow 1s linear infinite'
            }}
          ></div>
          <p className="text-gray-500 text-sm">Loading room...</p>
        </div>
      </div>
    );
  }
  
  return <RoomPageContent />;
}

function RoomPageContent() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  
  const [userName, setUserName] = useState<string>('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>('1');
  const [roomPin, setRoomPin] = useState<string>('');
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [youtubeIdInput, setYoutubeIdInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [reactions, setReactions] = useState<{id: string, emoji: string, left: number}[]>([]);
  
  // UI States
  const [isTheatreMode, setIsTheatreMode] = useState(false);
  
  // WebRTC State
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const playerRef = useRef<YouTubePlayer | null>(null);
  const isSyncingRef = useRef(false);
  const lastStateRef = useRef<PlayerState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }
    
    setError(null);
    setIsJoining(true);
    localStorage.setItem('watch_party_username', userName);

    // If socket is not connected, try to connect and wait
    if (!socket.connected) {
      console.log("Socket not connected, connecting now...");
      socket.connect();
      
      // Wait up to 5 seconds for the socket to connect
      const connected = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000);
        
        if (socket.connected) {
          clearTimeout(timeout);
          resolve(true);
          return;
        }
        
        socket.once('connect', () => {
          clearTimeout(timeout);
          resolve(true);
        });
        
        socket.once('connect_error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });
      
      if (!connected) {
        setError('Cannot connect to server. Make sure the server is running on port 3001.');
        setIsJoining(false);
        return;
      }
    }

    console.log("Socket connected, emitting joinRoom", roomId);
    
    // Set a timeout in case the server never responds
    const joinTimeout = setTimeout(() => {
      setError('Server did not respond. Please try again.');
      setIsJoining(false);
    }, 8000);

    socket.emit('joinRoom', roomId, userName, selectedAvatar, roomPin, (response: any) => {
      clearTimeout(joinTimeout);
      console.log("joinRoom response received:", response);
      if (response.success && response.room) {
        setRoom(response.room);
        lastStateRef.current = response.room.playerState;
        setIsConnected(true);
      } else {
        setError(response.error || 'Failed to join room');
      }
      setIsJoining(false);
    });
  };

  // Connect to room
  useEffect(() => {
    const storedName = localStorage.getItem('watch_party_username');
    if (storedName) {
      setUserName(storedName);
    }
    
    console.log("Checking socket connection, currently:", socket.connected);
    if (!socket.connected) {
      socket.connect();
    }

    socket.on('connect', () => console.log("Socket connected!"));
    socket.on('connect_error', (err) => console.error("Socket connect_error:", err));
    
    socket.on('userJoined', (user) => {
      setRoom(prev => {
        if (!prev) return prev;
        if (prev.users.some(u => u.id === user.id)) {
          return { ...prev, users: prev.users.map(u => u.id === user.id ? user : u) };
        }
        return { ...prev, users: [...prev.users, user] };
      });
      const sysMsg: ChatMessage = {
        id: Math.random().toString(),
        userId: 'system',
        userName: 'System',
        text: `${user.name} joined the room`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, sysMsg]);

      // WebRTC: Initiate call to the new user if we have a stream
      initiateCall(user.id);
    });

    socket.on('userLeft', (userId) => {
      setRoom(prev => {
        if (!prev) return prev;
        const user = prev.users.find(u => u.id === userId);
        if (user) {
          const sysMsg: ChatMessage = {
            id: Math.random().toString(),
            userId: 'system',
            userName: 'System',
            text: `${user.name} left the room`,
            timestamp: Date.now()
          };
          setMessages(msgs => [...msgs, sysMsg]);
        }
        return { ...prev, users: prev.users.filter(u => u.id !== userId) };
      });
      
      // WebRTC cleanup
      if (peersRef.current[userId]) {
        peersRef.current[userId].close();
        delete peersRef.current[userId];
      }
      setRemoteStreams(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    });

    socket.on('roomState', (updatedRoom) => {
      setRoom(updatedRoom);
    });

    socket.on('playlistUpdated', (playlist) => {
      setRoom(prev => prev ? { ...prev, playlist } : prev);
    });

    socket.on('chatMessage', (msg) => {
      setMessages(prev => [...prev, msg]);
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(msg.userName);
        return newSet;
      });
    });

    socket.on('userTyping', (userId, isTyping) => {
      setRoom(prevRoom => {
        if (!prevRoom) return prevRoom;
        const user = prevRoom.users.find(u => u.id === userId);
        if (user) {
          setTypingUsers(prev => {
            const newSet = new Set(prev);
            if (isTyping) newSet.add(user.name);
            else newSet.delete(user.name);
            return newSet;
          });
        }
        return prevRoom;
      });
    });

    socket.on('reactionReceived', (userId, emoji) => {
      const id = Math.random().toString();
      // Random horizontal position between 10% and 90%
      const left = 10 + Math.random() * 80;
      setReactions(prev => [...prev, { id, emoji, left }]);
      
      // Remove reaction after animation finishes
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== id));
      }, 2000);
    });

    socket.on('playerSync', (state) => {
      isSyncingRef.current = true;
      lastStateRef.current = state;
      
      setRoom(prev => prev ? { ...prev, playerState: state } : prev);
      
      const player = playerRef.current;
      if (player && state.videoId) {
        if (state.isPlaying) {
          const drift = (Date.now() - state.timestamp) / 1000;
          const targetTime = state.currentTime + drift;
          const currentVideoTime = player.getCurrentTime();
          if (Math.abs(currentVideoTime - targetTime) > 1.5) {
            player.seekTo(targetTime, true);
          }
          player.playVideo();
        } else {
          player.pauseVideo();
          player.seekTo(state.currentTime, true);
        }
      }
      
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 500);
    });

    socket.on('webrtcSignal', async (signal, fromUserId) => {
      let peer = peersRef.current[fromUserId];
      if (!peer) {
        peer = createPeerConnection(fromUserId);
      }

      if (signal.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(signal));
        if (signal.type === 'offer') {
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit('webrtcSignal', roomId, peer.localDescription, fromUserId);
        }
      } else if (signal.candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(signal));
      }
    });

    return () => {
      socket.off('userJoined');
      socket.off('userLeft');
      socket.off('chatMessage');
      socket.off('playerSync');
      socket.off('userTyping');
      socket.off('reactionReceived');
      socket.off('roomState');
      socket.off('playlistUpdated');
      socket.off('webrtcSignal');
      socket.emit('leaveRoom', roomId);
      
      // Cleanup WebRTC
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      Object.values(peersRef.current).forEach(p => p.close());
    };
  }, [roomId, router]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('sendMessage', roomId, chatInput);
    setChatInput('');
    socket.emit('userTyping', roomId, false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatInput(e.target.value);
    
    // Emit typing status
    socket.emit('userTyping', roomId, e.target.value.length > 0);
    
    // Clear typing status after 2 seconds of inactivity
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('userTyping', roomId, false);
    }, 2000);
  };

  const handleSendReaction = (emoji: string) => {
    socket.emit('sendReaction', roomId, emoji);
    // Optimistically show reaction for ourselves
    const id = Math.random().toString();
    const left = 10 + Math.random() * 80;
    setReactions(prev => [...prev, { id, emoji, left }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 2000);
  };

  const handleChangeVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeIdInput.trim()) return;
    
    let videoId = youtubeIdInput;
    if (youtubeIdInput.includes('v=')) {
      videoId = youtubeIdInput.split('v=')[1].split('&')[0];
    } else if (youtubeIdInput.includes('youtu.be/')) {
      videoId = youtubeIdInput.split('youtu.be/')[1].split('?')[0];
    }
    
    socket.emit('addToPlaylist', roomId, videoId);
    setYoutubeIdInput('');
  };

  // ─── WebRTC Functions ───
  const toggleMedia = async (type: 'audio' | 'video') => {
    try {
      let currentStream = localStreamRef.current;
      
      const newAudioState = type === 'audio' ? !isMicOn : isMicOn;
      const newVideoState = type === 'video' ? !isCamOn : isCamOn;

      // If we are turning everything off
      if (!newAudioState && !newVideoState) {
        if (currentStream) {
          currentStream.getTracks().forEach(t => t.stop());
        }
        localStreamRef.current = null;
        setLocalStream(null);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        setIsMicOn(false);
        setIsCamOn(false);
        setIsScreenSharing(false);
        return;
      }

      // We need media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: newVideoState, 
        audio: newAudioState 
      });

      // Stop old tracks
      if (currentStream && !isScreenSharing) {
        currentStream.getTracks().forEach(t => t.stop());
      }
      
      setIsScreenSharing(false);
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Update all peers with new tracks
      Object.values(peersRef.current).forEach(peer => {
        const senders = peer.getSenders();
        stream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
          } else {
            peer.addTrack(track, stream);
          }
        });
      });

      setIsMicOn(newAudioState);
      setIsCamOn(newVideoState);
    } catch (err) {
      console.error("Error accessing media devices", err);
      alert("Could not access camera/microphone.");
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      setIsScreenSharing(false);
      // Revert to camera if it was on
      if (isCamOn || isMicOn) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: isCamOn, audio: isMicOn });
          localStreamRef.current = stream;
          setLocalStream(stream);
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
          Object.values(peersRef.current).forEach(peer => {
            const senders = peer.getSenders();
            stream.getTracks().forEach(track => {
              const sender = senders.find(s => s.track?.kind === track.kind);
              if (sender) sender.replaceTrack(track);
            });
          });
        } catch (e) {
          console.error("Revert to cam failed", e);
        }
      } else {
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setIsScreenSharing(true);
      
      const screenVideoTrack = stream.getVideoTracks()[0];
      screenVideoTrack.onended = () => {
        toggleScreenShare(); // Handle native "Stop sharing"
      };

      // Keep microphone if it was on
      if (isMicOn) {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStream.getAudioTracks().forEach(t => stream.addTrack(t));
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      Object.values(peersRef.current).forEach(peer => {
        const senders = peer.getSenders();
        stream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
          } else {
            peer.addTrack(track, stream);
          }
        });
      });
    } catch (err) {
      console.error("Error sharing screen", err);
    }
  };

  const createPeerConnection = (userId: string) => {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    if (localStream) {
      localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
      });
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtcSignal', roomId, event.candidate, userId);
      }
    };

    peer.ontrack = (event) => {
      setRemoteStreams(prev => ({
        ...prev,
        [userId]: event.streams[0]
      }));
    };

    peersRef.current[userId] = peer;
    return peer;
  };

  const initiateCall = async (userId: string) => {
    const peer = createPeerConnection(userId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('webrtcSignal', roomId, peer.localDescription, userId);
  };

  // ─── Main Room View ───
  const onPlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    if (lastStateRef.current?.videoId) {
      if (lastStateRef.current.isPlaying) {
        const drift = (Date.now() - lastStateRef.current.timestamp) / 1000;
        event.target.seekTo(lastStateRef.current.currentTime + drift, true);
        event.target.playVideo();
      } else {
        event.target.seekTo(lastStateRef.current.currentTime, true);
      }
    }
  };

  const onPlayerStateChange = (event: YouTubeEvent) => {
    if (isSyncingRef.current) return;
    
    const player = event.target;
    const isPlaying = event.data === YouTube.PlayerState.PLAYING;
    const isPaused = event.data === YouTube.PlayerState.PAUSED;
    
    if (isPlaying || isPaused) {
      socket.emit('syncPlayer', roomId, {
        isPlaying,
        currentTime: player.getCurrentTime(),
      });
    }
  };

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Login Screen ───
  if (!room) {
    return (
      <div className="h-screen flex items-center justify-center p-4 relative" style={{ background: 'var(--bg-color)' }}>
        <div className="bg-mesh">
          <div className="bg-orb bg-orb-1"></div>
          <div className="bg-orb bg-orb-2"></div>
          <div className="bg-orb bg-orb-3"></div>
        </div>
        <div className="bg-grid"></div>
        <div className="glass-panel p-8 max-w-md w-full relative z-10 animate-fade-in text-center shadow-2xl border border-white/10">
          <div className="w-20 h-20 mx-auto bg-gradient-to-tr from-indigo-500 to-pink-500 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/20" style={{ transform: 'rotate(-5deg)' }}>
            <Play className="text-white w-10 h-10 ml-1" fill="currentColor" />
          </div>
          <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Watch Party</h1>
          <p className="text-gray-400 mb-8 font-medium">Join room <span className="text-indigo-400 font-mono bg-indigo-400/10 px-2 py-0.5 rounded">{roomId}</span></p>
          
          <form onSubmit={handleJoin} className="space-y-6">
            <div className="text-left">
              <label className="block text-sm font-medium text-gray-400 mb-2">Choose an Avatar</label>
              <div className="flex justify-center gap-3 mb-2">
                {['1', '2', '3', '4', '5'].map(seed => (
                  <div 
                    key={seed} 
                    onClick={() => setSelectedAvatar(seed)}
                    className={`cursor-pointer rounded-full p-1 transition-all ${selectedAvatar === seed ? 'ring-2 ring-indigo-500 scale-110 bg-indigo-500/20' : 'opacity-60 hover:opacity-100 hover:bg-white/5'}`}
                  >
                    <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}`} alt="Avatar" className="w-12 h-12 rounded-full" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <input
                type="text"
                placeholder="Enter your name"
                className="w-full text-center text-lg"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                maxLength={20}
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Room PIN (if locked)"
                className="w-full text-center text-lg bg-black/20"
                value={roomPin}
                onChange={(e) => setRoomPin(e.target.value)}
                maxLength={4}
              />
            </div>
            {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">{error}</p>}
            <button 
              type="submit" 
              className="w-full py-4 text-lg font-semibold tracking-wide shadow-lg shadow-indigo-500/20"
              disabled={isJoining}
              style={{ opacity: isJoining ? 0.7 : 1 }}
            >
              {isJoining ? 'Connecting...' : 'Join Party'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Loading State ───
  if (!isConnected) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4 relative">
        <div className="bg-mesh">
          <div className="bg-orb bg-orb-1"></div>
          <div className="bg-orb bg-orb-2"></div>
        </div>
        <div className="relative">
          <div 
            className="w-16 h-16 rounded-full border-2 border-transparent"
            style={{
              borderTopColor: '#6366f1',
              borderRightColor: '#ec4899',
              animation: 'spin-slow 1s linear infinite'
            }}
          ></div>
          <div 
            className="absolute inset-2 rounded-full border-2 border-transparent"
            style={{
              borderBottomColor: '#8b5cf6',
              animation: 'spin-slow 1.5s linear infinite reverse'
            }}
          ></div>
        </div>
        <p className="text-gray-500 text-sm animate-pulse">Connecting to room...</p>
      </div>
    );
  }

  // ─── Main Room View ───
  const isHost = room.hostId === socket.id;

  return (
    <div className={`min-h-[100dvh] md:h-[100dvh] flex flex-col md:flex-row overflow-y-auto md:overflow-hidden transition-colors duration-700 ${isTheatreMode ? 'bg-black' : ''}`} style={{ background: isTheatreMode ? '#000000' : 'var(--bg-color)' }}>
      {/* Background effects */}
      {!isTheatreMode && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-[30%] -left-[10%] w-[70%] h-[70%] rounded-full bg-indigo-500/10 blur-[120px]"></div>
          <div className="absolute top-[20%] -right-[20%] w-[60%] h-[60%] rounded-full bg-pink-500/10 blur-[100px]"></div>
          <div className="absolute -bottom-[40%] left-[20%] w-[80%] h-[80%] rounded-full bg-purple-500/10 blur-[150px]"></div>
        </div>
      )}

      {/* Main Content (Player) */}
      <div className={`flex-1 flex flex-col h-auto md:h-full md:overflow-y-auto relative z-10 p-4 md:p-6 transition-all duration-500 ${isTheatreMode ? 'md:pr-6' : 'md:pr-0'}`}>
        
        {/* Header */}
        <header className={`flex justify-between items-center mb-6 animate-fade-in transition-opacity duration-500 ${isTheatreMode ? 'opacity-20 hover:opacity-100' : 'opacity-100'}`}>
          <div className="flex items-center gap-3">
            <div 
              className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899)',
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
              }}
            >
              <Play className="text-white w-5 h-5 ml-0.5" fill="currentColor" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none flex items-center gap-2">
                Watch Party
                <span className="connection-badge">
                  <Wifi size={10} />
                  Live
                </span>
              </h1>
              <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-2 font-mono">
                <span className="bg-white/5 px-2 py-0.5 rounded text-gray-400">{roomId}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => toggleMedia('audio')}
              className={`p-2 rounded-lg transition-colors ${isMicOn ? 'bg-indigo-500/20 text-indigo-400' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
              title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
            >
              {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button 
              onClick={() => toggleMedia('video')}
              className={`p-2 rounded-lg transition-colors ${isCamOn && !isScreenSharing ? 'bg-indigo-500/20 text-indigo-400' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
              title={isCamOn && !isScreenSharing ? 'Turn Off Camera' : 'Turn On Camera'}
            >
              {isCamOn && !isScreenSharing ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button 
              onClick={toggleScreenShare}
              className={`p-2 rounded-lg transition-colors ${isScreenSharing ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
              title="Share Screen"
            >
              <MonitorUp size={18} />
            </button>
            <button 
              onClick={() => setIsTheatreMode(!isTheatreMode)}
              className={`p-2 rounded-lg transition-colors ${isTheatreMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
              title="Theatre Mode"
            >
              {isTheatreMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button 
              className="btn-secondary py-2 px-4 text-xs hidden md:flex items-center gap-2"
              onClick={copyRoomLink}
            >
              {copied ? <Check size={14} className="text-green-400" /> : <LinkIcon size={14} />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            {isHost && (
              <button 
                onClick={() => {
                  const pin = prompt(room.isLocked ? "Enter new PIN (leave blank to unlock):" : "Enter 4-digit PIN to lock room:");
                  if (pin !== null) socket.emit('setRoomPin', roomId, pin);
                }}
                className={`p-2 rounded-lg transition-colors ml-2 ${room.isLocked ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                title={room.isLocked ? 'Unlock Room' : 'Lock Room'}
              >
                {room.isLocked ? <Lock size={18} /> : <Unlock size={18} />}
              </button>
            )}
          </div>
        </header>

        {/* Player + Controls */}
        <div className={`flex-1 flex flex-col mx-auto w-full gap-5 transition-all duration-700 ${isTheatreMode ? 'max-w-[1400px] justify-center scale-[1.02]' : 'max-w-5xl'}`}>
          {/* Video Player */}
          <div 
            className={`player-frame w-full aspect-video bg-black/80 flex items-center justify-center relative transition-shadow duration-1000 ${
              isTheatreMode && room.playerState.isPlaying 
                ? 'shadow-[0_0_80px_-15px_rgba(99,102,241,0.5),0_0_120px_-20px_rgba(236,72,153,0.4)]' 
                : ''
            }`} 
            style={{ animation: 'fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards', opacity: 0 }}
          >
            {/* Floating Reactions Layer */}
            <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
              {reactions.map(r => (
                <div 
                  key={r.id} 
                  className="absolute bottom-0 text-3xl animate-reaction-float"
                  style={{ left: `${r.left}%` }}
                >
                  {r.emoji === 'heart' ? '❤️' : r.emoji === 'laugh' ? '😂' : r.emoji === 'shock' ? '😲' : '👍'}
                </div>
              ))}
            </div>

            {/* WebRTC Video Bubbles */}
            <div className="absolute top-4 right-4 z-40 flex flex-col gap-3 pointer-events-auto">
              {(isCamOn || isMicOn) && (
                <div className="relative w-32 h-24 bg-black/60 rounded-xl overflow-hidden border-2 border-indigo-500/50 shadow-lg">
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-white">You</div>
                  {!isCamOn && <div className="absolute inset-0 flex items-center justify-center"><Mic size={16} className="text-indigo-400" /></div>}
                </div>
              )}
              {Object.entries(remoteStreams).map(([peerId, stream]) => {
                const peerUser = room.users.find(u => u.id === peerId);
                const hasVideo = stream.getVideoTracks().length > 0;
                return (
                  <div key={peerId} className="relative w-32 h-24 bg-black/60 rounded-xl overflow-hidden border border-white/20 shadow-lg">
                    <video 
                      autoPlay playsInline 
                      className="w-full h-full object-cover"
                      ref={(el) => { if (el) el.srcObject = stream; }}
                    />
                    <div className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-white">
                      {peerUser?.name || 'Friend'}
                    </div>
                    {!hasVideo && <div className="absolute inset-0 flex items-center justify-center"><Mic size={16} className="text-white/50" /></div>}
                  </div>
                );
              })}
            </div>

            {room.playerState.videoId ? (
              <YouTube
                videoId={room.playerState.videoId}
                opts={{
                  width: '100%',
                  height: '100%',
                  playerVars: {
                    autoplay: room.playerState.isPlaying ? 1 : 0,
                    controls: 1,
                    disablekb: 1,
                    modestbranding: 1,
                    rel: 0
                  }
                }}
                onReady={onPlayerReady}
                onStateChange={onPlayerStateChange}
                onEnd={() => { if (isHost) socket.emit('playNext', roomId) }}
                className="absolute inset-0 w-full h-full"
                iframeClassName="w-full h-full"
              />
            ) : (
              <div className="text-center text-gray-600 flex flex-col items-center py-8">
                <div 
                  className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-5"
                  style={{ animation: 'float 4s ease-in-out infinite' }}
                >
                  <Play className="w-10 h-10 opacity-40 ml-1" />
                </div>
                <p className="text-base font-medium text-gray-400 mb-1">No video playing</p>
                <p className="text-sm text-gray-600">Paste a YouTube URL below to start watching together</p>
              </div>
            )}
          </div>

        <div className={`transition-all duration-700 ${isTheatreMode ? 'opacity-0 h-0 overflow-hidden m-0' : 'opacity-100'}`}>
          {/* Video Input */}
          {isHost ? (
            <form 
              onSubmit={handleChangeVideo} 
              className="flex gap-2 w-full glass-panel p-2 mt-4"
            >
              <input 
                type="text" 
                placeholder="Paste YouTube URL or Video ID to add to Playlist..." 
                className="flex-1 bg-transparent border-none shadow-none text-white px-2"
                style={{ boxShadow: 'none' }}
                value={youtubeIdInput}
                onChange={(e) => setYoutubeIdInput(e.target.value)}
              />
              <button type="submit" className="py-2 px-6 text-sm">Add to Queue</button>
            </form>
          ) : (
            <div className="glass-panel p-4 mt-4 text-center text-sm text-gray-400">
              Only the room Host (<Crown className="w-4 h-4 text-yellow-400 inline mx-1 mb-1" />) can change the video and manage the playlist.
            </div>
          )}
          
          {/* Netflix note */}
          <div 
            className="glass-panel px-5 py-3 text-xs text-gray-500 flex items-center gap-3 mt-2"
            style={{ 
              background: 'rgba(236, 72, 153, 0.05)', 
              borderColor: 'rgba(236, 72, 153, 0.1)'
            }}
          >
            <svg viewBox="0 0 24 24" fill="#e50914" width="20" height="20" className="shrink-0">
              <path d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24h-4.715z"/>
            </svg>
            <span>Netflix sync is available via the <strong className="text-gray-400">Chrome Extension</strong>.</span>
          </div>

          {/* Reactions Bar */}
          <div className="flex gap-3 justify-center mt-4 glass-panel p-2 mx-auto" style={{ width: 'fit-content' }}>
            <button onClick={() => handleSendReaction('heart')} className="p-2 hover:bg-white/10 rounded-full transition-colors text-xl" title="Heart">❤️</button>
            <button onClick={() => handleSendReaction('laugh')} className="p-2 hover:bg-white/10 rounded-full transition-colors text-xl" title="Laugh">😂</button>
            <button onClick={() => handleSendReaction('shock')} className="p-2 hover:bg-white/10 rounded-full transition-colors text-xl" title="Shocked">😲</button>
            <button onClick={() => handleSendReaction('thumbs')} className="p-2 hover:bg-white/10 rounded-full transition-colors text-xl" title="Thumbs Up">👍</button>
          </div>

          {/* Playlist */}
          <div className="glass-panel mt-6 p-4">
            <h3 className="font-semibold text-lg flex items-center gap-2 mb-3">
              <ListVideo className="w-5 h-5 text-indigo-400" />
              Up Next
              <span className="bg-white/10 text-xs px-2 py-0.5 rounded-full ml-2">{room.playlist?.length || 0}</span>
            </h3>
            {room.playlist && room.playlist.length > 0 ? (
              <ul className="flex gap-3 overflow-x-auto pb-2">
                {room.playlist.map((vid, idx) => (
                  <li key={idx} className="shrink-0 w-48 h-28 relative rounded-lg overflow-hidden border border-white/10 bg-black/50 group">
                    <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" alt="Video thumbnail" />
                    <div className="absolute top-1 left-2 bg-black/60 px-2 py-0.5 rounded text-xs font-mono">{idx + 1}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 italic">No videos in the queue. Add one above!</p>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* ═══ Sidebar — Chat & Users ═══ */}
      <div 
        className={`transition-all duration-700 ${isTheatreMode ? 'w-0 opacity-0 overflow-hidden' : 'w-full md:w-[360px] lg:w-[400px] shrink-0 h-[500px] md:h-full flex flex-col border-t md:border-t-0 border-white/10'} relative z-10`}
        style={{
          background: 'var(--bg-color-secondary)',
          borderLeft: '1px solid rgba(255,255,255,0.05)',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.3)'
        }}
      >
        {/* Sidebar Header */}
        <div className="flex border-b border-white/5">
          <div 
            className="flex-1 py-3.5 text-center font-medium text-sm flex items-center justify-center gap-2"
            style={{ borderBottom: '2px solid var(--primary-color)' }}
          >
            <MessageSquare size={15} />
            Chat
          </div>
          <div className="flex-1 py-3.5 text-center font-medium text-sm text-gray-500 flex items-center justify-center gap-2">
            <Users size={15} />
            {room.users.length}/2
          </div>
        </div>

        {/* User Presence Bar */}
        <div className="px-4 py-3 border-b border-white/5 flex gap-2 overflow-x-auto" style={{ background: 'rgba(255,255,255,0.02)' }}>
          {room.users.map(u => (
            <div 
              key={u.id} 
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs whitespace-nowrap"
              style={{ 
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.06)'
              }}
            >
              <div className="w-5 h-5 shrink-0 rounded-full bg-white/5 flex items-center justify-center overflow-hidden">
                {u.avatar ? (
                  <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${u.avatar}`} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  u.name.charAt(0)
                )}
              </div>
              <span className="text-gray-300 flex items-center gap-1">
                {u.name}
                {u.id === room.hostId && <Crown className="w-3 h-3 text-yellow-400" />}
              </span>
              {u.id === socket.id && (
                <span className="text-gray-600 text-[9px]">(you)</span>
              )}
              <div className="status-dot online" style={{ width: '6px', height: '6px' }}></div>
            </div>
          ))}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-600 text-sm">
              <MessageSquare size={32} className="opacity-20 mb-3" />
              <p>No messages yet</p>
              <p className="text-xs text-gray-700 mt-1">Say hi to your friends!</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div 
              key={msg.id || i} 
              className={`flex flex-col chat-msg-enter ${
                msg.userId === 'system' ? 'items-center' 
                : msg.userId === socket.id ? 'items-end' 
                : 'items-start'
              }`}
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              {msg.userId === 'system' ? (
                <span 
                  className="text-[11px] text-gray-600 px-3 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  {msg.text}
                </span>
              ) : (
                <>
                  <span className="text-[11px] text-gray-600 mb-1 mx-2">
                    {msg.userId === socket.id ? 'You' : msg.userName}
                  </span>
                  <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] text-sm leading-relaxed ${
                    msg.userId === socket.id 
                      ? 'rounded-br-md text-white' 
                      : 'rounded-bl-md text-gray-200'
                  }`}
                  style={{
                    background: msg.userId === socket.id 
                      ? 'linear-gradient(135deg, var(--primary-color), #8b5cf6)'
                      : 'rgba(255,255,255,0.06)',
                    boxShadow: msg.userId === socket.id
                      ? '0 4px 12px rgba(99, 102, 241, 0.2)'
                      : 'none'
                  }}>
                    {msg.text}
                  </div>
                </>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing Indicator */}
        {typingUsers.size > 0 && (
          <div className="px-4 py-1 text-xs text-gray-500 italic flex items-center gap-2">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
            </span>
            {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
          </div>
        )}

        {/* Chat Input */}
        <form 
          onSubmit={handleSendMessage} 
          className="p-3 border-t border-white/5"
          style={{ background: 'var(--bg-color-secondary)' }}
        >
          <div 
            className="flex gap-2 items-center rounded-xl px-3 py-1"
            style={{ 
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <input 
              type="text" 
              placeholder="Type a message..." 
              className="flex-1 bg-transparent border-none py-2.5 text-sm"
              style={{ boxShadow: 'none' }}
              value={chatInput}
              onChange={handleTyping}
            />
            <button 
              type="submit" 
              className="p-2 rounded-lg shrink-0"
              style={{ 
                background: chatInput.trim() ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)',
                boxShadow: chatInput.trim() ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none',
                padding: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
