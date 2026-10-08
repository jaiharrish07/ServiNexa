'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/store/auth';

// ---- Types -----------------------------------------------------------------
type EventType = 'sr_update' | 'notification' | 'wo_update' | 'machine_update';

interface WsMessage {
  type: EventType;
  payload: Record<string, unknown>;
}

type Listener = (payload: Record<string, unknown>) => void;

// ---- Singleton connection --------------------------------------------------
// We keep exactly one WebSocket across the whole app so that multiple hooks
// share it rather than opening parallel connections.

let globalWs: WebSocket | null = null;
let listeners: Map<EventType, Set<Listener>> = new Map();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
const MAX_BACKOFF_MS = 30_000;

function getWsUrl(token: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  // Turn http(s)://host into ws(s)://host
  const base = apiUrl
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:')
    || `ws://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3001`;
  return `${base}/ws?token=${encodeURIComponent(token)}`;
}

function emit(type: EventType, payload: Record<string, unknown>) {
  const set = listeners.get(type);
  if (set) set.forEach((fn) => fn(payload));
}

function connectGlobal(token: string) {
  if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const ws = new WebSocket(getWsUrl(token));

  ws.onopen = () => {
    reconnectAttempt = 0;
  };

  ws.onmessage = (event) => {
    try {
      const msg: WsMessage = JSON.parse(event.data as string);
      if (msg.type) emit(msg.type, msg.payload);
    } catch {
      /* ignore non-JSON frames */
    }
  };

  ws.onclose = () => {
    globalWs = null;
    scheduleReconnect(token);
  };

  ws.onerror = () => {
    // onclose will fire after onerror
  };

  globalWs = ws;
}

function scheduleReconnect(token: string) {
  if (reconnectTimer) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_BACKOFF_MS);
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectGlobal(token);
  }, delay);
}

function disconnectGlobal() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (globalWs) {
    globalWs.onclose = null; // prevent reconnect
    globalWs.close();
    globalWs = null;
  }
  reconnectAttempt = 0;
}

function subscribe(type: EventType, fn: Listener) {
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

// ---- Hooks -----------------------------------------------------------------

/**
 * Maintains the singleton WebSocket connection. Mount this once at the layout
 * level (or it will self-manage via ref counting when used through
 * `useRealtimeRefresh`).
 */
export function useWebSocket() {
  const token = useAuth((s) => s.token);

  useEffect(() => {
    if (!token) {
      disconnectGlobal();
      return;
    }
    connectGlobal(token);
    return () => {
      // Don't disconnect on unmount if other hooks are subscribed;
      // only disconnect when there are truly no more listeners.
      if (listeners.size === 0 || [...listeners.values()].every((s) => s.size === 0)) {
        disconnectGlobal();
      }
    };
  }, [token]);
}

/**
 * Call `callback` whenever an event of `entityType` arrives.
 *
 * Automatically manages the singleton WS connection.
 */
export function useRealtimeRefresh(entityType: EventType, callback: () => void) {
  const token = useAuth((s) => s.token);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const stableCallback = useCallback((payload: Record<string, unknown>) => {
    cbRef.current();
  }, []);

  // Ensure global WS is connected
  useEffect(() => {
    if (token) connectGlobal(token);
  }, [token]);

  // Subscribe to events
  useEffect(() => {
    const unsub = subscribe(entityType, stableCallback);
    return unsub;
  }, [entityType, stableCallback]);
}
