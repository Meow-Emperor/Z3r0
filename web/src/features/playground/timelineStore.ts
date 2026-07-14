import type { AgentContentEvent, AgentStreamEvent } from "../../shared/api/types";
import { AGENT_EVENT_TYPE } from "../../shared/api/generated/constants";
import { buildChatNodesFromEvents, type ChatState } from "./chatState";

// One entry per logical timeline item, addressed by a stable key so history
// and live frames upsert into the same slot. `order` is the server-assigned
// monotonic `seq` (stable first-seen position); synthetic client-only frames
// (e.g. a disconnect notice) sort after everything via SYNTHETIC_ORDER_BASE.
export type TimelineEntry = {
  seq: number;
  order: number;
  event: AgentContentEvent;
};

export type TimelineStore = {
  items: Map<string, TimelineEntry>;
  streaming: boolean;
  localCounter: number;
};

const SYNTHETIC_ORDER_BASE = Number.MAX_SAFE_INTEGER - 1_000_000;

export function emptyTimelineStore(): TimelineStore {
  return { items: new Map(), streaming: false, localCounter: 0 };
}

// Stable identity shared by every source for one logical item. Returns null for
// control frames (run_state/done) that never enter the timeline.
export function clientItemKey(event: AgentStreamEvent): string | null {
  switch (event.type) {
    case AGENT_EVENT_TYPE.RUN_STATE:
    case AGENT_EVENT_TYPE.DONE:
      return null;
    case AGENT_EVENT_TYPE.TEXT_DELTA:
    case AGENT_EVENT_TYPE.TEXT_COMPLETE:
      return `text:${event.nested_call_id}:${event.segment_id}`;
    case AGENT_EVENT_TYPE.THINKING_DELTA:
    case AGENT_EVENT_TYPE.THINKING_COMPLETE:
      return `thinking:${event.nested_call_id}:${event.segment_id}`;
    case AGENT_EVENT_TYPE.TOOL_CALL:
      return `tc:${event.nested_call_id}:${event.call_id}`;
    case AGENT_EVENT_TYPE.TOOL_RESULT:
      return `tr:${event.nested_call_id}:${event.call_id}`;
    case AGENT_EVENT_TYPE.SUBAGENT_TASK:
      return `sa:${event.run_id}`;
    case AGENT_EVENT_TYPE.USER_MESSAGE:
      return event.seq > 0 ? `user:${event.seq}` : "";
    case AGENT_EVENT_TYPE.TURN_BOUNDARY:
      return event.seq > 0 ? `turn:${event.seq}` : "";
    case AGENT_EVENT_TYPE.ERROR:
      return event.seq > 0 ? `error:${event.seq}` : "";
  }
}

// Idempotent upsert of a batch of frames (history or live) into the store.
// Returns a new store so React sees a fresh reference.
export function ingestEvents(store: TimelineStore, events: readonly AgentStreamEvent[]): TimelineStore {
  if (!events.length) return store;
  const items = new Map(store.items);
  let streaming = store.streaming;
  let localCounter = store.localCounter;

  for (const event of events) {
    if (event.type === AGENT_EVENT_TYPE.RUN_STATE) {
      // Tracks the main agent only (idle-live): toggles per continuation and
      // flips just the streaming flag — never clears the keyed item map.
      streaming = event.running;
      continue;
    }
    if (event.type === AGENT_EVENT_TYPE.DONE) {
      // per-turn control frame: a turn delimiter only, never rendered or stored
      continue;
    }

    let key = clientItemKey(event);
    const seq = typeof event.seq === "number" ? event.seq : 0;
    let order: number;
    if (key) {
      const existing = items.get(key);
      order = existing ? existing.order : seq;
    } else {
      // synthetic / unstamped keyless frame: keep insertion order at the tail
      localCounter += 1;
      key = `local:${event.type}:${localCounter}`;
      order = SYNTHETIC_ORDER_BASE + localCounter;
    }
    items.set(key, { seq, order, event: event as AgentContentEvent });
  }

  return { items, streaming, localCounter };
}

// Mark the live turn finished without dropping any persisted items (used on a
// transport close where the server never sent run_state=false).
export function endStreaming(store: TimelineStore): TimelineStore {
  if (!store.streaming) return store;
  return { ...store, streaming: false };
}

export function orderedEvents(store: TimelineStore): AgentContentEvent[] {
  return [...store.items.values()]
    .sort((a, b) => a.order - b.order || a.seq - b.seq)
    .map((entry) => entry.event);
}

// Derive the rendered transcript. The ordered, key-deduped event list is
// replayed through the shared builder, which upserts blocks by segment/call/run
// id — so identical items never duplicate and ordering follows seq.
export function deriveChatState(store: TimelineStore): ChatState {
  const nodes = buildChatNodesFromEvents(orderedEvents(store));
  return { nodes, streaming: store.streaming, pendingNested: {}, liveFrom: null };
}
