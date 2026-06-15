/**
 * RealtimeBroadcasterService
 *
 * Manages WebSocket connections and Redis Pub/Sub fan-out.
 * Implements publish, subscribe, queue-on-disconnect, and drain-on-reconnect.
 *
 * Architecture:
 *   State change → BullMQ realtime-broadcast job → this service
 *   → Redis PUBLISH → all broadcaster instances → WebSocket clients
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 7.7
 */

import { createClient, type RedisClientType } from 'redis';
import { WebSocketServer, WebSocket } from 'ws';

import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import type { BroadcastPayload } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MessageHandler = (payload: BroadcastPayload) => void;

interface ConnectedClient {
  ws: WebSocket;
  connectionId: string;
  userId: string;
  role: string;
  subscribedChannels: Set<string>;
  lastReceivedAt?: string;
}

// ---------------------------------------------------------------------------
// Redis queue key helpers
// ---------------------------------------------------------------------------

/** Key for the undelivered message queue for a connection (24-hour TTL) */
const queueKey = (connectionId: string) => `ws:queue:${connectionId}`;
const QUEUE_TTL_SECONDS = 86_400; // 24 hours

// ---------------------------------------------------------------------------
// RealtimeBroadcasterService
// ---------------------------------------------------------------------------

export class RealtimeBroadcasterService {
  private pubClient: ReturnType<typeof createClient>;
  private subClient: ReturnType<typeof createClient>;
  private connectedClients = new Map<string, ConnectedClient>();
  private subscriptions = new Map<string, Set<MessageHandler>>();
  private wss?: WebSocketServer;

  constructor() {
    this.pubClient = createClient({ url: env.REDIS_URL });
    this.subClient = createClient({ url: env.REDIS_URL });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    await this.pubClient.connect();
    await this.subClient.connect();
    logger.info('[broadcaster] Connected to Redis');
  }

  async disconnect(): Promise<void> {
    await this.pubClient.quit();
    await this.subClient.quit();
    this.wss?.close();
    logger.info('[broadcaster] Disconnected from Redis');
  }

  // ---------------------------------------------------------------------------
  // Core interface
  // ---------------------------------------------------------------------------

  /**
   * Publish a payload to a Redis Pub/Sub channel.
   * Requirements: 9.1, 9.3
   */
  async publish(channel: string, payload: BroadcastPayload): Promise<void> {
    const message = JSON.stringify(payload);
    await this.pubClient.publish(channel, message);
  }

  /**
   * Subscribe a local handler to a Redis Pub/Sub channel.
   * Requirements: 9.3
   */
  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());

      await this.subClient.subscribe(channel, (message) => {
        try {
          const payload = JSON.parse(message) as BroadcastPayload;
          const handlers = this.subscriptions.get(channel);
          handlers?.forEach((h) => h(payload));
        } catch (err) {
          logger.error({ err, channel }, '[broadcaster] Failed to parse Pub/Sub message');
        }
      });
    }

    this.subscriptions.get(channel)!.add(handler);
  }

  /**
   * Queue an undelivered message for a disconnected client (Redis list, 24h TTL).
   * Requirements: 9.2
   */
  async queueUndelivered(connectionId: string, payload: BroadcastPayload): Promise<void> {
    const key = queueKey(connectionId);
    await this.pubClient.rPush(key, JSON.stringify(payload));
    await this.pubClient.expire(key, QUEUE_TTL_SECONDS);
  }

  /**
   * Drain the undelivered queue for a reconnected client.
   * Requirements: 9.2
   */
  async drainQueue(connectionId: string): Promise<BroadcastPayload[]> {
    const key = queueKey(connectionId);
    const items = await this.pubClient.lRange(key, 0, -1);
    if (items.length > 0) {
      await this.pubClient.del(key);
    }
    return items.map((item) => JSON.parse(item) as BroadcastPayload);
  }

  // ---------------------------------------------------------------------------
  // WebSocket server
  // ---------------------------------------------------------------------------

  /**
   * Start the WebSocket server and wire up client handling.
   * Requirements: 9.1, 9.4, 9.5
   */
  startWebSocketServer(port: number): void {
    this.wss = new WebSocketServer({ port });
    logger.info({ port }, '[broadcaster] WebSocket server started');

    this.wss.on('connection', (ws: WebSocket) => {
      const connectionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      logger.info({ connectionId }, '[broadcaster] Client connected');

      ws.on('message', async (rawData) => {
        try {
          const msg = JSON.parse(rawData.toString()) as {
            type: string;
            channels?: string[];
            last_received_at?: string;
            userId?: string;
            role?: string;
          };

          if (msg.type === 'subscribe' && msg.channels) {
            // Register client
            const client: ConnectedClient = {
              ws,
              connectionId,
              userId: msg.userId ?? 'anonymous',
              role: msg.role ?? 'unknown',
              subscribedChannels: new Set(msg.channels),
            };
            this.connectedClients.set(connectionId, client);

            // Subscribe to each requested channel on Redis Pub/Sub
            for (const channel of msg.channels) {
              await this.subscribe(channel, (payload) => {
                this._deliverToClient(client, payload);
              });
            }

            ws.send(JSON.stringify({ type: 'subscribed', connectionId, channels: msg.channels }));

          } else if (msg.type === 'reconnect') {
            // Reconnect: drain queued messages (Req 9.2)
            const queued = await this.drainQueue(connectionId);
            for (const payload of queued) {
              if (!msg.last_received_at || payload.sentAt > msg.last_received_at) {
                ws.send(JSON.stringify({ type: 'update', ...payload }));
              }
            }
          }
        } catch (err) {
          logger.error({ err, connectionId }, '[broadcaster] Error processing client message');
        }
      });

      ws.on('close', () => {
        this.connectedClients.delete(connectionId);
        logger.info({ connectionId }, '[broadcaster] Client disconnected');
      });

      ws.on('error', (err) => {
        logger.error({ err, connectionId }, '[broadcaster] WebSocket error');
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Fan-out helpers
  // ---------------------------------------------------------------------------

  /**
   * Broadcast a payload to all connected clients subscribed to the channel.
   * Requirements: 9.1
   */
  broadcastToSubscribers(payload: BroadcastPayload): void {
    for (const client of this.connectedClients.values()) {
      if (client.subscribedChannels.has(payload.channel)) {
        this._deliverToClient(client, payload);
      }
    }
  }

  private _deliverToClient(client: ConnectedClient, payload: BroadcastPayload): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type: 'update', ...payload }));
    } else {
      // Client disconnected — queue for later delivery (Req 9.2)
      this.queueUndelivered(client.connectionId, payload).catch((err) => {
        logger.error({ err }, '[broadcaster] Failed to queue undelivered message');
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const realtimeBroadcaster = new RealtimeBroadcasterService();
