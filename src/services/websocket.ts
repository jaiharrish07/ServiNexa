import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { supabase } from '../config/supabase';

// ---- Types ----------------------------------------------------------------
type EventType = 'sr_update' | 'notification' | 'wo_update' | 'machine_update';

interface WsMessage {
  type: EventType;
  payload: Record<string, unknown>;
}

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

// ---- Module state ----------------------------------------------------------
let wss: WebSocketServer;

// ---- Helpers ---------------------------------------------------------------
function broadcast(msg: WsMessage) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients as Set<AuthenticatedSocket>) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// ---- Supabase Realtime subscriptions ---------------------------------------
function subscribeToChanges() {
  supabase
    .channel('ws-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'service_requests' },
      (payload) => broadcast({ type: 'sr_update', payload: payload as unknown as Record<string, unknown> }),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      (payload) => broadcast({ type: 'notification', payload: payload as unknown as Record<string, unknown> }),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'work_orders' },
      (payload) => broadcast({ type: 'wo_update', payload: payload as unknown as Record<string, unknown> }),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'machines' },
      (payload) => broadcast({ type: 'machine_update', payload: payload as unknown as Record<string, unknown> }),
    )
    .subscribe((status) => {
      // eslint-disable-next-line no-console
      console.log(`[ws] Supabase Realtime channel status: ${status}`);
    });
}

// ---- Authenticate incoming WS connection -----------------------------------
async function authenticateConnection(
  req: http.IncomingMessage,
): Promise<string | null> {
  try {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) return null;

    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !authUser) return null;

    return authUser.id;
  } catch {
    return null;
  }
}

// ---- Heartbeat (detect dead connections) ------------------------------------
function startHeartbeat() {
  const interval = setInterval(() => {
    for (const ws of wss.clients as Set<AuthenticatedSocket>) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on('close', () => clearInterval(interval));
}

// ---- Public API ------------------------------------------------------------

/**
 * Attach a WebSocket server to an existing HTTP server and start listening for
 * Supabase Realtime events to broadcast to authenticated clients.
 */
export function initWebSocket(server: http.Server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws: AuthenticatedSocket, req) => {
    const userId = await authenticateConnection(req);
    if (!userId) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    ws.userId = userId;
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('error', () => {
      /* swallow per-socket errors */
    });
  });

  startHeartbeat();
  subscribeToChanges();

  // eslint-disable-next-line no-console
  console.log('[ws] WebSocket server attached (path: /ws)');
}
