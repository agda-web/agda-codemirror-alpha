<script>
import { onMount, afterUpdate, onDestroy } from 'svelte'
import { writable } from 'svelte/store'

import { socket, sendMessage, socketMessage, log } from './stores'
import CodeMirror from './CodeMirror.svelte'
import ConnectionEditor from './ConnectionEditor.svelte'

import { EditorSelection } from '@codemirror/next/state'
import { initialContent } from './corpus'
import * as adhoc from './adhoc'
import { dispatchHighlight, labelGoals, goToNextGoal, goToPrevGoal, getHoleByIndex, replaceHoleWith } from './agda/commands'
import { fromUTF8Offset, getCursorPos } from './agda/utils'
import { syntaxState } from './agda/syntax'

let editor
let view

let agdaInfoTitle = '', agdaInfoContent = ''

let logTextArea

const commands = [
  {label: 'Load',     command: () => adhoc.sendSyncRequest(view), desc: '(l)'},
  {label: 'Abort',    command: () => adhoc.sendAbort(view), desc: '(xa)'},
  {label: '⏪',       command: () => goToPrevGoal(view), desc: '(b)'},
  {label: '⏩',       command: () => goToNextGoal(view), desc: '(f)'},
  {label: 'Context',  command: () => adhoc.sendContext(view), desc: '(,)'},
  {label: 'Cxt+Have', command: () => adhoc.sendContextAndInferredType(view), desc: '(.)'},
  {label: 'Refine',   command: () => adhoc.sendRefine(view), desc: '(r)'},
]

afterUpdate(() => {
  logTextArea.scrollTop = logTextArea.scrollHeight
})

function handleAgdaResponse(msg) {
  try {
    if (msg == null) return
    var {k: cmd, v: args, error} = JSON.parse(msg)
    console.debug('processing', cmd, args)
  } catch (e) {
    console.error(e, msg)
  }

  if (error) {
    console.warn('The service returned error:', error)
    return
  }

  switch (cmd) {
  case 'agda2-abort-done':
    log.update(x => x + 'Abort done\n')
    break
  case 'agda2-info-action':
    const [title, content, append] = args
    agdaInfoTitle = title
    agdaInfoContent = (append ? agdaInfoContent : '') + content
    break
  case 'agda2-goals-action':
    const [numbering] = args
    labelGoals(view, numbering)
    break
  case 'agda2-give-action':
    const [goalIdx, instr] = args
    const hole = getHoleByIndex(view.state, goalIdx)
    let target

    if (typeof instr === 'string') {
      target = instr
    } else {
      if (instr.s == 'paren') target = true
      else if (instr.s == 'no-paren') target = false
      else {
        console.warn('Unknown "agda2-give-action"', args, hole)
        break
      }
    }
    const replaced = replaceHoleWith(view, hole, target)
    adhoc.sendHighlightOnGoal(view, goalIdx, replaced)

    break
  case 'agda2-highlight-clear':
    dispatchHighlight(view, null)
    break
  case 'agda2-maybe-goto':
    // TODO: in fact this needs a queue
    const [[fname, pos]] = args
    view.dispatch({
      selection: EditorSelection.single(fromUTF8Offset(view.state.doc, pos - 1)),
      scrollIntoView: true
    })
    break
  case 'agda2-highlight-add-annotations':
    const [remove, ...specs] = args
    if (specs[0] == null) {
      console.warn('Highlight fails', specs)
      return
    }
    dispatchHighlight(view, specs)
    break
  case 'agda2-status-action':
    // log.update(x => x + `Set status: "${args[0]}"` + '\n')
    break
  case 'agda2-exit-done':
    console.warn('Agda exited.')
    break
  default:
    console.warn(`Unhandled command "${cmd}"`, args, msg)
  }
}

onMount(() => {
  return socketMessage.subscribe(msg => {
    try {
      return handleAgdaResponse(msg)
    } catch (err) {
      // to prevent unresponsiveness if an exception is thrown here
      console.error('Error occurred while processing Agda response:', err)
    }
  })
})

// debug functions

window.clearHighlight = () => {
  dispatchHighlight(view, null)
}

window.showSyntaxState = () => {
  console.log(view.state.field(syntaxState))
}


// from svelte-template-hot
/*if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.$destroy()
  })
  import.meta.hot.accept()
}*/
</script>

<main id="main">
  <h1 id="site-title">Agda mode in CodeMirror 6<span class="rev">2020<br>0930</span></h1>
  <div id="left-side">
    <div>
      <ConnectionEditor socket={socket}></ConnectionEditor>
      {#each commands as {command, label, desc}}
      <button on:click={command}>{label} <span class="buttonDesc">{desc}</span></button>{' '}
      {/each}
    </div>
    <div style="min-width: 0">
      <CodeMirror initialContent={initialContent} bind:this={editor} bind:view={view}>
      </CodeMirror>
    </div>
  </div>
  <div id="right-side">
    <div style="overflow: auto">
      <p class="agda-info-title">{agdaInfoTitle}</p>
      <pre class="agda-info-content">{agdaInfoContent}</pre>
    </div>
    <textarea bind:this={logTextArea} class="log">{$log}</textarea>
  </div>
</main>

<style>
#site-title {
  font-size: 1.4em;
  font-family: sans-serif;
  font-weight: 600;
  position: absolute;
  left: 1em;
  top: 1em;
  transform: rotate(90deg);
  transform-origin: top left;
  margin: 0 1em;
  color: #111;
}

#site-title .rev {
  display: inline-block;
  line-height: 1;
  font-size: .5em;
  margin-left: 2em;
  font-weight: normal;
  transform: rotate(-90deg) scale(0.8);
}

#main {
  display: grid;
  grid-template-columns: 4fr 3fr;
  grid-column-gap: 16px;
  height: 100vh;
  grid-template-rows: 100vh;
}

#left-side {
  display: grid;
  grid-template-rows: min-content minmax(0, auto);
}

#right-side {
  display: grid;
  grid-template-rows: 9fr minmax(100px, 1fr);
}

.log {
  display: block;
  width: 100%;
}

.agda-info-title {
  font-size: 1.2em;
  font-weight: 600;
}

pre {
  font-family: Iosevka;
}

button {
  padding: 4px 8px;
  margin: 4px 0;
  background-image: linear-gradient(rgb(239, 241, 245), rgb(217, 217, 223));
  border: 1px solid rgb(136, 136, 136);
  border-radius: 4px;
}

button .buttonDesc {
  font-family: monospace;
  font-size: .7em;
}
</style>
