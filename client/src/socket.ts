import { io } from 'socket.io-client';

// In production the server serves the client from the same origin.
// In development the server runs separately on port 3001.
const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL ??
  ((import.meta as any).env?.PROD
    ? window.location.origin
    : 'http://localhost:3001');

export const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnectionAttempts: 5,
});
