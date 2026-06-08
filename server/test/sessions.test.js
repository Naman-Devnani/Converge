'use strict';
// Unit tests for the core session logic. Run via `npm test` in the server workspace
// (builds first, then `node --test`). Uses Node's built-in test runner — no extra deps.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../dist/sessions.js');

test.after(() => S.stopCleanup()); // let the process exit (cancels the cleanup interval)

let n = 0;
const newId = () => `sess-test-${process.pid}-${n++}`;

test('getOrCreateSession creates once, then returns existing', () => {
  const id = newId();
  const a = S.getOrCreateSession(id, { name: 'Trip' });
  assert.equal(a.created, true);
  assert.equal(a.session.name, 'Trip');
  const b = S.getOrCreateSession(id, { name: 'Ignored' });
  assert.equal(b.created, false);
  assert.equal(b.session.name, 'Trip'); // config ignored on existing
});

test('expiryHours is clamped to [1, 24]; bad values fall back to 2h', () => {
  const hour = 3600_000;
  const lo = S.getOrCreateSession(newId(), { expiryHours: 0 }).session;
  assert.ok(lo.expiresAt - lo.createdAt >= hour - 50 && lo.expiresAt - lo.createdAt <= hour + 1000);
  const hi = S.getOrCreateSession(newId(), { expiryHours: 999 }).session;
  assert.ok(hi.expiresAt - hi.createdAt <= 24 * hour + 1000);
  const nan = S.getOrCreateSession(newId(), { expiryHours: NaN }).session;
  assert.ok(nan.expiresAt - nan.createdAt >= 2 * hour - 50);
});

test('maxParticipants is clamped to [2, 50]', () => {
  assert.equal(S.getOrCreateSession(newId(), { maxParticipants: 1 }).session.maxParticipants, 2);
  assert.equal(S.getOrCreateSession(newId(), { maxParticipants: 999 }).session.maxParticipants, 50);
  assert.equal(S.getOrCreateSession(newId(), {}).session.maxParticipants, 20);
});

test('addParticipant enforces capacity', () => {
  const id = newId();
  S.getOrCreateSession(id, { maxParticipants: 2 });
  assert.ok(S.addParticipant(id, 's1', 'A'));
  assert.ok(S.addParticipant(id, 's2', 'B'));
  assert.equal(S.addParticipant(id, 's3', 'C'), null); // full
});

test('hostToken is stored on create and used by reclaim flow', () => {
  const id = newId();
  const { session } = S.getOrCreateSession(id, { hostToken: 'tok-abc-123' });
  assert.equal(session.hostToken, 'tok-abc-123');
  S.addParticipant(id, 'sockOld', 'Host');
  S.setHost(id, 'sockOld');
  assert.equal(S.isHost(id, 'sockOld'), true);
  // reclaim re-points host to the new socket id
  S.reclaimHost(id, 'sockNew');
  assert.equal(S.isHost(id, 'sockNew'), true);
  assert.equal(S.isHost(id, 'sockOld'), false);
});

test('findParticipantByClientId locates the reconnecting user', () => {
  const id = newId();
  S.getOrCreateSession(id, {});
  S.addParticipant(id, 'sockA', 'Alice', 'client-alice');
  const found = S.findParticipantByClientId(id, 'client-alice');
  assert.ok(found);
  assert.equal(found.id, 'sockA');
  assert.equal(S.findParticipantByClientId(id, 'nope'), undefined);
});

test('addParticipant reuses preferred color when valid', () => {
  const id = newId();
  S.getOrCreateSession(id, {});
  const p = S.addParticipant(id, 'sockX', 'X', 'cid-x', '#3b82f6');
  assert.equal(p.color, '#3b82f6');
  // invalid preferred color is ignored, a palette color is assigned instead
  const q = S.addParticipant(id, 'sockY', 'Y', 'cid-y', 'not-a-color');
  assert.match(q.color, /^#[0-9a-f]{6}$/i);
});

test('removeParticipant marks session empty when last leaves', () => {
  const id = newId();
  S.getOrCreateSession(id, {});
  S.addParticipant(id, 's1', 'A', 'c1');
  assert.equal(S.getSession(id).emptyAt, null);
  S.removeParticipant(id, 's1');
  assert.ok(typeof S.getSession(id).emptyAt === 'number');
});

test('addMessage caps history at 100', () => {
  const id = newId();
  S.getOrCreateSession(id, {});
  for (let i = 0; i < 150; i++) {
    S.addMessage(id, { participantId: 's', participantName: 'A', color: '#fff', text: 'm' + i });
  }
  const msgs = S.getSession(id).messages;
  assert.equal(msgs.length, 100);
  assert.equal(msgs[msgs.length - 1].text, 'm149'); // newest kept
});

test('updateVenuePoints validates ids and clamps to 5', () => {
  const id = newId();
  S.getOrCreateSession(id, {});
  const pts = [];
  for (let i = 0; i < 8; i++) pts.push({ id: 'v' + i, label: 'L', lat: 1, lng: 2 });
  pts.push({ id: 'bad id!', label: 'x', lat: 0, lng: 0 });       // invalid id → dropped
  pts.push({ id: 'vNaN', label: 'x', lat: NaN, lng: 0 });         // non-finite → dropped
  const saved = S.updateVenuePoints(id, pts);
  assert.equal(saved.length, 5);
  assert.ok(saved.every(p => /^[\w-]{1,64}$/.test(p.id)));
});

test('password hashing round-trips and rejects wrong password', async () => {
  const stored = S.hashPassword('hunter2');
  assert.match(stored, /^[0-9a-f]+:[0-9a-f]+$/);
  assert.equal(await S.verifyPasswordAsync('hunter2', stored), true);
  assert.equal(await S.verifyPasswordAsync('wrong', stored), false);
  assert.equal(await S.verifyPasswordAsync('hunter2', 'malformed'), false);
});
