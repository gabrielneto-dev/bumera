import type { QueueDefinition } from "@/lib/queue/queues";

/** Every queue this worker consumes. Phase 1 adds the turn, sender and reminder queues. */
export const workerQueues: QueueDefinition[] = [];
