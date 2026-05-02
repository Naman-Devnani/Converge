/// <reference types="vite/client" />
// N-1: vite/client reference gives proper types for import.meta.env — no more `as any` casts.
import { io } from 'socket.io-client';

const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

export const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnectionAttempts: 5,
});
