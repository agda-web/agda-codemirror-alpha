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

function genHoleRewritingSpecs(descs) {
  const ret = []
  for (const {begin: from, end: to, text: c} of descs) {
    let insert
    if (c == null) {
      insert = '{!  !}'
    } else if (c.trim() == '') {
      insert = '{!' + c.padEnd(2) + '!}'
    } else {
      insert = `{!${c}!}`
    }
    ret.push({ from, to, insert })
  }
  return ret
}

export function buildMarkers(state, specs) {
  const marks = [], holes = [], goalDescs = []
  for (const spec of specs) {
    const [begin, end, meta] = spec
    const type = meta[0].s

    const slice = state.doc.sliceString(begin, end)
    let cgGoal = slice.match(/^(?:\?|{!([\s\S]*)!})$/)

    if (cgGoal) {
      // goal objects must be distinct, so do not cache them
      const mark = Decoration.mark({
        class: themeClass(classNameForHoles),
      })
      holes.push(mark.range(begin, end))
      goalDescs.push({ begin, end, text: cgGoal[1] })
    } else {
      let className = 'agda-' + type
      let mark
      if (decoSpecCache.has(className)) {
        mark = decoSpecCache.get(className)
      } else {
        decoSpecCache.set(className, mark = Decoration.mark({
          class: themeClass(className)
        }))
      }
      marks.push(mark.range(begin, end))
    }
  }

  const rewriteSpecs = genHoleRewritingSpecs(goalDescs)
  const _rewriteDesc = state.changes(rewriteSpecs)

  // because we hack on PointDecoration to set mapMode to TrackBefore,
  // we cannot drop highlight & goals and apply changes afterwards, otherwise
  // they will get deleted instantly
  const goalPoints = goalDescs.map(desc => _rewriteDesc.mapPos(desc.end))

  return {marks, holes, goalPoints, _rewriteDesc}
}

// maintaining indexed, append-only decos that syncs with the state
class SyntaxState {
  constructor(data) {
    Object.assign(this, data)
  }

  update(update) {
    let {marks, holes, goals} = this
    if (update.marks) {
      marks = marks.update({add: update.marks})
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
      const iter = holes.iter()
      let newWidgets = []

      let idx = 0
      while (iter.value) {
        const pos = update.goalPoints[idx]

        // XXXX: pairs only non-paired for now
        if (!this._holeToGoalMap.has(iter.value)) {
          const widget = Decoration.widget({
            // this fortunately relies on Agda's current behavior that
            // goal labels are set before highlighting
            widget: new GoalMarker(this.goalLabels[idx]),
            side: 1,
          })
          // FIXME: hack; but this causes glitches sometimes
          widget.mapMode = MapMode.TrackBefore
          newWidgets.push(widget.range(pos))

          this._holeToGoalMap.set(iter.value, widget)
        }

        iter.next()
        idx++
      }

      console.log('add new', goals, newWidgets)

      // TODO: assert #holes == #goals == #labels

      goals = goals.update({add: newWidgets})
    }

    return new SyntaxState({...this, marks, holes, goals})
  }

  storeIndexes(goalLabels) {
    return new SyntaxState({...this, goalLabels})
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
          for (const l of value.goalLabels) {
            if (newLabels.indexOf(l) < 0) {
              eliminated.add(l)
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
    this.marks = Decoration.none
    this.holes = Decoration.none
    this.goals = Decoration.none
  }

  update(update) {
    // TODO: is it possible to integrate w/ undo stack?
    if (update.docChanged || update.viewportChanged || hasEffect(update.transactions, setSyntax)) {
      const value = update.state.field(syntaxState)

      this.marks = this.applyHighlight(update.view, value.marks)
      // be lazy; assuming holes and goals are not too many
      this.holes = value.holes
      this.goals = value.goals

      // FIXME: should add an effect (annotation?) to trace on deco changes
      // if (this.onupdate) {
      //   this.onupdate(this)
      // }
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

export const highlighter = ViewPlugin.fromClass(Highlighter, {
  decorations: [v => v.marks, v => v.holes, v => v.goals]
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

