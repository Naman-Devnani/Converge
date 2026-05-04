# Contributing to Converge

Thanks for your interest in contributing! Converge is an open-source project built for people, not profit. Every contribution — bug fixes, features, docs, or feedback — is welcome.

## Before You Start

Please **open an issue first** for any significant change. This avoids duplicate work and lets us discuss the best approach before you invest time coding.

For small fixes (typos, minor bugs), you can open a PR directly.

## Development Setup

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/Converge.git
cd Converge

# 2. Install all dependencies (npm workspaces)
npm install

# 3. Start both servers concurrently
npm run dev
```

| Service | URL |
|---|---|
| Client (React + Vite) | http://localhost:5173 |
| Server (API + Sockets) | http://localhost:3001 |

Open **two or more browser tabs** at `http://localhost:5173` to simulate multiple users.

## Project Structure

```
Converge/
├── client/src/
│   ├── pages/        # Home.tsx, Session.tsx
│   ├── components/   # Map, Chat, Modals, etc.
│   └── utils/        # geo, password, history, sanitize
└── server/src/
    ├── index.ts      # Express + Socket.io
    └── sessions.ts   # In-memory session store
```

## Guidelines

### Privacy First
Converge's core promise is **mutual consent, no persistence, no accounts**. Any contribution must respect this:
- Don't add databases or persistent user storage
- Don't add third-party analytics or tracking
- Don't require login or account creation
- Location data must stay ephemeral (RAM only, cleared on session end)

### Code Style
- TypeScript everywhere — no `any` unless absolutely necessary
- Validate and sanitize all user inputs on the server
- Use `crypto.getRandomValues()` for anything random — never `Math.random()`
- Keep components focused — split large files rather than growing them

### Commits
Use clear, descriptive commit messages:
```
feat: add custom expiry time picker
fix: prevent duplicate arrival notifications
docs: update deployment guide for Railway
```

## Pull Request Process

1. Fork → branch (`git checkout -b feature/your-feature`)
2. Make your changes
3. Test manually with multiple browser tabs
4. Push and open a Pull Request against `main`
5. Fill in the PR template
6. Wait for review — we'll respond as soon as we can

## Reporting Bugs

Use the **Bug Report** issue template. Include your browser, OS, and steps to reproduce.

## Suggesting Features

Use the **Feature Request** issue template. Check that your idea aligns with Converge's privacy principles before submitting.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

**Built for people — not surveillance capitalism.**
