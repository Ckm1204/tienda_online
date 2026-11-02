import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { AppUpdater, UpdateManifest } from "../security/updater.js";

describe("HU-134: Auto-actualizador firmado y bloqueo con turno abierto", () => {
  it("Verifica firma Ed25519 e impide actualizar si hay turno abierto", () => {
    // Generar par de llaves Ed25519 para simular la firma de release
    const keyPair = crypto.generateKeyPairSync("ed25519");
    const pubKeySpki = keyPair.publicKey.export({ type: "spki", format: "der" }).toString("base64");

    const updater = new AppUpdater("1.4.0", pubKeySpki);

    const manifestData = {
      version: "1.5.0",
      channel: "stable" as const,
      release_date: "2026-11-02",
      download_url: "https://releases.tienditaonline.co/win-x64/Tiendita-1.5.0.msi",
      sha256_checksum: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"
    };

    const payload = `${manifestData.version}:${manifestData.channel}:${manifestData.release_date}:${manifestData.sha256_checksum}`;
    const signature = crypto.sign(null, Buffer.from(payload, "utf8"), keyPair.privateKey).toString("base64");

    const validManifest: UpdateManifest = {
      ...manifestData,
      signature_ed25519_b64: signature
    };

    // Verificación de firma válida
    expect(updater.verifyUpdateManifest(validManifest)).toBe(true);

    // Turno abierto: bloquea la aplicación de la actualización
    const withOpenShift = updater.canApplyUpdate(true);
    expect(withOpenShift.canApply).toBe(false);
    expect(withOpenShift.reason).toContain("Hay un turno de caja abierto");

    // Turno cerrado: autoriza la instalación
    const withClosedShift = updater.canApplyUpdate(false);
    expect(withClosedShift.canApply).toBe(true);
  });
});
