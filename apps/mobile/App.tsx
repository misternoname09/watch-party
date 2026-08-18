import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import YoutubePlayer, { YoutubeIframeRef } from 'react-native-youtube-iframe';
import { socket } from './src/lib/socket';
import { Room, ChatMessage, PlayerState } from '@watch-party/shared';

export default function App() {
  const [inRoom, setInRoom] = useState(false);
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  
  const playerRef = useRef<YoutubeIframeRef>(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    socket.on('userJoined', (user) => {
      setRoom(prev => prev ? { ...prev, users: [...prev.users, user] } : prev);
    });

    socket.on('userLeft', (userId) => {
      setRoom(prev => prev ? { ...prev, users: prev.users.filter(u => u.id !== userId) } : prev);
    });

    socket.on('chatMessage', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('playerSync', (state) => {
      isSyncingRef.current = true;
      setRoom(prev => prev ? { ...prev, playerState: state } : prev);
      
      if (playerRef.current && state.videoId) {
        if (state.isPlaying) {
          const drift = (Date.now() - state.timestamp) / 1000;
          playerRef.current.seekTo(state.currentTime + drift, true);
        } else {
          playerRef.current.seekTo(state.currentTime, true);
        }
      }
      
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 500);
    });

    return () => {
      socket.off('userJoined');
      socket.off('userLeft');
      socket.off('chatMessage');
      socket.off('playerSync');
    };
  }, []);

  const handleCreateRoom = () => {
    if (!userName.trim()) return Alert.alert('Error', 'Please enter your name');
    const newRoomId = Math.random().toString(36).substring(2, 9);
    joinSocketRoom(newRoomId);
  };

  const handleJoinRoom = () => {
    if (!userName.trim()) return Alert.alert('Error', 'Please enter your name');
    if (!roomId.trim()) return Alert.alert('Error', 'Please enter a room ID');
    joinSocketRoom(roomId);
  };

  const joinSocketRoom = (id: string) => {
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('joinRoom', id, userName, (response) => {
      if (response.success && response.room) {
        setRoomId(id);
        setRoom(response.room);
        setInRoom(true);
      } else {
        Alert.alert('Error', response.error || 'Failed to join room');
      }
    });
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    socket.emit('sendMessage', roomId, chatInput);
    setChatInput('');
  };

  const handleLoadVideo = () => {
    if (!youtubeUrl.trim()) return;
    
    let videoId = youtubeUrl;
    if (youtubeUrl.includes('v=')) {
      videoId = youtubeUrl.split('v=')[1].split('&')[0];
    } else if (youtubeUrl.includes('youtu.be/')) {
      videoId = youtubeUrl.split('youtu.be/')[1].split('?')[0];
    }
    
    socket.emit('syncPlayer', roomId, {
      source: 'youtube',
      videoId,
      isPlaying: true,
      currentTime: 0
    });
    setYoutubeUrl('');
  };

  const onStateChange = useCallback((state: string) => {
    if (isSyncingRef.current) return;
    
    const isPlaying = state === 'playing';
    const isPaused = state === 'paused';
    
    if (isPlaying || isPaused) {
      playerRef.current?.getCurrentTime().then(currentTime => {
        socket.emit('syncPlayer', roomId, {
          isPlaying,
          currentTime,
        });
      });
    }
  }, [roomId]);

  if (!inRoom) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loginContainer}>
          <Text style={styles.title}>Watch Party</Text>
          <Text style={styles.subtitle}>Mobile Client</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Your Name"
            placeholderTextColor="#9ca3af"
            value={userName}
            onChangeText={setUserName}
          />
          
          <TouchableOpacity style={styles.primaryButton} onPress={handleCreateRoom}>
            <Text style={styles.buttonText}>Create New Room</Text>
          </TouchableOpacity>
          
          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.line} />
          </View>
          
          <TextInput
            style={styles.input}
            placeholder="Paste Room ID"
            placeholderTextColor="#9ca3af"
            value={roomId}
            onChangeText={setRoomId}
          />
          <TouchableOpacity style={styles.secondaryButton} onPress={handleJoinRoom}>
            <Text style={styles.buttonText}>Join Room</Text>
          </TouchableOpacity>
        </View>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex1}
      >
        <View style={styles.header}>
          <Text style={styles.headerText}>Room: {roomId}</Text>
          <Text style={styles.headerSubtext}>{room?.users.length} Users Connected</Text>
        </View>

        <View style={styles.playerContainer}>
          {room?.playerState.videoId ? (
            <YoutubePlayer
              ref={playerRef}
              height={220}
              play={room.playerState.isPlaying}
              videoId={room.playerState.videoId}
              onChangeState={onStateChange}
            />
          ) : (
            <View style={styles.noVideo}>
              <Text style={styles.noVideoText}>No video selected</Text>
            </View>
          )}
        </View>

        <View style={styles.urlInputContainer}>
          <TextInput
            style={[styles.input, styles.flex1, { marginBottom: 0 }]}
            placeholder="YouTube URL or ID"
            placeholderTextColor="#9ca3af"
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
          />
          <TouchableOpacity style={styles.loadButton} onPress={handleLoadVideo}>
            <Text style={styles.buttonText}>Load</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.chatContainer} contentContainerStyle={{ padding: 10 }}>
          {messages.map((msg, i) => (
            <View key={i} style={[
              styles.messageBubble,
              msg.userId === socket.id ? styles.myMessage : styles.theirMessage,
              msg.userId === 'system' && styles.systemMessage
            ]}>
              {msg.userId !== 'system' && msg.userId !== socket.id && (
                <Text style={styles.messageName}>{msg.userName}</Text>
              )}
              <Text style={msg.userId === 'system' ? styles.systemMessageText : styles.messageText}>
                {msg.text}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.chatInput}
            placeholder="Type a message..."
            placeholderTextColor="#9ca3af"
            value={chatInput}
            onChangeText={setChatInput}
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
            <Text style={styles.buttonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1115',
  },
  flex1: {
    flex: 1,
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 40,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 15,
    color: '#fff',
    marginBottom: 15,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#374151',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  orText: {
    color: '#9ca3af',
    paddingHorizontal: 10,
  },
  header: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtext: {
    color: '#9ca3af',
    fontSize: 14,
  },
  playerContainer: {
    backgroundColor: '#000',
    height: 220,
    width: '100%',
  },
  noVideo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noVideoText: {
    color: '#9ca3af',
  },
  urlInputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    gap: 10,
  },
  loadButton: {
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  chatContainer: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  chatInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    color: '#fff',
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 15,
    marginBottom: 10,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 5,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomLeftRadius: 5,
  },
  systemMessage: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
    padding: 5,
  },
  messageName: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    marginBottom: 2,
  },
  messageText: {
    color: '#fff',
    fontSize: 14,
  },
  systemMessageText: {
    color: '#9ca3af',
    fontSize: 12,
    fontStyle: 'italic',
  }
});
