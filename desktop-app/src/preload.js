const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  onSetup: (fn) => ipcRenderer.on('pet:setup', (_e, info) => fn(info)),
  onCursor: (fn) => ipcRenderer.on('pet:cursor', (_e, p) => fn(p)),
  onAction: (fn) => ipcRenderer.on('pet:action', (_e, a) => fn(a)),
  onArrive: (fn) => ipcRenderer.on('pet:arrive', (_e, a) => fn(a)),
  onSync: (fn) => ipcRenderer.on('pet:sync', (_e, s) => fn(s)),
  setInteractive: (on) => ipcRenderer.send('pet:interactive', !!on),
  wantFocus: (on) => ipcRenderer.send('pet:focus', !!on),
  report: (state) => ipcRenderer.send('pet:state', state),
  handoff: (a) => ipcRenderer.send('pet:handoff', a),
  forward: (action) => ipcRenderer.send('pet:forward', action),
});
