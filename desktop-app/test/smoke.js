// Starts the app with the screen split into two pretend screens, walks the pet around with fake
// cursor moves (including onto the second screen), tries each action, and saves screenshots to
// test/smoke-*.png. Run: npm test
process.env.CURSOR_PUPPY_FAKE_SCREENS = process.env.CURSOR_PUPPY_FAKE_SCREENS || '2';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
require('../src/main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await wait(2500);
  const A = global.cursorPuppyApp;
  const [left, right] = A.overlays;
  const js = (o, code) => o.win.webContents.executeJavaScript(code);
  const state = async () => ({
    on: A.owner === left ? 'left' : 'right',
    ...(await js(A.owner, '({ act: cursorPuppy.pet.act, mode: cursorPuppy.S.mode, x: Math.round(cursorPuppy.pet.x), y: Math.round(cursorPuppy.pet.y) })')),
  });
  const moveFor = async (ms, gx, gy) => { for (let t = 0; t < ms; t += 50) { A.setCursor({ x: Math.round(gx + (t % 200) / 20), y: gy }); await wait(50); } };
  const act = (value) => A.owner.win.webContents.send('pet:action', { type: 'act', value });
  const L = left.bounds, R = right.bounds;
  const results = [];
  await moveFor(2500, L.x + 300, L.y + 300); results.push(['follow', await state()]);
  await moveFor(5000, R.x + 300, R.y + 300); results.push(['other screen', await state()]);
  act('sleep'); await moveFor(6000, R.x + 300, R.y + 300); results.push(['sleep from other screen', await state()]);
  act('call'); await moveFor(5000, R.x + 300, R.y + 300); results.push(['call back out', await state()]);
  act('tie'); await moveFor(6000, L.x + 300, L.y + 300); results.push(['tie', await state()]);
  act('ball'); await moveFor(4000, L.x + 300, L.y + 300); results.push(['ball', await state()]);
  A.owner.win.webContents.send('pet:action', { type: 'species', value: 'panda' });
  act('call'); await moveFor(1500, L.x + 300, L.y + 300);
  await js(A.owner, 'cursorPuppy.S.napMs = 1500'); await wait(3500); results.push(['nap', await state()]);
  for (const [name, o] of [['left', left], ['right', right]]) fs.writeFileSync(path.join(__dirname, `smoke-${name}.png`), (await o.win.webContents.capturePage()).toPNG());
  for (const r of results) console.log(r[0].padEnd(24), JSON.stringify(r[1]));
  const [f, other, sl, call, tie, ball, nap] = results.map((r) => r[1]);
  const ok = f.act === 'follow' && f.on === 'left'
    && other.on === 'right' && other.act === 'follow'
    && sl.on === 'left' && sl.act === 'inside'
    && call.on === 'right' && call.act === 'follow'
    && tie.on === 'left' && tie.act === 'pace'
    && ['waitBall', 'chase', 'fetch'].includes(ball.act) && nap.act === 'nap';
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
  app.exit(ok ? 0 : 1);
});
