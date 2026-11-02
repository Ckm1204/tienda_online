export type ConnectionStatus = "checking" | "online" | "offline";

export interface ConnectionSnapshot {
  readonly status: ConnectionStatus;
  readonly revision: number;
}

export class OfflineError extends Error {
  constructor() {
    super("Sin conexion a internet");
    this.name = "OfflineError";
  }
}

export class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  controller: AbortController,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new OfflineError());
    controller.signal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", onAbort);
      controller.signal.removeEventListener("abort", cleanup);
    };
    if (controller.signal.aborted) {
      cleanup();
      reject(new OfflineError());
      return;
    }
    Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new OfflineError();
      return operation(controller.signal);
    }).then(resolve, reject).finally(cleanup);
    controller.signal.addEventListener("abort", cleanup, { once: true });
  });
}

export class OnlineSession {
  private snapshot: ConnectionSnapshot = { status: "checking", revision: 0 };
  private readonly listeners = new Set<() => void>();
  private probeController: AbortController | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private paused = false;

  constructor(
    private readonly probe: (signal: AbortSignal) => Promise<boolean>,
    private readonly timeoutMs = 5_000,
    private readonly intervalMs = 15_000
  ) {}

  getSnapshot = (): ConnectionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(status: ConnectionStatus): void {
    this.snapshot = { status, revision: this.snapshot.revision + 1 };
    for (const listener of this.listeners) listener();
  }

  start(): void {
    if (this.running) return;
    this.paused = false;
    this.running = true;
    void this.check();
    this.interval = setInterval(() => void this.check(), this.intervalMs);
  }

  stop(): void {
    this.paused = true;
    this.running = false;
    if (this.interval !== undefined) clearInterval(this.interval);
    this.interval = undefined;
    this.disconnect();
  }

  disconnect(): void {
    this.probeController?.abort();
    this.probeController = undefined;
    this.publish("offline");
  }

  assertOnline(revision?: number): number {
    if (this.snapshot.status !== "online" || (revision !== undefined && revision !== this.snapshot.revision)) {
      throw new OfflineError();
    }
    return this.snapshot.revision;
  }

  async check(): Promise<void> {
    if (this.paused || this.probeController) return;
    const controller = new AbortController();
    this.probeController = controller;
    try {
      const reachable = await withTimeout(this.probe, controller, this.timeoutMs);
      if (this.probeController !== controller) return;
      if (!reachable) {
        this.disconnect();
      } else if (this.snapshot.status !== "online") {
        this.publish("online");
      }
    } catch {
      if (this.probeController === controller) this.disconnect();
    } finally {
      if (this.probeController === controller) this.probeController = undefined;
    }
  }
}

export interface WriteCommand {
  readonly method: "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly body: string | undefined;
  readonly idempotencyKey: string;
}

export class OnlineApiClient {
  private readonly active = new Set<AbortController>();
  private readonly unsubscribe: () => void;
  private readonly commands = new WeakSet<WriteCommand>();
  private disposed = false;

  constructor(
    private readonly baseUrl: string,
    private readonly session: OnlineSession,
    private readonly transport: typeof fetch = fetch,
    private readonly createKey: () => string = () => crypto.randomUUID(),
    private readonly timeoutMs = 10_000
  ) {
    const base = new URL(baseUrl);
    if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new Error("Invalid API URL");
    }
    this.unsubscribe = session.subscribe(() => {
      if (session.getSnapshot().status !== "online") {
        for (const controller of this.active) controller.abort();
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    for (const controller of this.active) controller.abort();
  }

  private url(path: string): string {
    if (!path.startsWith("/") || path.startsWith("//") || /[\\#\r\n]/.test(path)) {
      throw new Error("API path must be relative to the configured server");
    }
    const url = new URL(`${this.baseUrl.replace(/\/$/, "")}${path}`);
    if (url.origin !== new URL(this.baseUrl).origin) throw new Error("Invalid API origin");
    return url.toString();
  }

  prepareWrite(method: WriteCommand["method"], path: string, body?: unknown): WriteCommand {
    if (this.disposed) throw new Error("API client disposed");
    this.session.assertOnline();
    this.url(path);
    const command = Object.freeze({ method, path, body: body === undefined ? undefined : JSON.stringify(body), idempotencyKey: this.createKey() });
    this.commands.add(command);
    return command;
  }

  read<T>(path: string, parse: (data: unknown) => T): Promise<T> {
    return this.request(path, { method: "GET" }, parse);
  }

  execute<T>(command: WriteCommand, parse: (data: unknown) => T): Promise<T> {
    if (!this.commands.has(command)) throw new Error("Unknown write command");
    return this.request(command.path, {
      method: command.method,
      headers: { "Content-Type": "application/json", "Idempotency-Key": command.idempotencyKey },
      ...(command.body === undefined ? {} : { body: command.body })
    }, parse);
  }

  private async request<T>(path: string, init: RequestInit, parse: (data: unknown) => T): Promise<T> {
    if (this.disposed) throw new Error("API client disposed");
    const revision = this.session.assertOnline();
    const url = this.url(path);
    const controller = new AbortController();
    this.active.add(controller);
    try {
      return await withTimeout(async (signal) => {
        let response: Response;
        try {
          response = await this.transport(url, { ...init, signal, cache: "no-store", credentials: "include", redirect: "error" });
        } catch {
          throw new OfflineError();
        }
        this.session.assertOnline(revision);
        if (!response.ok) throw new HttpError(response.status);
        let data: unknown;
        try {
          data = response.status === 204 ? undefined : await response.json();
        } catch (error) {
          if (error instanceof TypeError) throw new OfflineError();
          throw error;
        }
        this.session.assertOnline(revision);
        return parse(data);
      }, controller, this.timeoutMs);
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.status >= 500 && this.session.getSnapshot().revision === revision) this.session.disconnect();
        throw error;
      }
      if (error instanceof OfflineError || controller.signal.aborted) {
        if (!this.disposed && this.session.getSnapshot().revision === revision) this.session.disconnect();
        throw new OfflineError();
      }
      throw error;
    } finally {
      this.active.delete(controller);
    }
  }
}