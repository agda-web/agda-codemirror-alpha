import { sendMessage, highlightInProgress } from './stores'
import { getCursorPos, toUTF8Coords, toHaskellRange } from './agda/utils'
import { syntaxState, setSyntax, parseHoleContent, getGoalAtCursor } from './agda/syntax'

function asString(s) {
  return `"${s.replace(/\//g, '\\\\').replace(/"/g, '\\"')}"`
}

export function sendSyncRequest(view) {
  const str = view.state.sliceDoc()

  sendMessage('WRITE ' + str)
  sendMessage('IOTCM "/tmp/my.agda" None Direct (Cmd_load "/tmp/my.agda" [])')
  sendMessage('IOTCM "/tmp/my.agda" Interactive Direct (Cmd_load_highlighting_info "/tmp/my.agda")')
}

export function sendAbort(view) {
  sendMessage('IOTCM "/tmp/my.agda" None Direct (Cmd_abort)')
  // sendMessage('IOTCM "/tmp/my.agda" NonInteractive Direct (Cmd_goal_type_context AsIs 0 noRange "")')
}

export function sendContext(view) {
  const goalDesc = getGoalAtCursor(view.state)
  if (goalDesc == null) {
    console.warn('Cursor is not at a goal.')
    return
  }
  const content = parseHoleContent(view.state, goalDesc.widget)
  if (content == null) {
    console.warn('Hole at cursor is malformed.')
    return
  }
  sendMessage(`IOTCM "/tmp/my.agda" None Direct (` +
    `Cmd_goal_type_context Simplified ${goalDesc.index} noRange ${asString(content.body)}` +
  `)`)
}

export function sendContextAndInferredType(view) {
  const goalDesc = getGoalAtCursor(view.state)
  if (goalDesc == null) {
    console.warn('Cursor is not at a goal.')
    return
  }
  const content = parseHoleContent(view.state, goalDesc.widget)
  if (content == null) {
    console.warn('Hole at cursor is malformed.')
    return
  }

  view.dispatch({
    effects: setSyntax.of({ clearMarksAt: goalDesc.widget })
  })

  sendMessage(`IOTCM "/tmp/my.agda" Interactive Direct (` +
    `Cmd_goal_type_context_infer Simplified ${goalDesc.index} ${content.range} ${asString(content.body)}` +
  `)`)
}

export function sendRefine(view) {
  const goalDesc = getGoalAtCursor(view.state)
  if (goalDesc == null) {
    console.warn('Cursor is not at a goal.')
    return
  }
  const content = parseHoleContent(view.state, goalDesc.widget)
  if (content == null) {
    console.warn('Hole at cursor is malformed.')
    return
  }

  sendMessage(`IOTCM "/tmp/my.agda" NonInteractive Direct `
    + `(Cmd_refine_or_intro False ${goalDesc.index} ${content.range} ${asString(content.body)})`)
}

export function sendHighlightOnGoal(view, goalIndex, spec) {
  const range = toHaskellRange(view.state.doc, spec.from, spec.to)
  sendMessage(`IOTCM "/tmp/my.agda" NonInteractive Direct `
    + `(Cmd_highlight ${goalIndex} ${range} ${asString(spec.body)})`)
}

window.sendMessage = s => {
  sendMessage('IOTCM "/tmp/my.agda" ' + s)
}
