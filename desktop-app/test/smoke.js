// Starts the app, walks the pet around with fake cursor moves, tries each action, and saves a
// screenshot of the overlay to test/smoke.png. Run: npm test
const { app } = require('electron');
const path = require('path');
require('../src/main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await wait(2500);
  const o = global.cursorPuppyApp.overlay;
  const js = (code) => o.webContents.executeJavaScript(code);
  const state = () => js('({ act: cursorPuppy.pet.act, mode: cursorPuppy.S.mode, x: Math.round(cursorPuppy.pet.x), y: Math.round(cursorPuppy.pet.y) })');
  const moveFor = async (ms, x, y) => { for (let t = 0; t < ms; t += 50) { o.webContents.send('pet:cursor', { x: x + (t % 200) / 20, y }); await wait(50); } };
  const results = [];
  await moveFor(2500, 600, 300); results.push(['follow', await state()]);
  o.webContents.send('pet:action', { type: 'act', value: 'tie' }); await moveFor(4000, 600, 300); results.push(['tie', await state()]);
  o.webContents.send('pet:action', { type: 'act', value: 'sleep' }); await moveFor(4000, 600, 300); results.push(['sleep', await state()]);
  o.webContents.send('pet:action', { type: 'act', value: 'ball' }); await moveFor(4000, 600, 300); results.push(['ball', await state()]);
  o.webContents.send('pet:action', { type: 'species', value: 'panda' }); await moveFor(500, 600, 300);
  o.webContents.send('pet:action', { type: 'act', value: 'call' }); await moveFor(1500, 600, 300);
  await js('cursorPuppy.S.napMs = 1500'); await wait(3500); results.push(['nap', await state()]);
  const img = await o.webContents.capturePage();
  require('fs').writeFileSync(path.join(__dirname, 'smoke.png'), img.toPNG());
  console.log(JSON.stringify(results));
  const ok = results[0][1].act === 'follow' && results[1][1].act === 'pace' && results[2][1].act === 'inside'
    && ['waitBall', 'chase', 'fetch'].includes(results[3][1].act) && results[4][1].act === 'nap';
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
  app.exit(ok ? 0 : 1);
});
