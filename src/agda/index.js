import { agdaTheme } from './theme'
import { agdaSyntax } from './syntax'

export function agda(options = {}) {
  return [
    agdaTheme,
    agdaSyntax(),
    // stub; for disabling editing when highlighting is in process
    // EditorState.changeFilter.of(x => false)
  ]
}

export { agdaKeyBinding } from './keymap'
export { agdaStatusBar } from './status-bar'
