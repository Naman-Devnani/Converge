import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import { mkdirSync } from 'fs';

const ASSETS = path.resolve('C:/Users/devna/Documents/MeetSync/.github/assets');
mkdirSync(ASSETS, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

// 1. Home page
const home = await ctx.newPage();
await home.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await home.screenshot({ path: path.join(ASSETS, 'screenshot-home.png') });
console.log('✅ home');

// 2. Join / consent modal (as a guest)
const join = await ctx.newPage();
await join.goto('http://localhost:5173/session/screenshotdemo99', { waitUntil: 'networkidle' });
await join.waitForSelector('text=Share My Location', { timeout: 6000 });
await join.screenshot({ path: path.join(ASSETS, 'screenshot-join.png') });
console.log('✅ join');

// 3. Live map — host joins, fake participants injected
const map = await ctx.newPage();
await map.goto('http://localhost:5173/session/screenshotdemo99', { waitUntil: 'networkidle' });
await map.waitForSelector('text=Share My Location', { timeout: 6000 });
await map.fill('input[type=text]', 'Naman');
await map.click('text=Share My Location');
await map.waitForTimeout(3500);

await map.evaluate(() => {
  const el = document.querySelector('#root');
  const key = Object.keys(el).find(k => k.startsWith('__react'));
  function find(f, d = 0) {
    if (!f || d > 50) return;
    let h = f.memoizedState;
    while (h) {
      const s = h.memoizedState;
      if (s && s.participants && s.sessionId && s.myId) {
        const now = Date.now();
        h.queue.dispatch({
          ...s,
          participants: {
            ...s.participants,
            f1: { id:'f1', name:'Priya', lat:23.0385, lng:72.5895, accuracy:12, heading:null, speed:null, lastUpdate:now, color:'#3b82f6', joinedAt:now-120000, online:true, lastSeen:now },
            f2: { id:'f2', name:'Raj',   lat:23.0258, lng:72.5798, accuracy:18, heading:null, speed:null, lastUpdate:now, color:'#10b981', joinedAt:now-90000,  online:true, lastSeen:now },
            f3: { id:'f3', name:'Aisha', lat:23.0345, lng:72.5762, accuracy:10, heading:null, speed:null, lastUpdate:now, color:'#f59e0b', joinedAt:now-60000,  online:true, lastSeen:now },
          }
        });
        return;
      }
      h = h.next;
    }
    find(f.child, d + 1);
    find(f.sibling, d + 1);
  }
  find(el[key]);
});
await map.waitForTimeout(2500);
await map.screenshot({ path: path.join(ASSETS, 'screenshot-map.png') });
console.log('✅ map');

// 4. Share / Invite modal
await map.click('text=Invite');
await map.waitForTimeout(800);
await map.screenshot({ path: path.join(ASSETS, 'screenshot-share.png') });
console.log('✅ share');

await browser.close();
console.log('All done!');
