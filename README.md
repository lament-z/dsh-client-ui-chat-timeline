# dsh-client-ui-chat-timeline

A DSH web GUI plugin that adds a left-edge question navigator rail to the conversation: one tick per human question, a hover ripple that lengthens nearby ticks, a preview card per turn (user message plus assistant reply excerpt), click to jump, and a scroll-synced highlight of the current turn.

The interaction design replicates the ZCode desktop client's TurnNavigator (reverse-engineered from its 3.10.1 renderer bundle; see the workspace spec `.scratch/chat-timeline/spec.md`): 10px tick pitch, ripple `scaleX 2.6/1.7/1.25` at opacity `1/.86/.72/.58` over 150ms, 320px preview cards after a 120ms delay (80ms close), hidden below 2 questions or a 864px conversation width, `prefers-reduced-motion` turns jumps instant, full `aria` labelling.

## Requirements

- DSH `>=0.1.1-rc.1` (built and tested against `0.1.1-rc.2`).

## Install

```sh
dsh plugin --profile web add link:<this directory>
```

Then restart `dsh web` and reload the page. The rail appears beside any conversation with at least two of your questions once the window is wide enough.

## Notes

- Pure browser plugin: the host half is an empty cordis plugin.
- Data comes from the public client-runtime contracts (`ctx.sessions` + `ConversationSnapshot`); jump and scroll-sync probe the chat DOM through stable `data-*` hooks and degrade to a display-only rail when detection fails.
- Colors follow the page color scheme (`Canvas`/`CanvasText`), no theme token coupling.

## License

MIT
