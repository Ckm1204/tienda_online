import { OnlineSession } from "./online-session";

export interface DeviceNetworkState {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}

export interface DeviceSignals {
  currentAppState: string | null;
  readNetworkState(): Promise<DeviceNetworkState>;
  onNetworkChange(listener: (state: DeviceNetworkState) => void): () => void;
  onAppStateChange(listener: (state: string) => void): () => void;
}

export function bindDeviceConnectivity(session: OnlineSession, signals: DeviceSignals): () => void {
  let active = signals.currentAppState === null || signals.currentAppState === "active";
  let disposed = false;
  let networkChanges = 0;
  let networkAvailable = true;

  const reconcile = () => {
    if (disposed) return;
    if (active && networkAvailable) {
      session.start();
      void session.check();
    } else {
      session.stop();
    }
  };

  const applyNetworkState = (state: DeviceNetworkState) => {
    if (disposed) return;
    networkAvailable = state.isConnected !== false && state.isInternetReachable !== false;
    reconcile();
  };

  const removeNetworkListener = signals.onNetworkChange((state) => {
    networkChanges++;
    applyNetworkState(state);
  });
  const removeAppListener = signals.onAppStateChange((state) => {
    if (disposed) return;
    active = state === "active";
    reconcile();
  });

  reconcile();

  void signals.readNetworkState().then((state) => {
    if (networkChanges === 0) applyNetworkState(state);
  }).catch(() => {
    if (!disposed && networkChanges === 0) applyNetworkState({ isConnected: false });
  });

  return () => {
    disposed = true;
    removeNetworkListener();
    removeAppListener();
    session.stop();
  };
}