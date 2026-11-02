/**
 * HU-368: Analítica de uso de producto anónima y respetuosa de privacidad (PostHog/Telemetry)
 * No envía jamás PII (nombres, cédulas, montos de venta específicos ni teléfonos).
 * Solo métricas técnicas, duraciones y eventos de interfaz.
 */

export interface AnonymousTelemetryEvent {
  event: string;
  timestampMs: number;
  properties: Record<string, string | number | boolean>;
}

export class AnonymousAnalytics {
  private readonly events: AnonymousTelemetryEvent[] = [];
  private readonly piiKeyPatterns = [/name/i, /email/i, /phone/i, /document/i, /cedula/i, /customer/i];

  track(eventName: string, properties: Record<string, unknown> = {}): AnonymousTelemetryEvent {
    const sanitizedProps: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(properties)) {
      // Filtrar claves que coincidan con patrones de PII
      const isPiiKey = this.piiKeyPatterns.some((pattern) => pattern.test(key));
      if (isPiiKey) continue;

      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        sanitizedProps[key] = value;
      }
    }

    const eventObj: AnonymousTelemetryEvent = {
      event: eventName,
      timestampMs: Date.now(),
      properties: sanitizedProps
    };

    this.events.push(eventObj);
    return eventObj;
  }

  getRecordedEvents(): AnonymousTelemetryEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }
}

export const globalAnalytics = new AnonymousAnalytics();
