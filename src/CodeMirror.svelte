<script>
import { onMount, onDestroy, createEventDispatcher } from 'svelte'

import {EditorState, tagExtension} from '@codemirror/next/state'
import {EditorView, keymap, highlightSpecialChars, multipleSelections, indentOnInput} from '@codemirror/next/view'
import {history, historyKeymap} from '@codemirror/next/history'
import {foldGutter, foldKeymap} from '@codemirror/next/fold'
import {lineNumbers} from '@codemirror/next/gutter'
import {defaultKeymap} from '@codemirror/next/commands'
import {bracketMatching} from '@codemirror/next/matchbrackets'
import {closeBrackets, closeBracketsKeymap} from '@codemirror/next/closebrackets'
import {searchKeymap} from '@codemirror/next/search'
import {autocompletion, completionKeymap} from '@codemirror/next/autocomplete'
import {commentKeymap} from '@codemirror/next/comment'
import {rectangularSelection} from '@codemirror/next/rectangular-selection'
import {gotoLineKeymap} from '@codemirror/next/goto-line'
import {highlightActiveLine, highlightSelectionMatches} from '@codemirror/next/highlight-selection'
import {defaultHighlighter} from '@codemirror/next/highlight'
import {lintKeymap} from '@codemirror/next/lint'

import { agda, agdaKeyBinding, agdaStatusBar } from './agda'
import { tweakedCloseBrackets } from './agda/autocomplete'
import { sendMessage, socketMessage, log } from './stores'
import { awaited } from './awaited'

export let initialContent = ''
export let view = null

let wrapper

function buildEditorView(parent) {
  return new EditorView({
    state: EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        multipleSelections(),
        indentOnInput(),

        myCodeMirrorTheme,
        agda(),
        agdaStatusBar(),
        agdaKeyBinding(),
        EditorView.lineWrapping,

        bracketMatching(),
        // closeBrackets(),
        tweakedCloseBrackets(),
        autocompletion(),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...commentKeymap,
          ...gotoLineKeymap,
          ...completionKeymap,
          ...lintKeymap
        ]),
      ],
    }),
    parent,
  })
}


const dispatch = createEventDispatcher()

const myCodeMirrorTheme = EditorView.baseTheme({
  'wrap': {
    border: '1px solid #ddd'
  },
  'scroller': {
    overflow: 'auto',
  },
  'content': {
    fontFamily: '"Iosevka", monospace',
    fontFeatureSettings: '"calt" off, "WWID" on',
  },
  'tooltip.autocomplete': {
    '& > ul': {
      fontFamily: '"Iosevka", monospace',
      fontFeatureSettings: '"calt" off, "WWID" on',
    }
  },
  'completionIcon': {
    paddingRight: '1.2em',
  }
})

// const languageTag = Symbol('language')

// const agdaParsingReloader = EditorState.transactionFilter.of((spec, prev) => {
//   if (!spec.changes || spec.changes.empty) return spec
//   return [spec, {
//     reconfigure: {[languageTag]: agda}
//   }]
// })

// export const view = awaited(new Promise((resolve, reject) => {
//   onMount(() => resolve(buildEditorView(editor)))
// }))

onMount(() => {
  view = buildEditorView(wrapper)
})

onDestroy(() => {
  view.destroy()
  view = null
})
</script>

<div style="height: 100%" bind:this={wrapper}>
</div>

<style>
:global(.cm-wrap) {
  /* XXX: when > CM's backed drawn area (300px?), pgup/pgdn do not always work */
  height: 100%;
}
:global(.cm-scroller) {
  overscroll-behavior-x: contain;
}
</style>
