<script>
import { onMount } from 'svelte'
import { readable } from 'svelte/store'
import { configWebsocketEndpoint } from './stores'

export let socket
let endpointInput

function setAndConnect() {
  configWebsocketEndpoint.set(endpointInput.value)
  socket.connect(endpointInput.value)
}

const connected = readable(false, set => {
  function onConnect() { set(true) }
  function onDisconnect() { set(false) }
  socket.on('open', onConnect)
  socket.on('close', onDisconnect)
  return () => {
    socket.off('open', onConnect)
    socket.off('close', onDisconnect)
  }
})

const socketError = readable(null, set => {
  function clearError() { set(null) }
  function onError(evt) { set(evt) }
  socket.on('open', clearError)
  socket.on('error', onError)
  return () => {
    socket.off('open', clearError)
    socket.off('error', onError)
  }
})

onMount(setAndConnect)
</script>

<div>
  Service URI: <input type="text" bind:this={endpointInput} value={$configWebsocketEndpoint}><button on:click={setAndConnect}>Connect</button>
  <span class="status">
    {#if $socketError}
      Error
    {:else if $connected}
      Online
    {:else}
      Offline
    {/if}
  </span>
</div>
