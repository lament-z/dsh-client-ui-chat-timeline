window.__ModuleLoader__.load({
	id: "@lament_z/dsh-client-ui-chat-timeline",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/dom.ts
		/**
		* Find the chat scroll container with a candidate chain.
		* 1. the explicit stable hook `[data-conversation-scroll]`;
		* 2. the closest scrollable ancestor of the flow column `[data-chat-flow]`;
		* 3. the largest scrollable element that contains keyed flow items.
		*/
		function findChatContainer(doc) {
			const direct = doc.querySelector("[data-conversation-scroll]");
			if (direct !== null) return direct;
			const flow = doc.querySelector("[data-chat-flow]");
			const ancestor = flow !== null ? scrollableAncestor(flow) : null;
			if (ancestor !== null) return ancestor;
			let best = null;
			let bestHeight = 0;
			for (const element of Array.from(doc.querySelectorAll("*"))) {
				if (!isScrollable(element)) continue;
				if (element.querySelector("[data-chat-flow-key]") === null) continue;
				const height = element.clientHeight;
				if (height > bestHeight) {
					best = element;
					bestHeight = height;
				}
			}
			return best;
		}
		function isScrollable(element) {
			const style = element.ownerDocument.defaultView?.getComputedStyle(element);
			if (style === void 0) return false;
			if (!/(auto|scroll)/.test(style.overflowY)) return false;
			return element.scrollHeight > element.clientHeight + 40 && element.clientHeight > 200;
		}
		function scrollableAncestor(element) {
			let node = element;
			while (node !== null) {
				if (isScrollable(node)) return node;
				node = node.parentElement;
			}
			return null;
		}
		/** Parse the seq prefix of a `data-chat-flow-key` (`"<seq>:<kind><id>"`), or null. */
		function seqOfKey(key) {
			if (key === null) return null;
			const split = key.indexOf(":");
			if (split <= 0) return null;
			const seq = Number(key.slice(0, split));
			return Number.isSafeInteger(seq) && seq >= 0 ? seq : null;
		}
		/**
		* The rendered row that starts the coverage of `seq`: the flow child with the
		* smallest seq ≥ the target (DOM order is virtualizer-scrambled, so scan all
		* children). When the loaded window starts after the target, this lands on
		* the window head — the closest reachable position.
		*/
		function findSeqAnchor(doc, seq) {
			if (seq === void 0 || !Number.isSafeInteger(seq)) return null;
			const scope = doc.querySelector("[data-chat-flow]") ?? doc;
			let best = null;
			let bestSeq = Number.POSITIVE_INFINITY;
			for (const child of Array.from(scope.querySelectorAll("[data-chat-flow-key]"))) {
				const childSeq = seqOfKey(child.getAttribute("data-chat-flow-key"));
				if (childSeq === null || childSeq < seq) continue;
				if (childSeq < bestSeq) {
					best = child;
					bestSeq = childSeq;
				}
			}
			return best;
		}
		/**
		* The active index: the last tick whose anchor sits above the container's
		* reading line (40px below the top edge), matching the ZCode "unit at
		* viewport top" rule. Turns outside the loaded window count as above when
		* they precede the window and as below when they follow it; at scroll bottom
		* the last tick wins.
		*/
		function computeActiveIndex(container, doc, seqs) {
			if (seqs.length === 0) return -1;
			const top = container.getBoundingClientRect().top + 40;
			let active = -1;
			let firstAnchored = -1;
			for (let index = 0; index < seqs.length; index += 1) {
				const anchor = findSeqAnchor(doc, seqs[index]);
				if (anchor === null) continue;
				if (firstAnchored === -1) firstAnchored = index;
				if (anchor.getBoundingClientRect().top <= top) active = index;
			}
			if (active === -1) {
				if (firstAnchored === -1) return -1;
				return firstAnchored > 0 ? firstAnchored - 1 : 0;
			}
			if (container.scrollHeight - container.scrollTop - container.clientHeight <= 4) return seqs.length - 1;
			return active;
		}
		/**
		* Scroll the given tick's turn into view. Tries a smooth scroll first; DSH's
		* windowed conversation list programs scrollTop on scroll events, which can
		* cancel a smooth animation on the first frame — when nothing has moved after
		* a short grace period the jump falls back to an instant scroll.
		* @returns false when the container or the turn's anchor is unavailable —
		* the caller is expected to page the turn in (official `loadThrough`) and
		* retry, so no window-edge guessing happens here.
		*/
		function jumpTo(index, seqs, behavior) {
			const container = findChatContainer(document);
			if (container === null) return false;
			const anchor = findSeqAnchor(document, seqs[index]);
			if (anchor === null) return false;
			const delta = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top - 12;
			const target = container.scrollTop + delta;
			if (behavior === "auto") {
				container.scrollTo({
					top: target,
					behavior: "auto"
				});
				return true;
			}
			const startedAt = container.scrollTop;
			container.scrollTo({
				top: target,
				behavior: "smooth"
			});
			window.setTimeout(() => {
				if (Math.abs(container.scrollTop - startedAt) < 4) container.scrollTo({
					top: target,
					behavior: "auto"
				});
			}, 700);
			return true;
		}
		/** Create the probe against a document (injectable for tests). */
		function probeChatDom(doc) {
			return {
				getContainer: () => findChatContainer(doc),
				activeIndex: (seqs) => {
					const container = findChatContainer(doc);
					if (container === null) return -1;
					return computeActiveIndex(container, doc, seqs);
				},
				jumpTo: (index, seqs, behavior) => jumpTo(index, seqs, behavior)
			};
		}
		const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
		/**
		* 跳到第 index 个刻度的完整落点流程（官方 turn-jump 的插件侧等价物）：
		* 1. 直接滚动到锚点；2. 锚点未挂载时先 `loadThrough(seq)` 把事件窗口翻页到位；
		* 3. 会话流的虚拟视口只渲染滚动位置附近的行，按目标方向步进滚动直到锚点出现，
		* 最后精确落点。任何一步成功即返回 true。
		*/
		async function jumpToTurn(doc, index, seqs, behavior, loadThrough) {
			const container = findChatContainer(doc);
			if (container === null) return false;
			if (jumpTo(index, seqs, behavior)) return true;
			const seq = seqs[index];
			if (seq !== void 0 && loadThrough !== void 0) try {
				await loadThrough(seq);
			} catch {}
			for (let attempt = 0; attempt < 14; attempt += 1) {
				if (jumpTo(index, seqs, "auto")) return true;
				const anchored = [];
				seqs.forEach((rowSeq, i) => {
					if (findSeqAnchor(doc, rowSeq) !== null) anchored.push(i);
				});
				if (anchored.length === 0) container.scrollTop = 0;
				else if (index < anchored[0]) container.scrollTop = Math.max(0, container.scrollTop - 4e3);
				else if (index > anchored[anchored.length - 1]) container.scrollTop = container.scrollHeight;
				else {
					const below = [...anchored].reverse().find((i) => i < index);
					const above = anchored.find((i) => i > index);
					const towardAbove = above !== void 0 && (below === void 0 || index - below >= above - index);
					container.scrollTop += towardAbove ? -4e3 : 4e3;
				}
				await sleep(350);
			}
			return jumpTo(index, seqs, "auto");
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* Stylesheet for the chat-timeline rail, injected once as a
		* `<style data-plugin-css="chat-timeline">` tag. All classes carry the
		* `dsh-tl-` prefix; colors use the CSS system colors Canvas/CanvasText so the
		* rail follows the app's color-scheme without reaching into DSH theme tokens.
		* Visual constants replicate the ZCode TurnNavigator (spec section 2.2).
		*/
		const TIMELINE_STYLES = `
.dsh-tl-nav {
  position: fixed;
  z-index: 10;
  width: 48px;
  pointer-events: none;
  opacity: 1;
  transition: opacity 150ms ease-out;
}
.dsh-tl-nav[data-visible="false"] {
  opacity: 0;
  visibility: hidden;
}
.dsh-tl-scroll {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  max-height: calc(100% - 96px);
  overflow-x: hidden;
  overflow-y: auto;
  padding-block: 4px;
  pointer-events: auto;
  scrollbar-width: none;
  color: CanvasText;
}
.dsh-tl-scroll::-webkit-scrollbar {
  display: none;
}
.dsh-tl-track {
  position: relative;
  width: 36px;
}
.dsh-tl-slot {
  position: absolute;
  left: 0;
  top: 0;
  height: 10px;
  width: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  border-radius: 2px;
  cursor: pointer;
}
.dsh-tl-slot:focus-visible {
  outline: 2px solid CanvasText;
  outline-offset: 2px;
}
.dsh-tl-tick {
  display: block;
  height: 2px;
  width: 12px;
  border-radius: 999px;
  background: currentColor;
  transform-origin: left center;
  transition: height 150ms ease-out, opacity 150ms ease-out, transform 150ms ease-out, background-color 150ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-tl-nav,
  .dsh-tl-tick {
    transition: none;
  }
}
.dsh-tl-tip {
  position: fixed;
  z-index: 60;
  width: 320px;
  max-width: calc(100vw - 2rem);
  padding: 12px;
  border-radius: 10px;
  background: Canvas;
  color: CanvasText;
  border: 1px solid color-mix(in srgb, CanvasText 15%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.dsh-tl-tip-user {
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  white-space: pre-line;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
}
.dsh-tl-tip-assistant {
  margin: 8px 0 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  white-space: pre-line;
  font-size: 13px;
  line-height: 20px;
  opacity: 0.8;
}
.dsh-tl-tip-assistant[data-kind="running"],
.dsh-tl-tip-assistant[data-kind="empty"] {
  opacity: 0.55;
}
`;
		/** Inject the stylesheet once per document. */
		function ensureStyles(doc) {
			const tagId = "chat-timeline";
			if (doc.querySelector("style[data-plugin-css=\"chat-timeline\"]") !== null) return;
			const tag = doc.createElement("style");
			tag.dataset.plugin = "@lament_z/dsh-client-ui-chat-timeline";
			tag.dataset.pluginCss = tagId;
			tag.textContent = TIMELINE_STYLES;
			doc.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/rail.tsx
		/**
		* TimelineRail — the shell.overlay entry: a left-edge tick rail over the
		* conversation, one tick per human question. Visual and interaction constants
		* replicate the ZCode TurnNavigator (see .scratch/chat-timeline/spec.md):
		* hover ripple scaleX 2.6/1.7/1.25 with opacity 1/.86/.72/.58 over 150ms,
		* 320px preview cards after a 120ms delay, >=2 questions to render, >=864px
		* container width, prefers-reduced-motion fallback, full aria labelling.
		*/
		/** Slot height per tick (10px pitch, ZCode parity). */
		const ITEM_PITCH = 10;
		/** Container width below which the rail hides. ZCode uses 864px, but DSH's
		*  three-pane layout leaves the conversation narrower — the rail overlays the
		*  left edge without taking layout space, so only truly cramped panes hide. */
		const MIN_CONTAINER_WIDTH = 560;
		/** Preview-card hover delays (ms). */
		const TIP_OPEN_DELAY = 120;
		const TIP_CLOSE_DELAY = 80;
		/** Ripple visual per distance from the hovered tick (ZCode _5e parity).
		*  The ripple is interaction-only: at rest every tick is idle (scaleX 1),
		*  and the current position is signalled by color/opacity, not length. */
		function ripple(distance) {
			if (distance === 0) return {
				opacity: 1,
				scaleX: 2.6,
				tone: "peak"
			};
			if (distance === 1) return {
				opacity: .86,
				scaleX: 1.7,
				tone: "near"
			};
			if (distance === 2) return {
				opacity: .72,
				scaleX: 1.25,
				tone: "mid"
			};
			return {
				opacity: .58,
				scaleX: 1,
				tone: "idle"
			};
		}
		/** Tick colors: foreground for the hovered peak and the current turn at rest,
		*  the subtlest text tone otherwise (ZCode bg-foreground / -subtlest parity
		*  through system colors). */
		const TICK_COLOR_FOREGROUND = "CanvasText";
		const TICK_COLOR_SUBTLE = "color-mix(in srgb, CanvasText 42%, transparent)";
		function useReducedMotion() {
			const [reduced, setReduced] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
				const query = window.matchMedia("(prefers-reduced-motion: reduce)");
				const update = () => setReduced(query.matches);
				update();
				query.addEventListener("change", update);
				return () => query.removeEventListener("change", update);
			}, []);
			return reduced;
		}
		/**
		* Render the question navigator rail.
		* @param props - composed slot props.
		* @returns the rail, or null when it should not render.
		*/
		function TimelineRail({ source, t }) {
			const state = (0, react.useSyncExternalStore)(source.subscribe, source.getSnapshot);
			const reducedMotion = useReducedMotion();
			const probe = (0, react.useMemo)(() => typeof document === "undefined" ? null : probeChatDom(document), []);
			const [containerVersion, setContainerVersion] = (0, react.useState)(0);
			const [rect, setRect] = (0, react.useState)(null);
			const [activeIndex, setActiveIndex] = (0, react.useState)(-1);
			const [hoverIndex, setHoverIndex] = (0, react.useState)(void 0);
			const [tipIndex, setTipIndex] = (0, react.useState)(void 0);
			const timers = (0, react.useRef)({
				open: void 0,
				close: void 0
			});
			const frame = (0, react.useRef)(0);
			const snapshot = state.snapshot;
			const items = (0, react.useMemo)(() => snapshot === null ? [] : snapshot.items, [snapshot]);
			const sourceRef = (0, react.useRef)(source);
			sourceRef.current = source;
			const itemsRef = (0, react.useRef)([]);
			itemsRef.current = items;
			const seqs = (0, react.useMemo)(() => items.map((item) => item.seq), [items]);
			const seqsRef = (0, react.useRef)([]);
			seqsRef.current = seqs;
			(0, react.useEffect)(() => {
				if (typeof document === "undefined") return;
				ensureStyles(document);
			}, []);
			(0, react.useEffect)(() => {
				if (probe === null) return;
				let attempts = 0;
				let timer;
				const tick = () => {
					if (probe.getContainer() !== null || attempts >= 10) {
						setContainerVersion((version) => version + 1);
						return;
					}
					attempts += 1;
					timer = setTimeout(tick, 300);
				};
				tick();
				return () => {
					if (timer !== void 0) clearTimeout(timer);
				};
			}, [probe, state.sessionId]);
			(0, react.useEffect)(() => {
				if (probe === null || containerVersion === 0) return;
				const container = probe.getContainer();
				if (container === null) {
					setRect(null);
					return;
				}
				const sync = () => {
					if (frame.current !== 0) return;
					frame.current = requestAnimationFrame(() => {
						frame.current = 0;
						const box = container.getBoundingClientRect();
						setRect({
							left: box.left,
							top: box.top,
							height: box.height,
							width: box.width
						});
						setActiveIndex(probe.activeIndex(seqsRef.current));
					});
				};
				sync();
				container.addEventListener("scroll", sync, { passive: true });
				const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
				observer?.observe(container);
				window.addEventListener("resize", sync);
				return () => {
					container.removeEventListener("scroll", sync);
					observer?.disconnect();
					window.removeEventListener("resize", sync);
					if (frame.current !== 0) cancelAnimationFrame(frame.current);
					frame.current = 0;
				};
			}, [probe, containerVersion]);
			(0, react.useEffect)(() => {
				if (probe === null || containerVersion === 0 || rect === null) return;
				setActiveIndex(probe.activeIndex(seqs));
			}, [
				probe,
				containerVersion,
				rect,
				seqs
			]);
			const visible = snapshot !== null && items.length >= 2 && rect !== null && rect.width >= MIN_CONTAINER_WIDTH;
			const focusIndex = hoverIndex;
			const scheduleTip = (0, react.useCallback)((index) => {
				if (timers.current.open !== void 0) window.clearTimeout(timers.current.open);
				if (timers.current.close !== void 0) window.clearTimeout(timers.current.close);
				if (index === void 0) {
					timers.current.close = window.setTimeout(() => setTipIndex(void 0), TIP_CLOSE_DELAY);
					return;
				}
				timers.current.open = window.setTimeout(() => setTipIndex(index), TIP_OPEN_DELAY);
			}, []);
			(0, react.useEffect)(() => () => {
				if (timers.current.open !== void 0) window.clearTimeout(timers.current.open);
				if (timers.current.close !== void 0) window.clearTimeout(timers.current.close);
			}, []);
			const jump = (0, react.useCallback)((index) => {
				jumpToTurn(document, index, seqsRef.current, reducedMotion ? "auto" : "smooth", (seq) => sourceRef.current?.jumpThrough(seq) ?? Promise.resolve());
			}, [reducedMotion]);
			if (!visible || probe === null || rect === null) return null;
			const trackHeight = items.length * ITEM_PITCH;
			const tip = tipIndex !== void 0 ? items[tipIndex] : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
				"aria-label": t("nav.label"),
				className: "dsh-tl-nav",
				"data-visible": visible ? "true" : "false",
				"data-testid": "dsh-chat-timeline",
				"data-item-count": items.length,
				style: {
					left: rect.left,
					top: rect.top,
					height: rect.height
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-tl-scroll",
					onPointerLeave: () => {
						setHoverIndex(void 0);
						scheduleTip(void 0);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-tl-track",
						style: { height: `${trackHeight}px` },
						children: items.map((item, index) => {
							const isActive = index === activeIndex;
							const look = ripple(focusIndex === void 0 ? 3 : Math.abs(index - focusIndex));
							const activeAtRest = focusIndex === void 0 && isActive;
							const foreground = look.tone === "peak" || activeAtRest;
							const opacity = activeAtRest ? .9 : item.running ? Math.max(look.opacity, .72) : look.opacity;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-tl-slot",
								style: { transform: `translateY(${index * ITEM_PITCH}px)` },
								onMouseEnter: () => {
									setHoverIndex(index);
									scheduleTip(index);
								},
								onFocus: () => {
									setHoverIndex(index);
									scheduleTip(index);
								},
								onBlur: () => {
									setHoverIndex(void 0);
									scheduleTip(void 0);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-current": isActive ? "location" : void 0,
									"aria-label": t("nav.jumpToQuery", { index: String(index + 1) }),
									"aria-posinset": index + 1,
									"aria-setsize": items.length,
									"data-testid": "dsh-chat-timeline-item",
									"data-item-index": index,
									"data-active": isActive ? "true" : "false",
									"data-running": item.running ? "true" : "false",
									onClick: () => jump(index),
									className: "dsh-tl-slot-inner",
									style: {
										display: "flex",
										alignItems: "center",
										justifyContent: "flex-start",
										width: "100%",
										height: "100%",
										padding: 0,
										border: 0,
										background: "transparent",
										cursor: "pointer"
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-tl-tick",
										style: {
											opacity,
											transform: `scaleX(${look.scaleX})`,
											backgroundColor: foreground ? TICK_COLOR_FOREGROUND : TICK_COLOR_SUBTLE
										}
									})
								})
							}, item.key);
						})
					})
				})
			}), tip !== void 0 && tipIndex !== void 0 ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TipCard, {
				item: tip,
				index: tipIndex,
				rect,
				t
			}), document.body) : null] });
		}
		function TipCard({ item, index, rect, t }) {
			const box = document.querySelector("[data-testid=\"dsh-chat-timeline-item\"][data-item-index=\"" + String(index) + "\"]")?.getBoundingClientRect();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-tl-tip",
				"data-testid": "dsh-chat-timeline-tip",
				style: {
					left: box === void 0 ? rect.left + 56 : Math.min(box.right + 8, window.innerWidth - 336),
					top: box === void 0 ? rect.top + 100 : Math.max(8, Math.min(box.top - 4, window.innerHeight - 160))
				},
				role: "tooltip",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-tl-tip-user",
					children: item.userFallback ? t("preview.userFallback") : item.userPreview
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-tl-tip-assistant",
					"data-kind": item.assistantKind,
					children: item.assistantKind === "running" ? t("preview.assistantRunning") : item.assistantKind === "empty" ? t("preview.assistantEmpty") : item.assistantPreview
				})]
			});
		}
		//#endregion
		//#region src/client/source.ts
		const EMPTY_STATE = {
			sessionId: void 0,
			snapshot: null
		};
		/** Project one outline entry onto a tick (previews are host-bounded already). */
		function itemFromOutline(entry, isLive, labels) {
			const prompt = typeof entry.prompt === "string" ? entry.prompt : "";
			const response = typeof entry.response === "string" ? entry.response : "";
			const assistantKind = response ? "text" : isLive ? "running" : "empty";
			return {
				key: `t${entry.turn}`,
				seq: entry.seq,
				time: 0,
				turn: entry.turn,
				userPreview: prompt || labels.userFallback,
				userFallback: !prompt,
				assistantPreview: response || (isLive ? labels.assistantRunning : labels.assistantEmpty),
				assistantKind,
				running: isLive
			};
		}
		/** Build the tick list from the outline plus the live running flag. */
		function itemsFromOutline(outline, running, labels) {
			const last = outline.length - 1;
			return outline.map((entry, index) => itemFromOutline(entry, running && index === last, labels));
		}
		/**
		* Create the source. Subscribes to the sessions list, rebinds to the current
		* session's outline projection on selection change (polling while no session
		* is selected — the list store need not notify on pure selection switches),
		* and republishes a stable state whenever the outline or running flag moves.
		* @param sessions - the sessions service face (pass ctx.sessions).
		* @returns the source face.
		*/
		function createTimelineSource(sessions) {
			let state = EMPTY_STATE;
			const listeners = /* @__PURE__ */ new Set();
			let subscribed = false;
			let unbindSession = null;
			let retryTimer;
			let retryAttempts = 0;
			let noSessionPolls = 0;
			const emit = () => {
				for (const listener of listeners) listener();
			};
			const rebind = () => {
				if (retryTimer !== void 0) {
					clearTimeout(retryTimer);
					retryTimer = void 0;
				}
				let current;
				try {
					current = sessions.list.getSnapshot()?.current;
				} catch {
					current = void 0;
				}
				if (current === void 0) {
					state = EMPTY_STATE;
					emit();
					if (subscribed && noSessionPolls < 60) {
						noSessionPolls += 1;
						retryTimer = setTimeout(rebind, 1e3);
					}
					return;
				}
				noSessionPolls = 0;
				unbindSession?.();
				unbindSession = null;
				let bound;
				try {
					bound = sessions.binding(current);
				} catch {
					bound = void 0;
				}
				const session = bound?.session;
				const outlineFace = (() => {
					try {
						return session?.projections?.faceOf?.("turnOutline");
					} catch {
						return;
					}
				})();
				if (!session || !outlineFace) {
					state = {
						sessionId: current,
						snapshot: null
					};
					if (retryAttempts < 10) {
						retryAttempts += 1;
						retryTimer = setTimeout(rebind, 500 * retryAttempts);
					}
					emit();
					return;
				}
				retryAttempts = 0;
				const push = () => {
					try {
						const outline = outlineFace.getSnapshot();
						const running = Boolean(session.getSnapshot()?.running);
						state = {
							sessionId: current,
							snapshot: {
								sessionId: current,
								items: Array.isArray(outline) ? itemsFromOutline(outline, running, {
									userFallback: "（无文本）",
									assistantRunning: "（运行中）",
									assistantEmpty: "（空）"
								}) : [],
								running
							}
						};
					} catch {
						state = {
							sessionId: current,
							snapshot: null
						};
					}
					emit();
				};
				push();
				try {
					outlineFace.subscribe(push);
					session.subscribe(push);
					unbindSession = () => {};
				} catch {
					unbindSession = null;
				}
			};
			return {
				subscribe(listener) {
					const first = listeners.size === 0;
					listeners.add(listener);
					if (first) {
						subscribed = true;
						try {
							sessions.list.subscribe(rebind);
						} catch {}
						rebind();
					}
					return () => {
						listeners.delete(listener);
					};
				},
				getSnapshot() {
					return state;
				},
				jumpThrough(seq) {
					let current;
					try {
						current = sessions.list.getSnapshot()?.current;
					} catch {
						current = void 0;
					}
					const session = current === void 0 ? void 0 : sessions.binding(current)?.session;
					if (typeof session?.loadThrough !== "function") return Promise.resolve();
					return session.loadThrough(seq).catch(() => {});
				}
			};
		}
		/** Build the source from the plugin client context. */
		function timelineSourceFromContext(ctx) {
			return createTimelineSource(ctx.sessions);
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Locale dictionaries for the chat-timeline plugin. `zh` is the key-set source
		* of truth; `en` keeps a full key-for-key mirror. Registered through
		* ctx.locale.register(NS, { zh, en }).
		*/
		/** Simplified Chinese dictionary (key-set source of truth). */
		const zh = {
			"nav.label": "对话问题导航",
			"nav.jumpToQuery": "跳转到第 {index} 条问题",
			"preview.userFallback": "用户输入",
			"preview.assistantEmpty": "暂无助手正文",
			"preview.assistantRunning": "助手仍在工作"
		};
		/** English dictionary, key-for-key complete against zh. */
		const en = {
			"nav.label": "Conversation question navigator",
			"nav.jumpToQuery": "Jump to question {index}",
			"preview.userFallback": "User input",
			"preview.assistantEmpty": "No assistant text yet",
			"preview.assistantRunning": "Assistant is still working"
		};
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "chat-timeline";
		/** Unique occupant id inside the shared shell.overlay list slot. */
		const ENTRY_ID = "chat-timeline";
		/** Services required by this plugin. */
		const inject = [
			"slots",
			"locale",
			"sessions"
		];
		/**
		* Register the timeline surface.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => {
				try {
					return ctx.locale.register(NS, {
						zh,
						en
					});
				} catch {
					return () => {};
				}
			}, "chat-timeline: dictionaries");
			ctx.slots.inject("shell.overlay", () => {
				try {
					return ctx.slots.register({
						name: "shell.overlay",
						id: ENTRY_ID,
						locale: NS,
						inject: () => ({ source: timelineSourceFromContext(ctx) })
					}, TimelineRail);
				} catch (err) {
					console.error("chat-timeline: shell.overlay register failed:", err);
					return () => {};
				}
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map