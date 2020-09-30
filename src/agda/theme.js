import {EditorView, themeClass as CM} from '@codemirror/next/view'
import { TagSystem } from '@codemirror/next/highlight'
import { classNameForHoles } from './syntax'

const white        = '#FFFFFF',
      gray         = '#808080',
      darkGray     = '#404040',
      black        = '#000000',
      brown        = '#8B7500',
      darkRed      = '#B22222',
      red          = '#FF0000',
      orange       = '#CD6600',
      yellow       = '#FFFF00',
      green        = '#008B00',
      cyan         = '#458B74',
      blue         = '#0000CD',
      violet       = '#A020F0',
      pink         = '#EE1289',
      ivory        = '#F5DEB3',
      lightOrange  = '#FFA07A',
      lightBlue    = '#ADD8E6',
      lightGreen   = '#9DFF9D'

function selectWithChildren(sel) {
  return `${sel}, ${sel} *`
}

export const agdaTheme = EditorView.theme({
  // reserved for CodeMirror internals
  activeLine: { backgroundColor: '#eeeeec' },
  wrap: {
    // CM somehow drops the specificity property despite indicated by `style-mod`
    // see https://github.com/codemirror/codemirror.next/issues/125
    [selectWithChildren('& .' + CM('matchingBracket'))]:
      { color: '#FFFFFF', backgroundColor: '#BEBEBE' },

    [selectWithChildren('& .' + CM('nonmatchingBracket'))]:
      { color: '#FFFFFF', backgroundColor: '#FF0000' },

    [selectWithChildren('& .' + CM('agda-error'))]:
      { backgroundColor: red, color: white },

    [`& .${CM('completionIcon-constant')} ~ .${CM('completionDetail')}`]: {
      fontStyle: 'normal',
      fontSize: '1.25em',
      backgroundColor: 'rgba(0, 0, 0, .05)'
    },
  },
  searchMatch: { backgroundColor: '#FFFF00' },
  selectionMatch: { backgroundColor: '#cccccc80' },

  'agda-comment': { color: darkRed },
  'agda-pragma': { color: black },
  'agda-keyword': { color: orange },
  'agda-string': { color: darkRed },
  'agda-character': { color: darkRed },
  'agda-number': { color: violet },
  'agda-symbol': { color: darkGray },
  'agda-primitivetype': { color: blue },

  'agda-bound': { color: black },
  'agda-generalizable': { color: black },
  'agda-inductiveconstructor': { color: green },
  'agda-coinductiveconstructor': { color: brown },
  'agda-datatype': { color: blue },
  'agda-field': { color: pink },
  'agda-function': { color: blue },
  'agda-macro': { color: cyan },
  'agda-module': { color: violet },
  'agda-postulate': { color: blue },
  'agda-primitive': { color: blue },
  'agda-record': { color: blue },
  'agda-argument': { color: darkGray },

  // pp = post-processing
  [classNameForHoles]: { backgroundColor: lightGreen },
  '\u037c-pp-marker': { backgroundColor: `${lightGreen}80` },
})
