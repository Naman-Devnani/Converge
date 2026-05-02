<div align="center">

<img src="client/public/icons/icon.svg" width="80" height="80" alt="MeetSync Logo" />

# MeetSync

### Meet people, not complications.

**Privacy-first, open-source mutual live location sharing for real-world meetups.**

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socket.io)](https://socket.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[Live Demo](#) · [Report Bug](https://github.com/Naman-Devnani/MeetSync/issues) · [Request Feature](https://github.com/Naman-Devnani/MeetSync/issues)

</div>

---

## The Problem

Meeting someone in real life still looks like this:

> "Where are you?" → "I'm 5 minutes away." → "Which gate?" → "Near the entrance." → "I can't see you." → ...

This happens at **airports, malls, concerts, festivals, weddings, college campuses, first dates, group trips** — anywhere two people need to physically find each other.

Existing apps like Google Maps and WhatsApp location sharing weren't built for this. They're one-way, permanent, and require too many steps.

---

## The Solution

**Create a temporary meetup room → share a link → everyone approves location access → see each other live on the same map.**

```
"Let's meet."  →  [Share link]  →  📍 See each other in real time
```

No endless texting. No permanent tracking. No app install. Just — meet.

---

## Features

| Feature | Description |
|---|---|
| 🗺️ **Mutual live tracking** | Everyone in the session sees each other's real-time position |
| ⏱️ **Smart ETA** | Live distance and estimated time to meetup |
| 🔒 **Privacy-first** | Mutual consent required, no background tracking, no data stored after session |
| 🌫️ **Approximate mode** | Optional ±500 m location blur for extra privacy |
| 🎉 **Arrived alerts** | Auto-notification when someone reaches within 80 m of you |
| 🔗 **No install needed** | Web-first — share a link, open in browser, done |
| ⏳ **Auto-expiring sessions** | Sessions expire 2 hours after creation or 10 min after everyone leaves |
| 📱 **PWA ready** | Add to Home Screen on iOS and Android |
| 🌐 **Open source** | Transparent codebase — no dark patterns, no data selling |

---

## How It Works

```
┌─────────────┐     share link     ┌─────────────┐
│   Alice     │ ──────────────────▶│    Bob      │
│  creates    │                    │   joins     │
│  session    │                    │  session    │
└──────┬──────┘                    └──────┬──────┘
       │  consents to location            │  consents to location
       ▼                                  ▼
  📍 Alice's pin                     📍 Bob's pin
       │                                  │
       └──────────── Live Map ────────────┘
                  Both see each other
                  Distance + ETA shown
                  🎉 "Bob has arrived!" at 80m
```

1. **Create** — tap "Create Meetup", get a unique session URL
2. **Share** — send the link via WhatsApp, iMessage, any app
3. **Consent** — each person approves location sharing (browser prompt)
4. **Meet** — live map shows everyone moving in real time
5. **Done** — close the tab, session ends, no trace left

---

## Tech Stack

```
Frontend                    Backend
────────────────────        ────────────────────
React 18 + TypeScript       Node.js + Express
Vite 5                      Socket.io 4
Tailwind CSS 3              In-memory session store
react-leaflet 4             TypeScript
CartoDB dark map tiles      
```

**Why these choices?**
- **No database** — sessions are ephemeral by design. Nothing to breach.
- **OpenStreetMap / CartoDB** — free map tiles, no API key, no third-party tracking
- **Socket.io** — battle-tested real-time WebSocket library
- **Web-first** — geolocation works in any modern browser over HTTPS

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Local Development

```bash
# 1. Clone the repo
git clone https://github.com/Naman-Devnani/MeetSync.git
cd MeetSync

# 2. Install all dependencies
npm install
npm install --workspace=server
npm install --workspace=client

# 3. Start both servers
npm run dev
```

| Service | URL |
|---|---|
| Client (React) | http://localhost:5173 |
| Server (API + Sockets) | http://localhost:3001 |

### Test with two people locally

Open **two browser tabs** at `http://localhost:5173` — each tab simulates a different user. Both will appear on the map once location is granted.

---

## Deployment (Render — Free)

This repo includes a `render.yaml` for one-click deployment.

### Steps

1. Push this repo to GitHub ✅
2. Sign up at [render.com](https://render.com) (no credit card required)
3. Click **New +** → **Blueprint**
4. Connect your GitHub account → select `MeetSync`
5. Click **Apply**

Render will automatically:
- Run `npm ci && npm run build`
- Start `node server/dist/index.js`
- Assign a `https://meetsync.onrender.com` URL with auto HTTPS

> **Why HTTPS matters:** Browsers only allow geolocation on secure origins (HTTPS or localhost). Without it, location sharing won't work on real devices.

### Environment Variables

No secrets required. The only env vars set at deploy time:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Set automatically by Render |

---

## Project Structure

```
MeetSync/
├── client/                    # React frontend (Vite)
│   ├── public/
│   │   ├── manifest.json      # PWA manifest
│   │   └── icons/icon.svg     # App icon
│   └── src/
│       ├── pages/
│       │   ├── Home.tsx       # Landing page
│       │   └── Session.tsx    # Live map session
│       ├── components/
│       │   ├── MeetMap.tsx         # Leaflet map + live markers
│       │   ├── ConsentModal.tsx    # Privacy consent + name picker
│       │   ├── ShareModal.tsx      # Copy/share session link
│       │   └── ParticipantList.tsx # Distance + ETA cards
│       └── utils/
│           └── geo.ts         # Haversine, ETA, privacy blur
│
├── server/                    # Node.js backend
│   └── src/
│       ├── index.ts           # Express + Socket.io server
│       ├── sessions.ts        # In-memory session store
│       └── types.ts           # Shared TypeScript types
│
├── render.yaml                # One-click Render deployment
└── package.json               # npm workspaces root
```

---

## Privacy Design

MeetSync was built with privacy as a core constraint, not an afterthought.

- **Mutual consent** — nobody can see you without your explicit approval
- **No accounts** — no email, no password, no profile
- **No persistent storage** — locations exist only in RAM during the session
- **Auto-expiry** — sessions self-destruct after 2 hours or 10 min of inactivity
- **Approximate mode** — opt-in ±500 m grid snap to share area, not exact position
- **Open source** — the entire codebase is auditable. No hidden telemetry.

---

## Roadmap

- [ ] Approximate location mode improvements (custom radius)
- [ ] Named sessions ("Airport pickup", "Festival meetup")
- [ ] Session history (last 5 sessions, local storage only)
- [ ] AI-powered meetup point suggestions for crowded venues
- [ ] Self-hosting guide (Docker)
- [ ] Native mobile apps (React Native)

---

## Contributing

Contributions are welcome! This is an open-source project built for people, not profit.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature
git commit -m "Add your feature"
git push origin feature/your-feature
# Open a Pull Request
```

Please open an issue first for major changes.

---

## License

MIT © [Naman Devnani](https://github.com/Naman-Devnani)

---

<div align="center">

**Built for people — not surveillance capitalism.**

*Simple. Temporary. Private. Open-source.*

</div>
