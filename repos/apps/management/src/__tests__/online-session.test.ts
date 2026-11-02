import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, OfflineError, OnlineApiClient, OnlineSession } from "../network/online-session.js";
import { bindDeviceConnectivity, type DeviceNetworkState, type DeviceSignals } from "../network/device-connectivity";

const parseResult = (data: unknown): { ok: boolean } => {
  if (!data || typeof data !== "object" || !("ok" in data) || typeof data.ok !== "boolean") {
    throw new Error("Invalid server response");
  }
  return { ok: data.ok };
};

async function setup() {
  const probe = vi.fn(async () => true);
  const session = new OnlineSession(probe);
  await session.check();
  const transport = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
  const client = new OnlineApiClient("https://api.example.test", session, transport, () => "fixed-request-key");
  return { probe, session, transport, client };
}

afterEach(() => vi.useRealTimers());

describe("HU-096: management never operates offline", () => {
  it("blocks reads and writes until the backend is reachable", async () => {
    const session = new OnlineSession(async () => false);
    const transport = vi.fn<typeof fetch>();
    const client = new OnlineApiClient("https://api.example.test", session, transport);
    expect(session.getSnapshot().status).toBe("checking");
    await expect(client.read("/v1/products", parseResult)).rejects.toThrow(OfflineError);
    expect(() => client.prepareWrite("POST", "/v1/products", {})).toThrow(OfflineError);
    await session.check();
    expect(session.getSnapshot().status).toBe("offline");
    expect(transport).not.toHaveBeenCalled();
  });

  it("requires a fresh successful probe to recover after connectivity loss", async () => {
    const { session, probe } = await setup();
    session.disconnect();
    probe.mockResolvedValueOnce(false);
    await session.check();
    expect(session.getSnapshot().status).toBe("offline");
    await session.check();
    expect(session.getSnapshot().status).toBe("online");
  });

  it("aborts all in-flight requests immediately on network loss", async () => {
    const { session, transport, client } = await setup();
    transport.mockImplementation(() => new Promise(() => {}));
    const pending = client.read("/v1/products", parseResult);
    const rejected = expect(pending).rejects.toThrow(OfflineError);
    await Promise.resolve();
    session.disconnect();
    await rejected;
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("never sends a queued write after a synchronous disconnection", async () => {
    const { session, transport, client } = await setup();
    const command = client.prepareWrite("POST", "/v1/products", { name: "Arroz" });
    const rejected = expect(client.execute(command, parseResult)).rejects.toThrow(OfflineError);
    session.disconnect();
    await rejected;
    expect(transport).not.toHaveBeenCalled();
  });

  it("fails closed when the connection is lost while reading the response body", async () => {
    const { session, transport, client } = await setup();
    const response = Response.json({ ok: true });
    vi.spyOn(response, "json").mockRejectedValue(new TypeError("Failed to fetch response body"));
    transport.mockResolvedValueOnce(response);
    await expect(client.read("/v1/products", parseResult)).rejects.toThrow(OfflineError);
    expect(session.getSnapshot().status).toBe("offline");
  });

  it("discards stale responses even when the transport ignores cancellation", async () => {
    const { session, transport, client } = await setup();
    let resolveResponse!: (value: Response) => void;
    transport.mockImplementation(() => new Promise((resolve) => { resolveResponse = resolve; }));
    const pending = client.read("/v1/products", parseResult);
    const rejected = expect(pending).rejects.toThrow(OfflineError);
    await Promise.resolve();
    session.disconnect();
    await session.check();
    resolveResponse(Response.json({ ok: true }));
    await rejected;
  });

  it("keeps the idempotency key and immutable payload for an explicit retry", async () => {
    const { session, transport, client } = await setup();
    const body = { name: "Arroz", price_cents: 250_000 };
    const command = client.prepareWrite("POST", "/v1/products", body);
    body.name = "Changed after submission";
    transport.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(client.execute(command, parseResult)).rejects.toThrow(OfflineError);
    expect(session.getSnapshot().status).toBe("offline");
    await session.check();
    await expect(client.execute(command, parseResult)).resolves.toEqual({ ok: true });
    expect(transport).toHaveBeenCalledTimes(2);
    for (const [, request] of transport.mock.calls) {
      expect(request?.headers).toMatchObject({ "Idempotency-Key": "fixed-request-key" });
      expect(JSON.parse(request?.body as string).name).toBe("Arroz");
      expect(request?.cache).toBe("no-store");
      expect(request?.redirect).toBe("error");
    }
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)("adds Idempotency-Key to %s", async (method) => {
    const { transport, client } = await setup();
    await client.execute(client.prepareWrite(method, "/v1/products/1", {}), parseResult);
    expect(transport.mock.calls[0]?.[1]?.headers).toMatchObject({ "Idempotency-Key": "fixed-request-key" });
  });

  it("does not mistake authorization errors for network loss", async () => {
    const { session, transport, client } = await setup();
    transport.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(client.read("/v1/products", parseResult)).rejects.toThrow(HttpError);
    expect(session.getSnapshot().status).toBe("online");
  });

  it("fails closed when the backend is unavailable", async () => {
    const { session, transport, client } = await setup();
    transport.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(client.read("/v1/products", parseResult)).rejects.toThrow(HttpError);
    expect(session.getSnapshot().status).toBe("offline");
  });

  it("rejects invalid response data without presenting it as a connectivity failure", async () => {
    const { session, transport, client } = await setup();
    transport.mockResolvedValueOnce(Response.json({ ok: "not a boolean" }));
    await expect(client.read("/v1/products", parseResult)).rejects.toThrow("Invalid server response");
    expect(session.getSnapshot().status).toBe("online");
  });

  it("does not confuse a TypeError in a response parser with network loss", async () => {
    const { session, client } = await setup();
    await expect(client.read("/v1/products", () => { throw new TypeError("Invalid type"); })).rejects.toThrow("Invalid type");
    expect(session.getSnapshot().status).toBe("online");
  });

  it("supports empty successful deletion responses", async () => {
    const { transport, client } = await setup();
    transport.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(client.execute(client.prepareWrite("DELETE", "/v1/products/1"), (data) => data)).resolves.toBeUndefined();
  });

  it("disposes pending requests without invalidating the shared session", async () => {
    const { session, transport, client } = await setup();
    transport.mockImplementation(() => new Promise(() => {}));
    const rejected = expect(client.read("/v1/products", parseResult)).rejects.toThrow(OfflineError);
    client.dispose();
    await rejected;
    expect(session.getSnapshot().status).toBe("online");
    expect(() => client.prepareWrite("POST", "/v1/products")).toThrow("disposed");
  });

  it("blocks absolute URLs, scheme-relative URLs and backslashes", async () => {
    const { transport, client } = await setup();
    for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "/v1\r\nproducts"]) {
      await expect(client.read(path, parseResult)).rejects.toThrow("API path");
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it("times out a stalled probe without requiring transport cancellation support", async () => {
    vi.useFakeTimers();
    const session = new OnlineSession(() => new Promise(() => {}));
    const pending = session.check();
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    expect(session.getSnapshot().status).toBe("offline");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a stalled request and blocks further writes", async () => {
    vi.useFakeTimers();
    const { session, transport, client } = await setup();
    transport.mockImplementation(() => new Promise(() => {}));
    const rejected = expect(client.read("/v1/products", parseResult)).rejects.toThrow(OfflineError);
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(session.getSnapshot().status).toBe("offline");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("checks periodically without invalidating valid in-flight requests, and stops cleanly", async () => {
    vi.useFakeTimers();
    const { session, probe } = await setup();
    const revision = session.getSnapshot().revision;
    session.start();
    session.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(probe).toHaveBeenCalledTimes(4);
    expect(session.assertOnline(revision)).toBe(revision);
    session.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("HU-096: native device lifecycle", () => {
  function device() {
    let onNetwork!: (state: DeviceNetworkState) => void;
    let onAppState!: (state: string) => void;
    const removeNetwork = vi.fn();
    const removeApp = vi.fn();
    const signals: DeviceSignals = {
      currentAppState: "active",
      readNetworkState: vi.fn(async () => ({ isConnected: true })),
      onNetworkChange: (listener) => { onNetwork = listener; return removeNetwork; },
      onAppStateChange: (listener) => { onAppState = listener; return removeApp; }
    };
    return { signals, network: (state: DeviceNetworkState) => onNetwork(state), appState: (state: string) => onAppState(state), removeNetwork, removeApp };
  }

  it("blocks immediately when native connectivity reports a loss and cleans up listeners", async () => {
    vi.useFakeTimers();
    const { session } = await setup();
    const deviceSignals = device();
    const unbind = bindDeviceConnectivity(session, deviceSignals.signals);
    await vi.advanceTimersByTimeAsync(0);
    deviceSignals.network({ isConnected: false });
    expect(session.getSnapshot().status).toBe("offline");
    unbind();
    expect(deviceSignals.removeNetwork).toHaveBeenCalledOnce();
    expect(deviceSignals.removeApp).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops stale state when backgrounded and checks afresh on resume", async () => {
    vi.useFakeTimers();
    const { session, probe } = await setup();
    const deviceSignals = device();
    const unbind = bindDeviceConnectivity(session, deviceSignals.signals);
    await vi.advanceTimersByTimeAsync(0);
    deviceSignals.appState("background");
    expect(session.getSnapshot().status).toBe("offline");
    const calls = probe.mock.calls.length;
    deviceSignals.network({ isConnected: true });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(probe).toHaveBeenCalledTimes(calls);
    deviceSignals.appState("active");
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().status).toBe("online");
    unbind();
  });

  it("cannot resume via polling, retry or foreground while the device still reports no network", async () => {
    vi.useFakeTimers();
    const { session, probe } = await setup();
    const deviceSignals = device();
    const unbind = bindDeviceConnectivity(session, deviceSignals.signals);
    await vi.advanceTimersByTimeAsync(0);
    deviceSignals.network({ isConnected: false });
    const calls = probe.mock.calls.length;
    deviceSignals.appState("background");
    deviceSignals.appState("active");
    await session.check();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(session.getSnapshot().status).toBe("offline");
    expect(probe).toHaveBeenCalledTimes(calls);
    deviceSignals.network({ isConnected: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().status).toBe("online");
    unbind();
  });

  it("ignores an old initial device reading after a newer network event", async () => {
    vi.useFakeTimers();
    const { session } = await setup();
    const deviceSignals = device();
    let resolveInitial!: (state: DeviceNetworkState) => void;
    deviceSignals.signals.readNetworkState = () => new Promise((resolve) => { resolveInitial = resolve; });
    const unbind = bindDeviceConnectivity(session, deviceSignals.signals);
    await vi.advanceTimersByTimeAsync(0);
    deviceSignals.network({ isConnected: false });
    resolveInitial({ isConnected: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().status).toBe("offline");
    unbind();
  });
});