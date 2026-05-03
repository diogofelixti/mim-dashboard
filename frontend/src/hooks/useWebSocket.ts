'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001';
const RECONNECT_DELAY = 3_000;

type Handler = (data: unknown) => void;
type Listeners = Map<string, Set<Handler>>;

let socket: WebSocket | null = null;
let listeners: Listeners = new Map();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectedCallbacks: Set<(v: boolean) => void> = new Set();
let isConnected = false;

function notifyConnected(val: boolean) {
  isConnected = val;
  connectedCallbacks.forEach((cb) => cb(val));
}

function connect() {
  if (socket && socket.readyState < 2) return;

  socket = new WebSocket(`${WS_URL}/ws`);

  socket.onopen = () => {
    notifyConnected(true);
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  };

  socket.onmessage = (event) => {
    let msg: { type: string; data?: unknown };
    try { msg = JSON.parse(event.data as string); } catch { return; }

    const { type, ...rest } = msg;
    const payload = rest.data ?? rest;

    listeners.get(type)?.forEach((h) => h(payload));
    listeners.get('*')?.forEach((h) => h({ type, ...payload as object }));
  };

  socket.onclose = () => {
    notifyConnected(false);
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
  };

  socket.onerror = () => {
    socket?.close();
  };
}

function subscribe(type: string, handler: Handler): () => void {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(handler);

  return () => {
    listeners.get(type)?.delete(handler);
  };
}

export function useWebSocket() {
  const [connected, setConnected] = useState(isConnected);

  useEffect(() => {
    connectedCallbacks.add(setConnected);
    connect();

    return () => {
      connectedCallbacks.delete(setConnected);
    };
  }, []);

  const stableSubscribe = useCallback(
    (type: string, handler: Handler) => subscribe(type, handler),
    []
  );

  return { connected, subscribe: stableSubscribe };
}
