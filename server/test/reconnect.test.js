'use strict';
// Integration test: boots the built server on a test port and exercises the socket flows
// that unit tests can't — host reclaim across a reconnect, and clientId de-duplication.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const { io } = require('socket.io-client');

const PORT = 3987;
const URL = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${URL}/health`, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => { req.destroy(); resolve(false); });
  });
}

function mk() { return io(URL, { autoConnect: false, reconnection: false, transports: ['websocket'] }); }
function connect(sock) { sock.connect(); return new Promise((r) => sock.on('connect', r)); }

test('host reclaim + clientId de-dup over a reconnect', async (t) => {
  const child = spawn('node', [path.join(__dirname, '..', 'dist', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
    stdio: 'ignore',
  });
  t.after(() => child.kill());

  // Wait for the server to come up.
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { up = await ping(); if (!up) await wait(150); }
  assert.ok(up, 'server did not start');

  const SID = 'intg' + Math.random().toString(36).slice(2, 10);
  const TOKEN = 'tok-1111-2222-3333';

  // Host creates the session first (as in real usage: the creator navigates with isHost).
  const host = mk();
  let hostJoined = null;
  host.on('session-joined', (d) => { hostJoined = d; });
  await connect(host);
  host.emit('join-session', { sessionId: SID, name: 'Hosty', clientId: 'cid-host', config: { hostToken: TOKEN } });
  await wait(300);
  assert.equal(hostJoined.isHost, true, 'host should be host');
  const oldHostSocketId = hostJoined.myId;

  // Observer joins afterwards and watches room membership events.
  const observer = mk();
  let lefts = [];
  observer.on('participant-left', ({ participantId }) => lefts.push(participantId));
  await connect(observer);
  await new Promise((r) => { observer.on('session-joined', r); observer.emit('join-session', { sessionId: SID, name: 'Obs', clientId: 'cid-obs' }); });

  // Host reconnects: brand-new socket, same token + same clientId.
  host.disconnect();
  await wait(150);
  const host2 = mk();
  let host2Joined = null, host2Err = null;
  host2.on('session-joined', (d) => { host2Joined = d; });
  host2.on('error', (e) => { host2Err = e; });
  await connect(host2);
  host2.emit('join-session', { sessionId: SID, name: 'Hosty', clientId: 'cid-host', config: { hostToken: TOKEN } });
  await wait(400);

  assert.equal(host2Err, null, 'no error on reconnect');
  assert.equal(host2Joined.isHost, true, 'host reclaims host on reconnect');

  // De-dup: exactly one participant carries clientId cid-host (no duplicate from the old socket).
  const hostEntries = host2Joined.participants.filter((p) => p.clientId === 'cid-host');
  assert.equal(hostEntries.length, 1, 'reconnect must not create a duplicate participant');
  assert.equal(hostEntries[0].id, host2Joined.myId, 'the surviving entry is the new socket');

  // Observer should have seen the old host socket leave (stale marker removed).
  assert.ok(lefts.includes(oldHostSocketId), 'observer saw the old socket leave');

  observer.disconnect();
  host2.disconnect();
  await wait(100);
});
