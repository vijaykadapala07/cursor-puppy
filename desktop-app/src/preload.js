const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  onCursor: (fn) => ipcRenderer.on('pet:cursor', (_e, p) => fn(p)),
  onAction: (fn) => ipcRenderer.on('pet:action', (_e, a) => fn(a)),
  setInteractive: (on) => ipcRenderer.send('pet:interactive', !!on),
  wantFocus: (on) => ipcRenderer.send('pet:focus', !!on),
  report: (state) => ipcRenderer.send('pet:state', state),
});
