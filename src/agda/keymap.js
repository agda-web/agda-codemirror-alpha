import { keyName } from 'w3c-keyname'
import { EditorView, keymap, runScopeHandlers } from '@codemirror/next/view'
import { StateField, StateEffect } from '@codemirror/next/state'

import { agdaKeymap } from './commands'

const viewHasSelection = view => view.state.selection.ranges.some(x => !x.empty)

export const updatePrefix = StateEffect.define()

export const prefix = StateField.define({
  create(state) {
    return { chars: '', lastError: null }
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(updatePrefix)) {
        const {append, clear, error} = e.value
        if (clear || error) {
          return { chars: '', lastError: clear ? null : error }
        }
        if (append) return { ...value, chars: value.chars + append }
      }
    }
    return value
  },
  compare(a, b) {
    return a.chars == b.chars
  }
})

const keydownHandler = EditorView.domEventHandlers({
  keydown(event, view) {
    let name
    if (event.keyCode == 229 && !event.shiftKey) {
      // On my chrome OS; keyCode=229 is a mess as in
      // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/keyCode
      name = '.'
    } else if (event.keyCode == 32) {
      // mainly for display purposes
      name = 'Space'
    } else {
      name = keyName(event)
    }

    // Valid key sequence for Agda mode: (C-u){0,2} + C-c + (C-x)? + (C-any).
    // returning false (use default behavior) when the prefix is empty,
    // with one of conditions below:
    //   1. There is a non-empty selection, to minimize impacts to existing
    //      bindings that work with text selections
    //   2. The input cannot be a prefix of any key sequences (Ctrl-R is exception)
    const curPrefix = view.state.field(prefix).chars

    // early rejection of irrelevant keys
    if (name.match(/^Control|Shift|Meta|Alt$/)) return false
    // ignore Control/Shift/... at the same time
    if (!curPrefix.length && name.length > 1) return false

    function accept(name) {
      view.dispatch({
        effects: updatePrefix.of(
          name ? { append: name }
               : { clear: true })
      })
      return true
    }

    function reject(reason) {
      view.dispatch({
        effects: updatePrefix.of({ error: reason })
      })
      return true
    }

    const modIsCtrl = event.ctrlKey && ['altKey', 'metaKey', 'shiftKey'].every(x => !event[x])

    if (!curPrefix.length && viewHasSelection(view)) {
      return false  // cond. 1
    }

    if (curPrefix.match(/^u{0,2}$/)) {
      if (modIsCtrl && name == 'c') {
        return accept(name)
      } else if (modIsCtrl && name == 'u') {
        if (curPrefix.length >= 2) {
          return reject('Too much force')
        }
        return accept(name)
      } else if (curPrefix == '') {
        if (modIsCtrl && name == 'r') {
          // prevent C-r to refresh
          console.log('%c>>> Please use F5 or Ctrl-Shift-R to refresh <<<', 'color: yellow')
          return true
        }
        // cond. 2
        return false
      }
    } else if (curPrefix.match(/c$/)) {
      if (modIsCtrl && name == 'x') {
        return accept(name)
      }
      // else fallthrough
    }

    const scope = curPrefix[curPrefix.length - 1] == 'x' ? 'agdax' : 'agda'

    // then, proceed with Agda shortcut handling
    const prefixDesc = [...curPrefix].map(x => 'C-' + x).join(' ')
    let keyDesc = name
    if (event.ctrlKey) keyDesc = 'C-' + keyDesc
    if (event.altKey || event.metaKey) keyDesc = 'M-' + keyDesc
    console.log(`Processing key sequence [${prefixDesc}] ${keyDesc}`)

    const processed = runScopeHandlers(view, event, scope)
    if (processed) {
      return accept(null)
    } else {
      return reject(`[${prefixDesc} ${keyDesc}] does not name a command.`)
    }
  }
})

const clearPrefixCommand = {
  key: 'Escape',
  run: view => {
    if (!view.state.field(prefix).chars) {
      return false
    }
    view.dispatch({
      effects: updatePrefix.of({ clear: true })
    })
    console.log('prefix cleared!')
    return true
  }
}

export function agdaKeyBinding(options = {}) {
  return [
    prefix,
    keydownHandler,
    keymap([clearPrefixCommand, ...agdaKeymap]),
  ]
}
