import {completeSnippets, completeFromList, snippet} from '@codemirror/next/autocomplete'
import { EditorView } from '@codemirror/next/view'
import { completionStatus } from '@codemirror/next/autocomplete'
import { closeBrackets } from '@codemirror/next/closebrackets'
import { syntaxState } from './syntax'
import { table } from './translations'

const agdaIMESnippets = table.map(([sequence, symbol]) => {
  // example: {keyword: '\\wedge', name: '∧ wedge', snippet: '∧'}
  return {
    label: `\\${sequence}`,
    detail: symbol.match(/\s/) ? `(${symbol})` : symbol,
    type: 'constant',
    apply: symbol,
  }
})

const keywordSnippets = 'abstract constructor data do eta-equality field forall hiding import in inductive infix infixl infixr instance let macro module mutual no-eta-equality open overlap pattern postulate primitive private public quote quoteContext quoteGoal quoteTerm record renaming rewrite Set syntax tactic unquote unquoteDecl unquoteDef using variable where with'.split(' ').map(word => {
  return { label: word, type: 'keyword' }
})

const tokenTypeMapping = [
  ['function', 'function'],
  ['operator', 'function'],
  ['inductiveconstructor', 'variable'],
  ['coinductiveconstructor', 'variable'],
  ['primitivetype', 'type'],
]

const myInputHandler = EditorView.inputHandler.of((view, from, to, text) => {
  const cState = completionStatus(view.state)
  if (cState != null) return false
  return closeBrackets().value(view, from, to, text)
})

export function myAutocompletion(context) {
  const {state, pos} = context

  const matched = context.matchBefore(/\\\S*|\w\S*/)
  if (matched == null) return

  const tokenFrom = matched.from
  const tokenText = matched.text
  console.log('%ctriggered autocomplete: "%s"', 'color: yellow', tokenText, context)

  const responseBase = {
    from: tokenFrom,
    to: pos,
  }

  if (tokenText == '\\') {
    return Object.assign(responseBase, {
      options: [{
        label: '\\\\',
        detail: 'Agda input...',
        apply: '\\',
      }],
      span: /^\\\\$/,
    })
  } else if (tokenText.charAt(0) == '\\') {
    const filtered = agdaIMESnippets.filter(cand => {
      return (cand.label.indexOf(tokenText) == 0)
    })

    return Object.assign(responseBase, {
      options: filtered,
      // (v0.11) fuzzy matcher is too fuzzy and not configurable
      // span: /^\\.+$/,
    })
  } else {
    // TODO: pre-compute these marks and store in a separate field
    const {marks} = state.field(syntaxState)
    const iter = marks.iter()
    const inspectedSnippets = []
    const entries = new Set()

    while (iter.value) {
      const {_tokenTypes, _content} = iter.value.spec
      if (!entries.has(_content)) {
        for (const [indexingType, mappedType] of tokenTypeMapping) {
          if (_tokenTypes.indexOf(indexingType) >= 0) {
            inspectedSnippets.push({
              label: _content,
              type: mappedType,
            })
            entries.add(_content)
            break
          }
        }
      }
      iter.next()
    }

    return Object.assign(responseBase, {
      options: keywordSnippets.concat(inspectedSnippets),
      span: /[\w-]+/
    })
  }
}

export const tweakedCloseBrackets = () => [
  myInputHandler,
]

// export const myAutocompletion = completionSpec
