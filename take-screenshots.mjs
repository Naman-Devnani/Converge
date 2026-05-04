import { chromium } from 'playwright';
import path from 'path';
import { mkdirSync } from 'fs';

const ASSETS = path.resolve('C:/Users/devna/Documents/MeetSync/.github/assets');
mkdirSync(ASSETS, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  geolocation: { latitude: 23.0335, longitude: 72.5849, accuracy: 10 },
  permissions: ['geolocation'],
});

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Walk the React fiber tree and call cb(fiber) on every node. */
function walkFiber(root, cb) {
  const stack = [root];
  while (stack.length) {
    const f = stack.pop();
    if (!f) continue;
    cb(f);
    if (f.child)   stack.push(f.child);
    if (f.sibling) stack.push(f.sibling);
  }
}

/** Return the fiber root key (__reactFiber... or __reactContainer...) on an element. */
function fiberKey(el) {
  return Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'));
}

// ─── inject fake participants into SessionState ───────────────────────────────
async function injectParticipants(page) {
  await page.evaluate(() => {
    const el  = document.querySelector('#root');
    const key = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'));
    const now = Date.now();

    function walk(f) {
      if (!f) return;
      let h = f.memoizedState;
      while (h) {
        const s = h.memoizedState;
        if (s && s.participants && s.sessionId && s.myId && h.queue?.dispatch) {
          h.queue.dispatch({
            ...s,
            participants: {
              ...s.participants,
              f1: { id:'f1', name:'Priya', lat:23.0385, lng:72.5895, accuracy:12, heading:null, speed:null, lastUpdate:now, color:'#3b82f6', joinedAt:now-120000, online:true, lastSeen:now },
              f2: { id:'f2', name:'Raj',   lat:23.0258, lng:72.5798, accuracy:18, heading:null, speed:null, lastUpdate:now, color:'#10b981', joinedAt:now-90000,  online:true, lastSeen:now },
              f3: { id:'f3', name:'Aisha', lat:23.0345, lng:72.5762, accuracy:10, heading:null, speed:null, lastUpdate:now, color:'#f59e0b', joinedAt:now-60000,  online:true, lastSeen:now },
            },
          });
          return;
        }
        h = h.next;
      }
      walk(f.child);
      walk(f.sibling);
    }
    walk(el[key]);
  });
}

// ─── 1. Home page ─────────────────────────────────────────────────────────────
const home = await ctx.newPage();
await home.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await home.screenshot({ path: path.join(ASSETS, 'screenshot-home.png') });
console.log('✅ home');

// ─── 2. Home — Advanced settings (password + expiry + participant limit) ───────
await home.click('button:has-text("Advanced")');
await home.waitForTimeout(400);
// Pre-fill a generated password so it shows in the UI
await home.evaluate(() => {
  const input = document.querySelector('input[type=password], input[type=text][placeholder*="password" i], input[autocomplete="new-password"]');
  if (!input) {
    // find by looking through inputs on the page
    const allInputs = [...document.querySelectorAll('input')];
    // The password input is likely the one that changes type
  }
});
// Click the generate password button if available, or type directly
const genBtn = await home.$('button[aria-label*="enerate" i], button:has-text("Generate")');
if (genBtn) {
  await genBtn.click();
  await home.waitForTimeout(200);
}
await home.screenshot({ path: path.join(ASSETS, 'screenshot-advanced.png') });
console.log('✅ advanced');

// ─── 3. Home — Venue picker ───────────────────────────────────────────────────
// Enable venue mode toggle (still on home page with advanced open)
const venueToggle = await home.$('[aria-label="Toggle venue mode"]');
if (venueToggle) {
  await venueToggle.click();
  await home.waitForTimeout(400);
}
await home.screenshot({ path: path.join(ASSETS, 'screenshot-venue.png') });
console.log('✅ venue');

// ─── 4. Home — Session history ───────────────────────────────────────────────
const historyPage = await ctx.newPage();
// Inject fake history into localStorage before loading the page
await historyPage.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await historyPage.evaluate(() => {
  const history = [
    { sessionId: 'airport2024',    sessionName: 'Airport Pickup',   joinedAt: Date.now() - 86400000 * 2 },
    { sessionId: 'concert99',      sessionName: 'Weekend Concert',  joinedAt: Date.now() - 86400000 * 5 },
    { sessionId: 'collegefest01',  sessionName: 'College Fest',     joinedAt: Date.now() - 86400000 * 8 },
  ];
  localStorage.setItem('meetsync_history', JSON.stringify(history));
});
await historyPage.reload({ waitUntil: 'networkidle' });
await historyPage.screenshot({ path: path.join(ASSETS, 'screenshot-history.png') });
console.log('✅ history');

// ─── 5. Join / consent modal ──────────────────────────────────────────────────
const join = await ctx.newPage();
await join.goto('http://localhost:5173/session/screenshotdemo99', { waitUntil: 'networkidle' });
await join.waitForSelector('text=Share My Location', { timeout: 8000 });
await join.screenshot({ path: path.join(ASSETS, 'screenshot-join.png') });
console.log('✅ join');

// ─── 6. Live map — host joins + fake participants ─────────────────────────────
const map = await ctx.newPage();
await map.goto('http://localhost:5173/session/screenshotdemo99', { waitUntil: 'networkidle' });
await map.waitForSelector('text=Share My Location', { timeout: 8000 });
await map.fill('input[type=text]', 'Naman');
await map.click('text=Share My Location');
await map.waitForTimeout(3500);
await injectParticipants(map);
await map.waitForTimeout(2500);
await map.screenshot({ path: path.join(ASSETS, 'screenshot-map.png') });
console.log('✅ map');

// ─── 7. Chat panel — two-tab real socket messages ────────────────────────────
// Create a fresh session via Home page (Tab A = host)
const chatHost = await ctx.newPage();
await chatHost.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await chatHost.click('button:has-text("Create Meetup")');
await chatHost.waitForURL(/\/session\//, { timeout: 10000 });
const sessionUrl = chatHost.url();

// Host joins with geolocation
await chatHost.waitForSelector('text=Share My Location', { timeout: 8000 });
await chatHost.fill('input[type=text]', 'Naman');
await chatHost.click('text=Share My Location');
await chatHost.waitForTimeout(2500);

// Guest joins same session (Tab B)
const chatGuest = await ctx.newPage();
await chatGuest.goto(sessionUrl, { waitUntil: 'networkidle' });
await chatGuest.waitForSelector('text=Share My Location', { timeout: 8000 });
await chatGuest.fill('input[type=text]', 'Priya');
await chatGuest.click('text=Share My Location');
await chatGuest.waitForTimeout(2000);

// Guest opens chat and sends messages
await chatGuest.click('[aria-label="Open chat"]');
await chatGuest.waitForTimeout(400);

const messages = [
  "Hey! I'm near the main gate 👋",
  "I can see the blue sign from here",
  "Coming in 2 mins!",
];
for (const msg of messages) {
  await chatGuest.fill('input[placeholder="Message…"]', msg);
  await chatGuest.press('input[placeholder="Message…"]', 'Enter');
  await chatGuest.waitForTimeout(350);
}

// Host also sends one reply
await chatHost.click('[aria-label="Open chat"]');
await chatHost.waitForTimeout(400);
await chatHost.fill('input[placeholder="Message…"]', "Got it, I'll walk towards you 🚶");
await chatHost.press('input[placeholder="Message…"]', 'Enter');
await chatHost.waitForTimeout(600);

// Also inject fake participants so the map behind looks rich
await injectParticipants(chatHost);
await chatHost.waitForTimeout(500);

// Take screenshot from host's chat view
await chatHost.screenshot({ path: path.join(ASSETS, 'screenshot-chat.png') });
console.log('✅ chat');

// ─── 8. Share / Invite modal ─────────────────────────────────────────────────
await map.click('text=Invite');
await map.waitForTimeout(800);
await map.screenshot({ path: path.join(ASSETS, 'screenshot-share.png') });
console.log('✅ share');

await browser.close();
console.log('All done!');
