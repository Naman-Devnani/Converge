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
}

export interface Session {
  id: string;
  createdAt: number;
  expiresAt: number;
  participants: Record<string, Participant>;
  emptyAt: number | null;
}
