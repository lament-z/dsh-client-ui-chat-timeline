# DSH Chat Timeline

English | [简体中文](./README.zh.md)

A DSH web plugin that adds a **question navigator rail** beside the conversation: one tick per human question, hover ripples, a per-turn preview card, click-to-jump, and a scroll-synced highlight of the current turn. The interaction design replicates the ZCode desktop client's TurnNavigator; the jump mechanics reuse the DSH host's own turn-navigation implementation, so jumping behaves exactly like the built-in rail — including across the paged event window.

## Features

- **One tick per question, whole history.** Ticks come from the host's official `turnOutline` projection (session-turn-outline domain): the full-log turn index computed host-side, so every question of the session is navigable without paging the event window in first.
- **Click to jump, native mechanics.** Landing replicates the host ChatView's `navigateToTurn`/`landOnRow`: the turn's row is located by its native `data-chat-turn` anchor, scrolled instantly to sit 24px below the viewport top; turns outside the loaded window are paged in through the official `session.loadThrough(turn/start seq)` verb first.
- **Scroll-synced highlight.** The active tick follows the host's own reading-line rule (hit-test at `top + min(96, height * 0.2)`, last tick wins within 25px of the bottom), so the rail and the content never disagree.
- **Hover ripple and preview cards.** ZCode TurnNavigator parity: ripple `scaleX 2.6/1.7/1.25` at opacity `1/.86/.72/.58` over 150ms, 320px preview card after a 120ms delay (80ms close) showing the user prompt plus the assistant reply excerpt, styled with the host's native tooltip tokens (gray card, white text, follows light/dark theme).
- **Takes over the native rail, cleanly.** While the plugin is active, the host's built-in right-side Turn navigator is hidden; unloading the plugin restores it immediately. The plugin rail sets no question-count or width gate of its own.
- **Native band geometry, computed in CSS.** The rail's vertical position is the host's own band rule — viewport height minus composer height, halved — expressed as a single CSS `calc()` over the host's `--dsh-conversation-viewport-height` / `--dsh-composer-height` variables. No JavaScript measures it, and the rail no longer needs the native navigator to exist in the DOM in order to locate its band.

## How it mounts

The rail registers on the host's session-scoped `conversation.input.overlay` seat, and that choice is load-bearing. Since DSH 0.1.7 the open session is no longer discoverable from the sessions service — the list snapshot dropped its `current` field and `binding(id)` only borrows an already-retained scope — so a session-scoped seat is the only supported channel: the host passes the scope's session id into the registration's `inject`. Registering there also places the rail inside the conversation scroller, which is where the band variables are defined and therefore inherited from.

Vertical geometry consequently needs no measurement at all. The horizontal left edge is the one measured value: the conversation column is a grid track that the right sidebar shrinks, so it is not derivable from a window-edge offset.

## Requirements

- DSH `>=0.1.1-rc.1`. This revision is built and tested against `0.1.7-rc.2`; the seat it registers on and that seat's session-scoped `inject` are verified on `0.1.5-rc.2` as well.
- Pure browser plugin: the host half is an empty cordis plugin; nothing to configure.

## Install

```sh
# Preferred: install straight from GitHub (prebuilt lib is committed)
dsh plugin --profile web add github:lament-z/dsh-client-ui-chat-timeline

# Alternative: from npm
dsh plugin --profile web add @lament_z/dsh-client-ui-chat-timeline

# From a local clone / working copy
dsh plugin --profile web add link:<this directory>
```

Then restart `dsh web` and reload the page. The rail appears beside any conversation; the host's own right-side navigator is hidden while the plugin is active and comes back the moment you remove the plugin.

## Notes

- Jump and highlight reuse the host's stable contracts: `data-chat-turn` row anchors, `[data-conversation-scroll]` scrollport, `session.loadThrough`, and the `turnOutline` projection. When detection fails, the rail degrades to display-only instead of throwing.
- The rail is `position: fixed` and positioned from the host's layout variables, so it assumes no ancestor of the conversation establishes a containing block (`transform` / `filter` / `contain`). That holds in every layout this revision was verified against.
- The preview card is the only deliberately theme-coupled surface: it uses the host's tooltip tokens for the native gray look; the rail itself sticks to system `Canvas`/`CanvasText` colors.
- Failure mode is a display-only rail (or no rail), never a broken page.

## License

MIT
