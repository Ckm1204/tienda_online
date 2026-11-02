/**
 * HU-013: Envoltorio de Circuit Breaker (estados CLOSED, OPEN, HALF_OPEN),
 * timeouts y formato de error Problem Details (RFC 9457) sin exponer trazas internas.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance: string;
  trace_id: string;
}

export function createProblemDetails(params: {
  status: number;
  code: string;
  title: string;
  detail: string;
  instance: string;
  traceId: string;
}): ProblemDetails {
  const slug = params.code.toLowerCase().replace(/_/g, "-");
  return {
    type: `https://docs.tienditaonline.co/errors/${slug}`,
    title: params.title,
    status: params.status,
    code: params.code,
    detail: params.detail,
    instance: params.instance,
    trace_id: params.traceId
  };
}

export class CircuitOpenError extends Error {
  public readonly problem: ProblemDetails;
  constructor(serviceName: string, instance: string, traceId: string) {
    super(`Circuit breaker is OPEN for ${serviceName}`);
    this.name = "CircuitOpenError";
    this.problem = createProblemDetails({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      title: "Servicio temporalmente no disponible",
      detail: `El servicio ${serviceName} no responde; circuito abierto por protección.`,
      instance,
      traceId
    });
  }
}

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  callTimeoutMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly callTimeoutMs: number;
  public readonly name: string;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.callTimeoutMs = options.callTimeoutMs ?? 5_000;
  }

  getState(nowMs = Date.now()): CircuitState {
    if (this.state === "OPEN" && nowMs - this.openedAt >= this.resetTimeoutMs) {
      this.state = "HALF_OPEN";
    }
    return this.state;
  }

  async execute<T>(
    fn: () => Promise<T>,
    context: { instance?: string; traceId?: string; nowMs?: number } = {}
  ): Promise<T> {
    const now = context.nowMs ?? Date.now();
    const currentState = this.getState(now);

    if (currentState === "OPEN") {
      throw new CircuitOpenError(
        this.name,
        context.instance ?? "/",
        context.traceId ?? "00000000000000000000000000000000"
      );
    }

    try {
      const result = await this.withTimeout(fn, this.callTimeoutMs);
      this.consecutiveFailures = 0;
      this.state = "CLOSED";
      return result;
    } catch (err) {
      this.consecutiveFailures += 1;
      if (currentState === "HALF_OPEN" || this.consecutiveFailures >= this.failureThreshold) {
        this.state = "OPEN";
        this.openedAt = now;
      }
      throw err;
    }
  }

  private async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`TIMEOUT after ${timeoutMs}ms`)), timeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
