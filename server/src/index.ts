import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSockets } from './sockets';
import { ClientToServerEvents, ServerToClientEvents } from '@watch-party/shared';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: '*', // For development only, configure properly in production
    methods: ['GET', 'POST']
  }
});

setupSockets(io);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
