import { EditorState, EditorSelection } from '@codemirror/next/state'
import { setSyntax, syntaxState, storeGoalLabels, buildMarkers, parseHoleContent } from './syntax'
import { changeText } from './status-bar'
import { fromUTF8Ranges, getCursorPos } from './utils'

// FIXME: decoupling
import {
  sendSyncRequest,
  sendAbort,
  sendContext,
  sendContextAndInferredType,
  sendRefine,
} from '../adhoc'

function genHoleRewritingSpecs(descs) {
  const ret = []
  for (const {begin: from, end: to, text} of descs) {
    let insert
    if (text == null) {
      insert = '{!  !}'
    } else if (text.trim() == '') {
      insert = '{!' + c.padEnd(2) + '!}'
    } else {
      insert = `{!${text}!}`
    }
    ret.push({ from, to, insert })
  }
  return ret
}

function convertAgdaRanges(doc, specs) {
  const TAG_TIMING_CONV = 'converting UTF-8 offsets'
  console.time(TAG_TIMING_CONV)
  const ranges = specs.map(([a, b]) => [a - 1, b - 1])
  const arranged = fromUTF8Ranges(doc, ranges)
    .map(([a, b], i) => [a, b, specs[i].slice(2)])
  console.timeEnd(TAG_TIMING_CONV)
  return arranged
}

export function dispatchHighlight(view, specs) {
  const {doc} = view.state
  const origSel = view.state.selection

  // a micro optimization for zero ranges -- simply a noop
  if (specs == null || !specs.length) {
    view.dispatch({
      effects: [
        setSyntax.of(specs == null ? null : buildMarkers(view.state, [])),
        changeText.of(specs == null ? `Highlighting cleared` : 'No highlight available'),
      ]
    })
    return
  }

  const arranged = convertAgdaRanges(doc, specs)
  const {marks, holes, goalPoints, _rewriteDesc} = buildMarkers(view.state, arranged)
  view.dispatch({ effects: setSyntax.of({marks, holes}) })
  view.dispatch({
    changes: _rewriteDesc,
    // XXX: update only when the cursor is in/touching one of the rewriting ranges
    // selection: origSel,
  })
  view.dispatch({ effects: setSyntax.of({goalPoints}) })

  const verbose = `Highlighted ${specs.length} ranges with doc length ${view.state.doc.length}.`
  changeStatusBarText(view, verbose)
}

export function changeStatusBarText(view, text) {
  view.dispatch({
    effects: changeText.of(text)
  })
}

export function labelGoals(view, xs) {
  view.dispatch({
    effects: storeGoalLabels.of(xs)
  })
}

export function goToNextGoal(view) {
  const pos = getCursorPos(view.state)
  const {holes} = view.state.field(syntaxState)

  if (!holes.size) {
    console.warn('no goals available')
    return true
  }

  let dest = -1
  const iter = holes.iter(pos)
  while (iter.value) {
    // typically this iteration runs at most once
    if (pos < iter.from) {
      dest = iter.from
      break
    }
    iter.next()
  }

  if (dest == -1) {
    console.warn('Hit bottom; continuing at top')
    dest = holes.iter().from
  }

  view.dispatch({ selection: EditorSelection.single(dest + 3) })
  // internal bug of CodeMirror; scrollIntoView causes measurement fails
  setTimeout(() => {
    view.dispatch({ scrollIntoView: true })
  }, 0)
  return true
}

export function goToPrevGoal(view) {
  const pos = getCursorPos(view.state)
  const {holes} = view.state.field(syntaxState)

  if (!holes.size) {
    console.warn('no goals available')
    return true
  }

  let dest = -1
  const iter = holes.iter()
  while (iter.value) {
    if (pos < iter.to) {
      break
    }
    dest = iter.from
    iter.next()
  }

  if (dest == -1) {
    console.warn('Hit top; continuing at bottom')
    while (iter.value) {
      dest = iter.from
      iter.next()
    }
  }

  view.dispatch({ selection: EditorSelection.single(dest + 3) })
  setTimeout(() => {
    view.dispatch({ scrollIntoView: true })
  }, 0)
  return true
}


function just(f) {
  return (...args) => {
    f(...args)
    return true
  }
}

function setScope(scope, maps) {
  maps.forEach(x => x.scope = scope)
  return maps
}

export function getHoleByIndex(state, index) {
  const {holes, _holeToGoalMap} = state.field(syntaxState)

  const iter = holes.iter()
  while (iter.value) {
    const tar = _holeToGoalMap.get(iter.value)
    if (tar && tar.widget.value == index) {
      return iter.value.range(iter.from, iter.to)
    }
    iter.next()
  }
  return null
}

export function replaceHoleWith(view, hole, spec) {
  let newText

  if (typeof spec === 'string') {
    newText = spec
  } else {
    const content = parseHoleContent(view.state, hole)
    if (spec === true) {
      newText = `(${content.body})`
    } else {
      newText = content.body
    }
  }

  const newEnd = hole.from + newText.length

  view.dispatch({
    changes: [
      {from: hole.from, to: hole.to},
      {from: hole.from, insert: newText},
    ],
    selection: EditorSelection.single(newEnd),
    scrollIntoView: true,
  })

  // returns the new range to allow triggering Cmd_highlight
  return {
    from: hole.from,
    to: newEnd,
    body: newText,
  }
}

export const agdaKeymap = [
  ...setScope('agda', [
    { key: 'Ctrl-l', run: just(sendSyncRequest) },
    { key: 'Ctrl-f', run: goToNextGoal },
    { key: 'Ctrl-b', run: goToPrevGoal },
    { key: 'Ctrl-,', run: just(sendContext) },
    { key: 'Ctrl-Process', run: just(sendContextAndInferredType) },
    { key: 'Ctrl-.', run: just(sendContextAndInferredType) },
    { key: 'Ctrl-r', run: just(sendRefine) },
  ]),
  ...setScope('agdax', [
    { key: 'Ctrl-a', run: just(sendAbort) },
  ]),
]
