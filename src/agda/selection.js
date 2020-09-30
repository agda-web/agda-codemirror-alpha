import {
  EditorState,
  StateField,
  StateEffect,
  precedence,
} from '@codemirror/next/state'

import { getCursorPos } from './utils'

export const updateSelectionInfo = StateEffect.define()

export const selectionInfoState = StateField.define({
  create() {
    return {
      pos: -1,
      lineNo: -1,
      colNo: -1,
    }
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(updateSelectionInfo)) {
        return e.value
      }
    }
  }
})

const selectionInfoFilter = EditorState.transactionFilter.of(tr => {
  if (!tr.selection) return tr
  const pos = getCursorPos(tr.state)
  const line = tr.state.doc.lineAt(pos)
  return [tr, {
    effects: updateSelectionInfo.of({
      pos,
      lineNo: line.number,
      colNo: pos - line.from + 1,
    })
  }]
})

export function selection(options = {}) {
  return [
    selectionInfoState,
    // TODO: emit at the very first selection on load
    precedence(selectionInfoFilter, 'extend'),
  ]
}
