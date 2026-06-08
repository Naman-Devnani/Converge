export interface VenuePoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface Participant {
  id: string;
  clientId?: string;
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

export interface SessionState {
  sessionId: string;
  myId: string;
  participants: Record<string, Participant>;
  expiresAt: number;
  sessionName: string;
  hostId: string;
  venuePoints: VenuePoint[];
}

export interface ChatMessage {
  id: string;
  participantId: string;
  participantName: string;
  color: string;
  text: string;
  timestamp: number;
}
