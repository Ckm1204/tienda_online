import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Text, TextInput, View } from "react-native";
import { OnlineGate } from "../components/OnlineGate";
import { OnlineSession } from "../network/online-session";

vi.mock("expo-network", () => ({
  getNetworkStateAsync: vi.fn(async () => ({ isConnected: true })),
  addNetworkStateListener: vi.fn((listener: (state: { isConnected: boolean }) => void) => {
    const offline = () => listener({ isConnected: false });
    const online = () => listener({ isConnected: true });
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return { remove: () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    } };
  })
}));

vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/wifi-off", () => ({ default: () => null }));

afterEach(cleanup);

function SensitiveForm() {
  return <View><Text>Saldo privado</Text><TextInput accessibilityLabel="Nombre del producto" defaultValue="Arroz" /></View>;
}

describe("HU-096: the global gate removes private content and editable forms", () => {
  it("blocks all content when the server cannot be reached", async () => {
    const session = new OnlineSession(async () => false);
    render(<OnlineGate session={session}><SensitiveForm /></OnlineGate>);
    await screen.findByText("Sin conexion a internet");
    expect(screen.queryByText("Saldo privado")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("unmounts the form on loss of connectivity and remounts without the old draft", async () => {
    const session = new OnlineSession(async () => true);
    render(<OnlineGate session={session}><SensitiveForm /></OnlineGate>);
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Obsolete draft" } });
    expect((input as HTMLInputElement).value).toBe("Obsolete draft");
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.queryByText("Saldo privado")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    act(() => window.dispatchEvent(new Event("online")));
    const freshInput = await screen.findByRole("textbox");
    expect((freshInput as HTMLInputElement).value).toBe("Arroz");
  });

  it("does not unlock on an online event when the backend still fails", async () => {
    const probe = vi.fn(async () => true);
    const session = new OnlineSession(probe);
    render(<OnlineGate session={session}><SensitiveForm /></OnlineGate>);
    await screen.findByRole("textbox");
    probe.mockResolvedValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    act(() => window.dispatchEvent(new Event("online")));
    await screen.findByText("Sin conexion a internet");
    expect(screen.queryByRole("textbox")).toBeNull();
    probe.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar conexion" }));
    await screen.findByRole("textbox");
  });

  it("keeps retry disabled while a reachability check is pending", async () => {
    const probe = vi.fn<() => Promise<boolean>>(async () => false);
    const session = new OnlineSession(probe);
    render(<OnlineGate session={session}><SensitiveForm /></OnlineGate>);
    await screen.findByText("Sin conexion a internet");
    let resolveProbe!: (reachable: boolean) => void;
    probe.mockImplementation(() => new Promise((resolve) => { resolveProbe = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar conexion" }));
    await waitFor(() => expect(screen.getByRole("button").getAttribute("aria-disabled")).toBe("true"));
    await act(async () => resolveProbe(true));
    await screen.findByRole("textbox");
  });
});