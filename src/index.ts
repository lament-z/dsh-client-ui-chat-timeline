/**
 * Host loader entry for the chat-timeline plugin — runs in the DSH host
 * process. Pure browser plugin: the host half has no behavior beyond
 * existing as the cordis bundle the profile composition imports; all UI
 * logic lives in the browser half (src/client/index.ts).
 */
import type { Context } from '@deepseek-ai/cordis'

/** Apply the host half. */
export function apply(ctx: Context): void {
  void ctx
}
