import { WebSocketImpl } from './websocket-impl'
import { readable, writable } from 'svelte/store'
import _persistent from 'svelte-persistent-store'

export const socket = new WebSocketImpl()

export const socketMessage = readable(null, set => {
  socket.on('message', evt => set(evt.data))
  return socket.close
})

socket.on('open', () => {
  console.log('Connected!')
})

socket.on('close', () => {
  console.warn('Disconnected')
})

export const sendMessage = message => {
  const sent = socket.send(message)
  if (!sent) {
    console.log('queued', message)
  }
}

export const highlightInProgress = writable(false)

export const log = writable('this is the poor man\'s logging window\n')

export const configWebsocketEndpoint = _persistent.local.writable(
  'agda-mode-beta-websocket-endpoint', 'ws://localhost:8765/ws')
