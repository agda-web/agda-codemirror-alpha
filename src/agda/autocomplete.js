import {completeSnippets, completeFromList, snippet} from '@codemirror/next/autocomplete'
import {CharCategory} from '@codemirror/next/state'
import { table } from './translations'


const snippets = table.map(([sequence, symbol]) => {
  // example: {keyword: '\\wedge', name: '∧ wedge', snippet: '∧'}
  return {
    label: `\\${sequence}`,
    detail: symbol.match(/\s/) ? `(${symbol})` : symbol,
    type: 'constant',
    apply: symbol,
  }
})
// const completionSpec = completeSnippets(snippets)

// given a line and an offset within it, return the (non-negative)
// position of the token boundary before it, if any
function tokenBefore(line, offset, categorize) {
  // FIXME: agda deserves its own categorizer
  let col = offset
  while (col > 0) {
    const ch = line.slice(col - 1, col)
    if (categorize(ch) == CharCategory.Space) {
      return null
    } else if (ch == '\\') {
      // requires an "\" ahead
      return --col
    }
    col = line.findClusterBreak(col, false)
  }
  return null
}

export function makeCompletionBy(snippets) {
  // this is a dummy wrapper for historical reasons

  return context => {
    const {pos, state} = context
    const line = state.doc.lineAt(pos)
    const tokenTo = pos - line.from
    const categorize = state.charCategorizer(pos)
    const col = tokenBefore(line, pos - line.from, categorize)

    if (col == null) return

    const tokenFrom = line.from + col
    const tokenText = line.slice(col, pos - line.from)
    console.log('%ctriggered autocomplete: "%s"', 'color: yellow', tokenText, context)

    const response = {
      from: tokenFrom,
      to: pos,
    }

    if (tokenText == '\\') {
      return Object.assign(response, {
        options: [{
          label: '\\\\',
          detail: 'Agda input...',
          apply: '\\',
        }],
        span: /^\\\\$/,
      })
    } else {
      const filtered = snippets.filter(cand => {
        return (cand.label.indexOf(tokenText) == 0)
      })

      return Object.assign(response, {
        options: filtered,
        // (v0.11) fuzzy matcher is too fuzzy and not configurable
        // span: /^\\.+$/,
      })
    }
  }
}

const myCompletionFunc = makeCompletionBy(snippets)

import { EditorView } from '@codemirror/next/view'
// import { precedence } from '@codemirror/next/state'
import { completionStatus } from '@codemirror/next/autocomplete'
import { closeBrackets } from '@codemirror/next/closebrackets'

const myInputHandler = EditorView.inputHandler.of((view, from, to, text) => {
  const cState = completionStatus(view.state)
  if (cState != null) return false
  return closeBrackets().value(view, from, to, text)
})

export const myAutocompletion = myCompletionFunc

export const tweakedCloseBrackets = () => [
  myInputHandler,
]

// export const myAutocompletion = completionSpec
