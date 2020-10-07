import {
  Facet,
  EditorState,
  StateField,
  StateEffect,
  MapMode,
} from '@codemirror/next/state'
import {
  flatIndent,
  continuedIndent,
} from '@codemirror/next/syntax'
import {
  EditorView,
  Decoration,
  themeClass,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/next/view'
import { Range, RangeSet, RangeSetBuilder } from '@codemirror/next/rangeset'
import { myAutocompletion } from './autocomplete'
import { WidgetType } from '@codemirror/next/view'
import { getCursorPos, toHaskellRange } from './utils'

export const agdaLanguageData = EditorState.globalLanguageData.of({
  closeBrackets: { brackets: ['(', '{', '"', "'"] },
  commentTokens: { line: '--', block: { open: '{-', close: '-}' } },
  autocomplete: myAutocompletion,
})

export const setSyntax = StateEffect.define()
export const storeGoalLabels = StateEffect.define()

export function agdaSyntax(options = {}) {
  return [
    agdaLanguageData,
    syntaxState,
    highlighter,
  ]
}

export const classNameForHoles = '\u037c-pp-hole'

// TODO: re-consider highlight caching policy
const decoSpecCache = new Map()

class GoalMarker extends WidgetType {
  toDOM(view) {
    const el = document.createElement('span')
    el.textContent = this.value == null ? '?' : this.value
    el.className = themeClass(`\u037c-pp-marker`)
    return el
  }
  updateDOM(dom) {
    console.warn('Detect reusing DOM', dom)
    return false
  }
}

export function buildMarkers(state, specs) {
  const marks = [], holes = []
  for (const spec of specs) {
    const [begin, end, [types, ...meta]] = spec
    const tokenTypes = types.map(t => t.s)

    const slice = state.doc.sliceString(begin, end)
    const cgGoal = slice.match(/^(?:\?|{!([\s\S]*)!})$/)
    let classNames = tokenTypes.map(type => themeClass('agda-' + type))

    if (cgGoal && tokenTypes.indexOf('symbol') >= 0) {
      // goal objects must be distinct, so do not cache them
      const mark = Decoration.mark({
        class: themeClass(classNameForHoles),
        _holeContent: cgGoal[1],
      })
      holes.push(mark.range(begin, end))

      // do not apply symbol styling for holes
      classNames = classNames.filter(x => x != 'symbol')
    }

    const mark = Decoration.mark({
      class: classNames.join(' '),
      _tokenTypes: tokenTypes,
      _content: slice,
      _meta: meta,
    })
    marks.push(mark.range(begin, end))
  }

  return {marks, holes}
}

// provided goalLabels, bind all stray goal markers by matching unbound goal labels
// returns a list of instructions so they may be created after some rewriting
//
// note that Agda may forget numbering some goals,
// and they will be created with undefined label
export function bindGoalMarkers(state) {
  const goalDescs = []

  const {holes, unboundGoalLabels, _holeToGoalMap} = state.field(syntaxState)
  let labelIdx = 0

  const iter = holes.iter()
  while (iter.value) {
    const {from, to, value} = iter
    if (!_holeToGoalMap.has(value)) {
      const label = unboundGoalLabels[labelIdx++]
      const widget = Decoration.widget({
        widget: new GoalMarker(label),
        side: 1,
      })
      // FIXME: we should not change readonly attributes
      widget.mapMode = MapMode.TrackBefore
      goalDescs.push({ from, to, widget, label, hole: value })
    }
    iter.next()
  }

  return goalDescs
}

// maintaining indexed, append-only decos that syncs with the state
class SyntaxState {
  constructor(data) {
    Object.assign(this, data)
  }

  update(update) {
    let {marks, holes, goals, unboundGoalLabels} = this

    if (update.marks) {
      marks = marks.update({add: update.marks})
      // TODO: canonalize marks so that marks of the same kind are merged together
    }
    if (update.clearMarksAt) {
      // TODO: refactor interfaces; this is meant to
      // allow clearing some markings
      const {clearMarksAt: range} = update
      if (!(range instanceof Range)) {
        throw new TypeError('clearMarksAt expects a range object')
      }
      marks = marks.update({
        filter: () => false,
        filterFrom: range.from,
        filterTo: range.to,
      })
    }
    if (update.holes) {
      holes = holes.update({add: update.holes})
    }
    if (update.goalPoints) {
      const newWidgets = []
      const unboundSet = new Set(this.unboundGoalLabels)

      update.goalPoints.forEach(({widget, point, hole, label}) => {
        newWidgets.push(widget.range(point))
        unboundSet.delete(label)
        this._holeToGoalMap.set(hole, widget)
      })

      unboundGoalLabels = (this.unboundGoalLabels || []).filter(l => unboundSet.has(l))
      goals = goals.update({add: newWidgets})
    }

    return new SyntaxState({...this, marks, holes, goals, unboundGoalLabels})
  }

  storeIndexes(goalLabels) {
    const oldLabels = new Set(this.goalLabels || [])
    const unboundGoalLabels = goalLabels.filter(l => {
      return (!oldLabels.has(l) || (this.unboundGoalLabels.indexOf(l) >= 0))
    })
    return new SyntaxState({...this, goalLabels, unboundGoalLabels})
  }

  map(tr) {
    return new SyntaxState({
      ...this,
      marks: this.marks.map(tr.changes.desc),
      holes: this.holes.map(tr.changes.desc),
      goals: this.goals.map(tr.changes.desc),
    })
  }
}

SyntaxState.initial = new SyntaxState({
  marks: Decoration.none,
  holes: Decoration.none,
  goals: Decoration.none,
  _holeToGoalMap: new WeakMap(),
  goalLabels: null,
  unboundGoalLabels: null,
})

export const syntaxState = StateField.define({
  create(state) {
    return SyntaxState.initial
  },
  update(_value, tr) {
    let value = _value

    for (const e of tr.effects) {
      if (e.is(setSyntax)) {
        console.log('setSyntax', e.value)
        if (e.value == null) {
          value = SyntaxState.initial
        } else {
          value = value.update(e.value)
        }
      }
      if (e.is(storeGoalLabels)) {
        const newLabels = e.value

        const eliminated = new Set()
        if (value.goalLabels) {
          for (const label of value.goalLabels) {
            if (newLabels.indexOf(label) < 0) {
              eliminated.add(label)
            }
          }
        }

        // TODO: notify for removing its label;
        // the hole's content should be extracted as a consequence
        if (eliminated.size) {
          console.warn('TODO: Eliminating goals', [...eliminated])
        }

        value = value.storeIndexes(newLabels)
      }
    }
    if (!tr.docChanged) return value

    try {
      return value.map(tr)
    } catch (e) {
      console.warn('Failed to map changes to highlight information. Content not long enough?', e)
      return SyntaxState.initial
    }
  },
})

function hasEffect(trs, effect) {
  return trs.some(tr => {
    // FIXME: use an annotation instead
    return tr.effects.some(e => e.is(effect))
  })
}

class Highlighter {
  constructor(view) {
    this.decorations = Decoration.none
  }

  getProvider(update) {
    throw new TypeError('getProvider() is not implemented.')
  }

  requiresUpdate(update) {
    return update.transactions.some(tr => tr.effects.some(e => e.is(setSyntax)))
  }

  update(update) {
    // TODO: is it possible to integrate w/ undo stack?
    if (update.docChanged || update.viewportChanged || this.requiresUpdate(update)) {
      this.decorations = this.applyHighlight(update.view, this.getProvider(update))

      // FIXME: should add an effect (annotation?) to trace on deco changes
    }
  }

  applyHighlight(view, highlight) {
    return highlight.update({
      filter: (from, to) => {
        return view.visibleRanges.some(
          ({from: viewBegin, to: viewEnd}) => viewBegin <= from && to <= viewEnd)
      }
    })
  }
}

export const highlighter = ['holes', 'goals', 'marks'].map(propName => {
  const className = propName.charAt(0).toUpperCase() + propName.slice(1) + 'Highlighter'
  const dummy = {}
  dummy[className] = class extends Highlighter {
    getProvider(update) {
      return update.state.field(syntaxState)[propName]
    }
  }
  return ViewPlugin.fromClass(dummy[className], {
    decorations: v => v.decorations
  })
})

export function getGoalAtCursor(state) {
  const pos = getCursorPos(state)
  const {holes, _holeToGoalMap} = state.field(syntaxState)

  let currentHole = null
  holes.between(pos, pos, (from, to, value) => {
    currentHole = value.range(from, to)
    return false
  })

  if (!currentHole) return null

  const goalMarker = _holeToGoalMap.get(currentHole.value)
  return goalMarker ? {
    widget: currentHole,
    index: goalMarker.widget.value
  } : null  // should not happen?
}

export function parseHoleContent(state, hole) {
  const slice = state.sliceDoc(hole.from, hole.to)
  const cg = slice.match(/^(\s*{!\s*)(.+?)(\s*!}\s*)$/)

  if (cg == null) {
    return null
  }

  const body = cg[2]
  const trimBefore = cg[1].length
  const trimAfter = cg[3].length

  const range = toHaskellRange(
    state.doc,
    hole.from + trimBefore,
    hole.to - trimAfter)

  return {
    body,
    trimBefore,
    trimAfter,
    range,
  }
}

