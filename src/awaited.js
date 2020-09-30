import { readable } from 'svelte/store'

export const UNINITIALIZED = Symbol('uninitialized')

export function awaited(awaitable) {
  let resolved = false
  let result = null

  const initialize = async () => {
    const value = await awaitable
    resolved = true
    result = value
    return value
  }

  const store = readable(null, set => {
    set(initialize())
  })

  return {
    subscribe: store.subscribe,
    get: () => resolved ? result : UNINITIALIZED,
  }
}
