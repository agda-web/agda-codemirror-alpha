import {
  StateField,
  StateEffect,
} from '@codemirror/next/state'
import { EditorView } from '@codemirror/next/view'
import { panels, showPanel, getPanel } from '@codemirror/next/panel'

import { prefix, updatePrefix } from './keymap'
import { getCursorPos } from './utils'
import { selection, updateSelectionInfo } from './selection'

export const statusBarState = StateField.define({
  create() {
    const status = 'Welcome :)'
    return {
      displayWhat: 'status',
      text: status,
      status: status,
      prefix: '',
      info: '',
      panel: [createStatusBar]
    }
  },
  update(_value, tr) {
    const info = value => {
      const {pos, lineNo, colNo} = value
      return `\uE0A1 ${lineNo} \uE0A3 ${colNo} \u2299 ${pos}`
    }

    let value = {..._value, info: info(_value)}

    for (const e of tr.effects) {
      if (e.is(updatePrefix)) {
        let text
        if (e.value.error) {
          text = 'Error: ' + e.value.error
        } else {
          const prefixDesc = [...tr.state.field(prefix).chars].map(x => `C-${x}`)
          text = prefixDesc.length ? `Prefix: ${prefixDesc.join(' ')}` : value.status
        }
        value = { ...value, displayWhat: 'prefix', prefix: text }
      } else if (e.is(updateSelectionInfo)) {
        value = { ...value, info: info(e.value) }
      } else if (e.is(changeText)) {
        value = { ...value, displayWhat: 'status', status: e.value }
      }
    }

    return {...value, text: value[value.displayWhat]}
  },
  provide: [showPanel.nFrom(s => s.panel)]
})

export const changeText = StateEffect.define()

function buildStatusBar(view, text) {
  const panel = document.createElement('div')
  const left = document.createElement('div')
  const right = document.createElement('div')
  left.classList.add('left')
  right.classList.add('right')
  ;([left, right]).forEach(x => {
    panel.appendChild(x)
  })
  panel.LEFT = left
  panel.RIGHT = right
  left.textContent = text
  return panel
}

function createStatusBar(view) {
  const {text} = view.state.field(statusBarState)
  return {
    // FIXME: allow specifying a dom factory function from outside
    dom: buildStatusBar(view, text),
    mount() {
      console.debug('Status bar mounted.')
    },
    update(update) {
      const hasChangeText = update.transactions.some(
        tr => tr.effects.some(
          e => e.is(changeText) ||
               e.is(updatePrefix)))
      const hasChangeInfo = update.transactions.some(
        tr => tr.effects.some(
          e => e.is(updateSelectionInfo)))
      if (hasChangeText) {
        const state = view.state.field(statusBarState)
        this.dom.LEFT.textContent = state.text
      }
      if (hasChangeInfo) {
        const state = view.state.field(statusBarState)
        this.dom.RIGHT.textContent = state.info
      }
    },
    // pos: 100,
    style: 'status',
  }
}

const statusBarTheme = EditorView.baseTheme({
  'panel.status': {
    padding: '2px 6px 4px',
    fontSize: '10px',
    display: 'flex',
    '& .left':  { flex: '1 1 auto' },
    '& .right': { flex: '0 0 auto', fontFamily: 'Iosevka' },
  },
})


export function agdaStatusBar() {
  return [
    panels(),
    selection(),
    statusBarState,
    statusBarTheme,
  ]
}
