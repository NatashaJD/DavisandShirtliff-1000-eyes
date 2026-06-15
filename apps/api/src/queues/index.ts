/**
 * BullMQ Queue definitions — barrel re-export
 *
 * Re-exports all five pipeline queues from the canonical queues module.
 * Import from this file for convenience:
 *   import { timelineQueue, slaQueue, ... } from '../queues/index.js'
 *
 * Requirements: 3.1, 3.8
 */

export {
  timelineQueue,
  slaQueue,
  alertQueue,
  broadcastQueue,
  analyticsQueue,
} from './queues.js';
