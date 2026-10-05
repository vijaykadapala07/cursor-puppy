// Cursor Puppy: a little pet that lives in a house at the bottom-left of your main screen and
// follows your cursor around, onto every screen you have. Each display gets its own transparent,
// always-on-top, click-through window; the pet lives in one of them at a time and is handed over
// when it walks off the edge toward another screen. Only the pet, its house, the ball and the
// options menu ever catch a click.

const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } = require('electron');
const path = require('path');

const CURSOR_EVERY_MS = 16;  // ~60 fps cursor tracking
const NAPS = [[5000, '5 seconds'], [15000, '15 seconds'], [30000, '30 seconds'], [60000, '1 minute'], [120000, '2 minutes']];
const PETS = [['morkie', 'Morkie'], ['panda', 'Panda'], ['teddy', 'Teddy']];
// For testing on one screen: CURSOR_PUPPY_FAKE_SCREENS=2 splits the main screen into two halves.
const FAKE_SCREENS = Number(process.env.CURSOR_PUPPY_FAKE_SCREENS) || 0;

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let overlays = [];       // [{ win, bounds, primary }]
let owner = null;        // the overlay the pet is in right now
let tray = null;
let pet = { species: 'morkie', name: 'Snowy', mode: 'follow', napMs: 15000 }; // reported by the page
let lastCursor = null;
let typing = false;      // true while the rename box has the keyboard
let testCursor = null;   // set by test/smoke.js instead of the real mouse
const cursorPoint = () => testCursor || screen.getCursorScreenPoint();

function displayAreas() {
  // Work areas skip the menu bar and Dock. The house lives on the main screen, just above the Dock.
  const primary = screen.getPrimaryDisplay();
  if (FAKE_SCREENS > 1) {
    const a = primary.workArea, w = Math.floor(a.width / FAKE_SCREENS);
    return Array.from({ length: FAKE_SCREENS }, (_, i) => ({ bounds: { x: a.x + i * w, y: a.y, width: w, height: a.height }, primary: i === 0 }));
  }
  return [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)]
    .map((d) => ({ bounds: d.workArea, primary: d.id === primary.id }));
}

function nearest(p) { // the overlay whose screen is closest to a point
  let best = null, bestD = Infinity;
  for (const o of overlays) {
    const b = o.bounds;
    const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.width - 1)), dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.height - 1));
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}
const primaryOverlay = () => overlays.find((o) => o.primary) || overlays[0];
const overlayOf = (sender) => overlays.find((o) => !o.win.isDestroyed() && o.win.webContents === sender);

function createOverlay(area) {
  const b = area.bounds;
  const win = new BrowserWindow({
    ...b,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,       // never steal the keyboard (except while you type a new name)
    alwaysOnTop: true,
    acceptFirstMouse: true, // macOS: the first click on the house counts even though we aren't focused
    enableLargerThanScreen: true,
    show: false,
    type: process.platform === 'darwin' ? 'panel' : (process.platform === 'linux' ? 'toolbar' : undefined),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'overlay.html'));
  const o = { win, bounds: b, primary: area.primary };
  win.webContents.on('did-finish-load', () => {
    // Tell each window whether it holds the house, and where the house is from its point of view.
    const p = primaryOverlay().bounds;
    win.webContents.send('pet:setup', {
      primary: o.primary,
      home: { x: p.x + 108 - b.x, y: p.y + p.height - 8 - b.y },
    });
  });
  win.once('ready-to-show', () => win.showInactive());
  return o;
}

function buildOverlays() {
  for (const o of overlays) if (!o.win.isDestroyed()) o.win.destroy();
  lastCursor = null;
  overlays = displayAreas().map(createOverlay);
  owner = primaryOverlay(); // the pet starts at home
}
let rebuildTimer = null;
function screensChanged() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(buildOverlays, 600); }

// Follow the real cursor everywhere (other apps, other screens) by polling it. Every window gets it,
// in its own coordinates, so the pet can tell when you've gone to another screen.
function trackCursor() {
  setInterval(() => {
    const p = cursorPoint();
    if (lastCursor && p.x === lastCursor.x && p.y === lastCursor.y) return;
    lastCursor = p;
    for (const o of overlays) if (!o.win.isDestroyed()) o.win.webContents.send('pet:cursor', { x: p.x - o.bounds.x, y: p.y - o.bounds.y });
  }, CURSOR_EVERY_MS);
}

// The pet walked off this screen: move it to the screen with the cursor (or home to the house).
ipcMain.on('pet:handoff', (e, a) => {
  const from = overlayOf(e.sender);
  if (!from || from !== owner) return;
  const gx = a.x + from.bounds.x, gy = a.y + from.bounds.y;
  let to = a.why === 'home' ? primaryOverlay() : nearest(cursorPoint());
  if (!to) to = from;
  const b = to.bounds;
  const x = Math.min(b.width + 40, Math.max(-40, gx - b.x)), y = Math.min(b.height, Math.max(90, gy - b.y));
  owner = to;
  to.win.webContents.send('pet:arrive', { x, y });
});

// The page tells us when the pointer is over something clickable.
ipcMain.on('pet:interactive', (e, on) => {
  const o = overlayOf(e.sender);
  if (!o) return;
  if (on) o.win.setIgnoreMouseEvents(false);
  else o.win.setIgnoreMouseEvents(true, { forward: true });
});

// Typing a new name needs the keyboard for a moment.
ipcMain.on('pet:focus', (e, on) => {
  const o = overlayOf(e.sender);
  if (!o) return;
  typing = on;
  if (on) {
    o.win.setFocusable(true);
    if (process.platform === 'darwin') app.focus({ steal: true });
    o.win.focus();
  } else {
    o.win.setFocusable(false);
    o.win.blur();
  }
});

// One window changed the pet (name, kind, what it's doing): tell the others and refresh the menus.
ipcMain.on('pet:state', (e, state) => {
  const from = overlayOf(e.sender);
  if (!from) return;
  pet = { ...pet, ...state };
  for (const o of overlays) if (o !== from && !o.win.isDestroyed()) o.win.webContents.send('pet:sync', state);
  refreshMenus();
});

// A window without the pet got a menu click (the house is on the main screen): pass it on.
ipcMain.on('pet:forward', (e, action) => send(action));

function send(action) {
  if (!overlays.length) return;
  if (action.type === 'act') return owner && owner.win.webContents.send('pet:action', action);
  if (action.type === 'rename') return primaryOverlay().win.webContents.send('pet:action', action);
  for (const o of overlays) if (!o.win.isDestroyed()) o.win.webContents.send('pet:action', action);
}

function menuItems() {
  const name = pet.name || 'Pet';
  return [
    { label: `Call ${name}`, click: () => send({ type: 'act', value: 'call' }) },
    { label: 'Play with ball', click: () => send({ type: 'act', value: 'ball' }) },
    { label: 'Tie near home', click: () => send({ type: 'act', value: 'tie' }) },
    { label: 'Send to sleep', click: () => send({ type: 'act', value: 'sleep' }) },
    { type: 'separator' },
    { label: 'Switch pet', submenu: PETS.map(([k, label]) => ({
        label, type: 'radio', checked: pet.species === k, click: () => send({ type: 'species', value: k }),
      })) },
    { label: `Rename ${name}…`, click: () => send({ type: 'rename' }) },
    { label: 'Nap when the cursor rests for', submenu: NAPS.map(([ms, label]) => ({
        label, type: 'radio', checked: pet.napMs === ms, click: () => send({ type: 'nap', value: ms }),
      })) },
    { label: 'Start when I log in', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }) },
  ];
}

function refreshMenus() {
  const items = menuItems();
  if (process.platform === 'darwin') app.dock.setMenu(Menu.buildFromTemplate(items));
  if (tray) tray.setContextMenu(Menu.buildFromTemplate([...items, { type: 'separator' }, { label: 'Quit Cursor Puppy', click: () => app.quit() }]));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    // The Dock icon is the remote: click it to call your pet, right-click it for everything else.
    app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    ]));
  }
  // A paw in the menu bar (or system tray) with the same options. trayTemplate.png lets macOS tint it
  // for light and dark menu bars. On MacBooks with a notch it can hide when the menu bar is crowded.
  const trayIcon = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', trayIcon)));
  tray.setToolTip('Cursor Puppy');
  buildOverlays();
  trackCursor();
  refreshMenus();
  screen.on('display-metrics-changed', screensChanged);
  screen.on('display-added', screensChanged);
  screen.on('display-removed', screensChanged);
});

app.on('activate', () => !typing && send({ type: 'act', value: 'call' }));          // Dock icon click
app.on('second-instance', () => send({ type: 'act', value: 'call' }));   // opened again
app.on('window-all-closed', () => app.quit());

global.cursorPuppyApp = { setCursor: (p) => { testCursor = p; }, get overlays() { return overlays; }, get owner() { return owner; }, get overlay() { return primaryOverlay() && primaryOverlay().win; } }; // used by test/smoke.js
