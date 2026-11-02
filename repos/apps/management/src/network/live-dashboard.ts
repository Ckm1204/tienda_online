/**
 * HU-471: Manejo de desconexión y reconexión automática del stream
 * Server-Sent Events (/v1/app/reports/dashboard/stream) con Last-Event-ID
 * y fallback automático a polling de 30 segundos.
 */

export interface DashboardEvent {
  id: string;
  type: string;
  data: unknown;
  receivedAtMs: number;
}

export interface LiveDashboardOptions {
  streamUrl: string;
  pollingUrl: string;
  token?: string;
  pollingIntervalMs?: number;
  onUpdate: (event: DashboardEvent) => void;
  onError?: (err: Error) => void;
  onStatusChange?: (status: "CONNECTED_SSE" | "FALLBACK_POLLING" | "RECONNECTING" | "DISCONNECTED") => void;
}

export class LiveDashboardManager {
  private lastEventId: string | null = null;
  private status: "CONNECTED_SSE" | "FALLBACK_POLLING" | "RECONNECTING" | "DISCONNECTED" = "DISCONNECTED";
  private eventSource: any = null;
  private pollingTimer: any = null;
  private reconnectTimer: any = null;
  private consecutiveFailures = 0;
  private isDestroyed = false;

  constructor(private readonly options: LiveDashboardOptions) {}

  getStatus() {
    return this.status;
  }

  getLastEventId() {
    return this.lastEventId;
  }

  connect(): void {
    if (this.isDestroyed) return;

    // Si EventSource no está soportado en este entorno, activar polling de inmediato
    if (typeof EventSource === "undefined") {
      this.activatePolling();
      return;
    }

    this.setStatus("RECONNECTING");
    try {
      const url = new URL(this.options.streamUrl, "http://localhost");
      if (this.lastEventId) {
        url.searchParams.set("lastEventId", this.lastEventId);
      }
      if (this.options.token) {
        url.searchParams.set("token", this.options.token);
      }

      this.eventSource = new EventSource(url.toString());

      this.eventSource.onopen = () => {
        this.consecutiveFailures = 0;
        this.setStatus("CONNECTED_SSE");
      };

      this.eventSource.onmessage = (e: MessageEvent) => {
        if (e.lastEventId) {
          this.lastEventId = e.lastEventId;
        }
        let parsed: unknown = e.data;
        try {
          parsed = JSON.parse(e.data);
        } catch {
          // Mantener texto sin formato
        }

        this.options.onUpdate({
          id: e.lastEventId || `evt-${Date.now()}`,
          type: "dashboard_update",
          data: parsed,
          receivedAtMs: Date.now()
        });
      };

      this.eventSource.onerror = (err: any) => {
        this.consecutiveFailures++;
        this.options.onError?.(new Error("SSE connection error: " + String(err)));
        this.cleanupEventSource();

        if (this.consecutiveFailures >= 3) {
          // Fallback a polling tras 3 intentos fallidos
          this.activatePolling();
        } else {
          // Reintento con backoff exponencial
          const delay = Math.min(1000 * Math.pow(2, this.consecutiveFailures), 10000);
          this.reconnectTimer = setTimeout(() => this.connect(), delay);
        }
      };
    } catch (err: unknown) {
      this.consecutiveFailures++;
      this.activatePolling();
    }
  }

  private activatePolling(): void {
    if (this.isDestroyed) return;
    this.cleanupEventSource();
    this.setStatus("FALLBACK_POLLING");

    const poll = async () => {
      if (this.isDestroyed) return;
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (this.options.token) {
          headers["Authorization"] = `Bearer ${this.options.token}`;
        }
        if (this.lastEventId) {
          headers["Last-Event-ID"] = this.lastEventId;
        }

        const res = await fetch(this.options.pollingUrl, { headers });
        if (res.ok) {
          const data = await res.json();
          this.options.onUpdate({
            id: `poll-${Date.now()}`,
            type: "dashboard_poll",
            data,
            receivedAtMs: Date.now()
          });
        }
      } catch (err) {
        this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    };

    // Polling inicial inmediato
    poll();
    this.pollingTimer = setInterval(poll, this.options.pollingIntervalMs ?? 30000);
  }

  private cleanupEventSource(): void {
    if (this.eventSource) {
      this.eventSource.close?.();
      this.eventSource = null;
    }
  }

  private setStatus(newStatus: "CONNECTED_SSE" | "FALLBACK_POLLING" | "RECONNECTING" | "DISCONNECTED"): void {
    this.status = newStatus;
    this.options.onStatusChange?.(newStatus);
  }

  disconnect(): void {
    this.isDestroyed = true;
    this.cleanupEventSource();
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setStatus("DISCONNECTED");
  }
}
