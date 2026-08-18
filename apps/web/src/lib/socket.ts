import { io, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents } from '@watch-party/shared';

const isBrowser = typeof window !== 'undefined';
const defaultUrl = isBrowser ? `http://${window.location.hostname}:3001` : 'http://localhost:3001';
const URL = process.env.NEXT_PUBLIC_SOCKET_URL || defaultUrl;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL, {
  autoConnect: false,
});
