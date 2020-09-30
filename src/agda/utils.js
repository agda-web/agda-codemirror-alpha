function getAstralRegex() {
  return /[\uD800-\uDBFF][\uDC00-\uDFFF]/g
}

export function fromUTF8Ranges(doc, ranges) {
  const docIter = doc.iter()

  // NOTE: under the assumption that ranges are sorted with start positions
  // and no partial overlapping, i.e., none of shape A---B===A---B
  // 🇹🇼

  const astralRegex = getAstralRegex()
  let scannedChars = 0
  let accuAstralCount = 0
  let countProcessed = 0

  const arranged = []
  const stack = []

  while (!docIter.done) {
    const slice = docIter.value

    // record all "char" positions of surrogate pairs in this slice;
    // a surrogate pair = offset by +1 of indices after that position
    const surrPos = []
    astralRegex.lastIndex = 0
    let match, sliceAstralCount = 0
    while (match = astralRegex.exec(slice)) {
      surrPos.push(scannedChars + match.index - sliceAstralCount)
      sliceAstralCount++
    }

    const sliceEndPos = scannedChars + slice.length - sliceAstralCount
    // console.log('start iter with previous astral count', accuAstralCount, 'dest', sliceEndPos, docIter)
    // console.log('this slice astral count', sliceAstralCount)

    let surrPosCur = 0
    while (countProcessed != ranges.length) {
      const [start, end] = ranges[countProcessed]

      if (sliceEndPos <= start) {
        // case 1: this slice has nothing to do with this range
        break
      }

      // count surrogate pairs wrt. the range
      // (slice begin) ------- START ------- END --- ...
      // startOffs:    ^^^^^^^
      // endOffs:      ^^^^^^^^^^^^^^^^^^^^^
      let startOffs = 0, endOffs = 0
      // XXX: surrPosCur seems can be reused, but fundementally we can
      // store occurence as bitmap + bit twiddling to get an O(1)? stat
      surrPosCur = 0
      for (; surrPosCur < surrPos.length; surrPosCur++) {
        if (surrPos[surrPosCur] < start) {
          startOffs++
        }
        if (surrPos[surrPosCur] < end) {
          endOffs++
        } else {
          break
        }
      }

      if (sliceEndPos >= end) {
        // case 2: this slice hops over this range
        const fitted = [
          start + accuAstralCount + startOffs,
          end + accuAstralCount + endOffs
        ]
        arranged.push(fitted)
      } else {
        // case 3: this slice step into this range
        // in this case, the sliceAstralCount of the end position is unknown yet.
        const stashing = [
          start + accuAstralCount + startOffs,
          // NOTE: endOffs == surrPos.length, and will be
          // added later, no need to add here!!
          end
        ]

        const placeholderIdx = arranged.length
        arranged.push(null)

        // store the current count and where to resume counting
        stack.push({
          index: placeholderIdx,
          curCnt: accuAstralCount + endOffs,
          scanFrom: sliceEndPos,
          range: stashing,
        })
      }
      countProcessed++
    }

    // now try to reduce the stack as possible:
    // those which this slice steps "out" from.
    // assuming no partial overlapping here allow us to ensure the end indices
    // are increasing, so we can store them in a stack
    while (stack.length) {
      // sliceAstralCount is not finished yet, but maybe we can count
      let {index, curCnt, scanFrom, range} = stack[stack.length - 1]
      const [arrangedStart, oldEnd] = range

      // count [scanFrom, end)
      // XXX: bisect if the array is large?
      for (let i = 0; i < surrPos.length; i++) {
        if (surrPos[i] >= oldEnd) {
          break
        }
        if (surrPos[i] >= scanFrom) {
          curCnt++
        }
      }

      if (sliceEndPos >= oldEnd) {
        stack.pop()
        arranged[index] = [arrangedStart, oldEnd + curCnt]
      } else {
        break
      }
    }

    // update all remaining in stack with [scanFrom, dest] being
    // all listed positions
    for (const undone of stack) {
      undone.curCnt += surrPos.length
      undone.scanFrom = sliceEndPos
    }

    scannedChars = sliceEndPos
    accuAstralCount += sliceAstralCount
    docIter.next()
  }

  let min = -1
  for (let i = 0; i < arranged.length; i++) {
    const v = arranged[i][0]
    if (v < min) {
      console.warn('unsorted near', i, ':', arranged[i])
      // break
    }
    min = v
  }

  return arranged
}

export function fromUTF8Offset(doc, pos) {
  return fromUTF8Ranges(doc, [[pos, pos]])[0][0]
}

export function getCursorPos(state) {
  const selection = state.selection.primary
  return selection.head
}

export function toUTF8Coords(doc, pos) {
  // XXX: naive implementation expecting poor performance,
  // but as this function is called O(1) times in usual operations,
  // it is generally tolerable
  const astralRegex = getAstralRegex()

  function _countAstralChars(str) {
    const matched = str.match(astralRegex)
    return matched ? matched.length : 0
  }

  const thisLine = doc.lineAt(pos)
  const sliceAbove = doc.sliceString(0, thisLine.from)
  let cntAbove = _countAstralChars(sliceAbove)

  const colPos = pos - thisLine.from
  const sliceAhead = thisLine.slice(0, colPos)
  let cntAhead = _countAstralChars(sliceAhead)

  return [
    pos - (cntAbove + cntAhead),  // the UTF-8 offset
    thisLine.number,              // the line number   | of the above pos
    colPos - cntAhead             // the column number |
  ]
}

function toHaskellPoint(doc, pos) {
  if (doc == null) {
    return `(Pn () 0 0 0)`
  }
  const [offs, ln, colNo] = toUTF8Coords(doc, pos + 1)
  return `(Pn () ${offs} ${ln} ${colNo})`
}

function toInterval(doc, from, to) {
  return `[Interval ${toHaskellPoint(doc, from)} ${toHaskellPoint(doc, to)}]`
}

export function toHaskellRange(doc, from, to) {
  const interval = toInterval(doc, from, to)
  return `(intervalsToRange (Just (mkAbsolute "/tmp/my.agda")) ${interval})`
}
