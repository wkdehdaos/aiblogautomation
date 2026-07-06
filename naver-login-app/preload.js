'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  onState: (cb) => ipcRenderer.on('state', (_, data) => cb(data)),
  submitToken: (token) => ipcRenderer.send('submit-token', token),
  closeWindow: () => ipcRenderer.send('close-window'),
})
