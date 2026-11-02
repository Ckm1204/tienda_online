/**
 * HU-011, HU-012 & HU-153:
 * - Transactional Outbox y OutboxRelay hacia Kafka con `idempotent: true`, `acks: -1` (all)
 *   y propagación de cabeceras `x-tenant-id`, `x-event-id` y `traceparent`.
 * - Idempotent Consumer (`inbox.once`) con reintentos en `<topic>.retry` y envío a `<topic>.dlt`.
 */

export interface OutboxRecord {
  id: number;
  event_id: string;
  tenant_id: string;
  topic: string;
  partition_key: string;
  event_type: string;
  payload: unknown;
  traceparent: string;
  created_at: Date;
  published_at: Date | null;
}

export interface KafkaMessageEnvelope {
  topic: string;
  key: string;
  headers: Record<string, string>;
  value: string;
}

export interface KafkaProducerConfig {
  idempotent: true;
  acks: -1;
}

export const DEFAULT_IDEMPOTENT_PRODUCER_CONFIG: KafkaProducerConfig = Object.freeze({
  idempotent: true,
  acks: -1
});

export interface KafkaBrokerTransport {
  publish(msg: KafkaMessageEnvelope, config: KafkaProducerConfig): Promise<void>;
}

export class OutboxStore {
  private seq = 1;
  private readonly records: OutboxRecord[] = [];

  enqueue(input: {
    event_id: string;
    tenant_id: string;
    topic: string;
    partition_key: string;
    event_type: string;
    payload: unknown;
    traceparent?: string;
  }): OutboxRecord {
    const rec: OutboxRecord = {
      id: this.seq++,
      event_id: input.event_id,
      tenant_id: input.tenant_id,
      topic: input.topic,
      partition_key: input.partition_key,
      event_type: input.event_type,
      payload: input.payload,
      traceparent: input.traceparent ?? "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      created_at: new Date(),
      published_at: null
    };
    this.records.push(rec);
    return rec;
  }

  getUnpublished(limit = 100): OutboxRecord[] {
    return this.records.filter((r) => r.published_at === null).slice(0, limit);
  }

  markPublished(id: number, at = new Date()): void {
    const found = this.records.find((r) => r.id === id);
    if (found) {
      found.published_at = at;
    }
  }
}

export class OutboxRelay {
  constructor(
    private readonly store: OutboxStore,
    private readonly broker: KafkaBrokerTransport
  ) {}

  async flushPending(limit = 100): Promise<number> {
    const pending = this.store.getUnpublished(limit);
    let published = 0;

    for (const item of pending) {
      await this.broker.publish(
        {
          topic: item.topic,
          key: item.partition_key,
          headers: {
            "x-tenant-id": item.tenant_id,
            "x-event-id": item.event_id,
            "x-event-type": item.event_type,
            traceparent: item.traceparent
          },
          value: JSON.stringify(item.payload)
        },
        DEFAULT_IDEMPOTENT_PRODUCER_CONFIG
      );
      this.store.markPublished(item.id);
      published += 1;
    }

    return published;
  }
}

// ============================================================================
// HU-012: Idempotent Consumer (inbox.once) con retry topic y Dead Letter Topic
// ============================================================================

export interface DltMessage {
  originalTopic: string;
  dltTopic: string;
  eventId: string;
  consumer: string;
  attempts: number;
  errorMessage: string;
  payload: unknown;
}

export class InboxConsumerRunner {
  private readonly processed = new Set<string>();
  public readonly retryQueue: { topic: string; eventId: string; attempt: number }[] = [];
  public readonly dltMessages: DltMessage[] = [];

  constructor(private readonly maxRetries = 3) {}

  private key(eventId: string, consumer: string): string {
    return `${consumer}:${eventId}`;
  }

  hasProcessed(eventId: string, consumer: string): boolean {
    return this.processed.has(this.key(eventId, consumer));
  }

  async once<T>(params: {
    topic: string;
    eventId: string;
    consumer: string;
    payload: T;
    handler: (payload: T) => Promise<void>;
  }): Promise<{ status: "APPLIED" | "DUPLICATE" | "SENT_TO_DLT"; attempts: number }> {
    const dedupeKey = this.key(params.eventId, params.consumer);
    if (this.processed.has(dedupeKey)) {
      return { status: "DUPLICATE", attempts: 0 };
    }

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < this.maxRetries) {
      attempt += 1;
      try {
        await params.handler(params.payload);
        this.processed.add(dedupeKey);
        return { status: "APPLIED", attempts: attempt };
      } catch (err) {
        lastError = err;
        this.retryQueue.push({
          topic: `${params.topic}.retry`,
          eventId: params.eventId,
          attempt
        });
      }
    }

    this.dltMessages.push({
      originalTopic: params.topic,
      dltTopic: `${params.topic}.dlt`,
      eventId: params.eventId,
      consumer: params.consumer,
      attempts: attempt,
      errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
      payload: params.payload
    });

    return { status: "SENT_TO_DLT", attempts: attempt };
  }
}
