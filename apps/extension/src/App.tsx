import { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '@watch-party/shared';

export default function App() {
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState('http://localhost:3001');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.storage.local.get(['serverUrl'], (result) => {
      if (result.serverUrl) setServerUrl(result.serverUrl);
    });
    const listener = (message: any) => {
      if (message.type === 'CHAT_MESSAGE') {
        setMessages(prev => [...prev, message.msg]);
        scrollToBottom();
      }
      if (message.type === 'USER_JOINED') {
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          userId: 'system',
          userName: 'System',
          text: `${message.user.name} joined`,
          timestamp: Date.now()
        }]);
      }
      if (message.type === 'USER_LEFT') {
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          userId: 'system',
          userName: 'System',
          text: `User left the room`,
          timestamp: Date.now()
        }]);
      }
    };
    
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleJoin = async () => {
    if (!userName || !roomId) {
      setError("Please fill in all fields");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url?.includes('netflix.com/watch')) {
      setError("Navigate to a netflix.com/watch page first!");
      return;
    }

    setError(null);
    chrome.runtime.sendMessage({
      type: 'JOIN_ROOM',
      roomId,
      userName,
      tabId: tab.id
    }, (response) => {
      if (response && response.success) {
        setInRoom(true);
      } else {
        setError(response?.error || 'Failed to connect. Is the server running?');
      }
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    chrome.runtime.sendMessage({ type: 'SEND_MESSAGE', text: chatInput });
    setChatInput('');
  };

  // ─── Login Screen ───
  if (!inRoom) {
    return (
      <div className="login-screen">
        <div className="login-header">
          <div className="login-logo">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" fill="white" />
            </svg>
          </div>
          <div className="login-title">
            <span>Netflix</span> Sync
          </div>
          <p className="login-subtitle">Watch together, perfectly in sync</p>
        </div>

        <div className="login-form">
          {error && <div className="login-error">{error}</div>}
          
          <div style={{ marginBottom: '14px' }}>
            <label className="login-label">Your Name</label>
            <input 
              type="text" 
              placeholder="Enter your name" 
              value={userName} 
              onChange={e => setUserName(e.target.value)} 
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label className="login-label">Server URL</label>
            <input 
              type="text" 
              placeholder="http://localhost:3001" 
              value={serverUrl} 
              onChange={e => {
                setServerUrl(e.target.value);
                chrome.storage.local.set({ serverUrl: e.target.value });
                chrome.runtime.sendMessage({ type: 'UPDATE_URL', url: e.target.value });
              }} 
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="login-label">Room ID</label>
            <input 
              type="text" 
              placeholder="Enter or create a room ID" 
              value={roomId} 
              onChange={e => setRoomId(e.target.value)} 
            />
          </div>
          
          <button onClick={handleJoin}>
            Connect & Sync
          </button>

          <div className="login-netflix-note" style={{ marginTop: '16px' }}>
            Make sure you're on a <strong style={{ color: '#e50914' }}>netflix.com/watch</strong> page before connecting.
          </div>

          <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '10px', color: 'var(--text-color-dim)' }}>
            Created by <strong style={{ color: '#c084fc' }}>KTECH</strong>
          </div>
        </div>
      </div>
    );
  }

  // ─── Chat Screen ───
  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-logo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" fill="white" />
          </svg>
        </div>
        <div className="chat-header-info">
          <div className="chat-header-title">Watch Party</div>
          <div className="chat-header-status">
            <span className="chat-header-status-dot"></span>
            Syncing with Netflix
          </div>
        </div>
        <span className="chat-room-tag">{roomId}</span>
      </div>

      {/* Messages */}
      <div className="messages">
        {messages.length === 0 && (
          <div className="messages-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>No messages yet</span>
            <span style={{ fontSize: '11px', opacity: 0.5 }}>Chat with your watch buddy!</span>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.userId !== 'system' && msg.userName !== userName && (
              <div className="message-sender">{msg.userName}</div>
            )}
            <div className={`message ${
              msg.userId === 'system' ? 'system' 
              : msg.userName === userName ? 'mine' 
              : 'theirs'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <form onSubmit={handleSendMessage} className="chat-input-wrapper">
          <input 
            type="text" 
            placeholder="Type a message..." 
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
          />
          <button 
            type="submit" 
            className={!chatInput.trim() ? 'inactive' : ''}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
