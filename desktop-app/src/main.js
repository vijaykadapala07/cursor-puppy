// Cursor Puppy: a little pet that lives in a house at the bottom-left of your screen and follows
// your cursor around. It's drawn in one transparent, always-on-top, click-through window that
// covers the screen; only the pet, its house, the ball and the options menu ever catch a click.

const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } = require('electron');
const path = require('path');

const CURSOR_EVERY_MS = 16;  // ~60 fps cursor tracking
const NAPS = [[5000, '5 seconds'], [15000, '15 seconds'], [30000, '30 seconds'], [60000, '1 minute'], [120000, '2 minutes']];
const PETS = [['morkie', 'Morkie'], ['panda', 'Panda'], ['teddy', 'Teddy']];

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let overlay = null;
let tray = null;
let pet = { species: 'morkie', name: 'Snowy', mode: 'follow', napMs: 15000 }; // reported by the page
let lastCursor = null;
let typing = false;      // true while the rename box has the keyboard

function screenBounds() {
  // The house lives on the main screen, sitting just above the Dock.
  return screen.getPrimaryDisplay().workArea;
}

function createOverlay() {
  const b = screenBounds();
  overlay = new BrowserWindow({
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
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.once('ready-to-show', () => overlay.showInactive());
  overlay.on('closed', () => { overlay = null; });
}

function fitOverlay() {
  if (!overlay) return;
  overlay.setBounds(screenBounds());
}

// Follow the real cursor everywhere (other apps, other windows) by polling it.
function trackCursor() {
  setInterval(() => {
    if (!overlay) return;
    const p = screen.getCursorScreenPoint();
    if (lastCursor && p.x === lastCursor.x && p.y === lastCursor.y) return;
    lastCursor = p;
    const b = overlay.getBounds();
    overlay.webContents.send('pet:cursor', { x: p.x - b.x, y: p.y - b.y });
  }, CURSOR_EVERY_MS);
}

// The page tells us when the pointer is over something clickable.
ipcMain.on('pet:interactive', (e, on) => {
  if (!overlay || e.sender !== overlay.webContents) return;
  if (on) overlay.setIgnoreMouseEvents(false);
  else overlay.setIgnoreMouseEvents(true, { forward: true });
});

// Typing a new name needs the keyboard for a moment.
ipcMain.on('pet:focus', (e, on) => {
  if (!overlay || e.sender !== overlay.webContents) return;
  typing = on;
  if (on) {
    overlay.setFocusable(true);
    if (process.platform === 'darwin') app.focus({ steal: true });
    overlay.focus();
  } else {
    overlay.setFocusable(false);
    overlay.blur();
  }
});

ipcMain.on('pet:state', (e, state) => {
  if (!overlay || e.sender !== overlay.webContents) return;
  pet = { ...pet, ...state };
  refreshMenus();
});

const send = (action) => overlay && overlay.webContents.send('pet:action', action);

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
  createOverlay();
  trackCursor();
  refreshMenus();
  screen.on('display-metrics-changed', fitOverlay);
  screen.on('display-added', fitOverlay);
  screen.on('display-removed', fitOverlay);
});

app.on('activate', () => !typing && send({ type: 'act', value: 'call' }));          // Dock icon click
app.on('second-instance', () => send({ type: 'act', value: 'call' }));   // opened again
app.on('window-all-closed', () => app.quit());

global.cursorPuppyApp = { get overlay() { return overlay; } }; // used by test/smoke.js
