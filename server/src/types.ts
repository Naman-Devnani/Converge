export interface VenuePoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface Participant {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  lastUpdate: number | null;
  color: string;
  joinedAt: number;
  online: boolean;
  lastSeen: number;
}

export interface ChatMessage {
  id: string;
  participantId: string;
  participantName: string;
  color: string;
  text: string;
  timestamp: number;
}

export interface Session {
  id: string;
  name: string;
  hostSocketId: string;
  createdAt: number;
  expiresAt: number;
  participants: Record<string, Participant>;
  emptyAt: number | null;
  passwordHash: string | null;   // C-2: stored as "salt:scryptHash"
  maxParticipants: number;
  messages: ChatMessage[];
  venuePoints: VenuePoint[];
}
