import EventEmitter from 'eventemitter3'

export class WebSocketImpl extends EventEmitter {
  constructor(config = {}) {
    super()

    this.socket = null
    // this.previousError = null
    // TODO: clear unsentQueue if switched to a different endpoint?
    this.unsentQueue = []

    // wait ? ms per message upon a reconnection
    // this.reconnectBurst = config.reconnectBurst || 100
  }

  connect(...args) {
    this.disconnect()
    this.once('open', () => {
      for (const data of this.unsentQueue) {
        this.send(data)
      }
      this.unsentQueue.length = 0
    })

    try {
      this.socket = new WebSocket(...args)
    } catch(err) {
      this.emit('error', err)
      return
    }

    // this.previousError = null
    // this.socket.addEventListener('error', evt => {
    //   this.previousError = evt
    // })
    for (const eventName of ['open', 'close', 'message', 'error']) {
      this.socket.addEventListener(eventName, evt => this.emit(eventName, evt))
    }
  }

  /* Send data if the connection is open,
     queue it if the connection is not open yet. */
  send(data) {
    if (this.socket == null) {
      throw new Error('send() is called without an active connection.')
    }
    if (this.socket.readyState != WebSocket.OPEN) {
      this.unsentQueue.push(data)
      return false
    }

    this.socket.send(data)
    return true
  }

  disconnect(...args) {
    if (!this.socket) return
    this.socket.close(...args)
    this.socket = null
  }
}
