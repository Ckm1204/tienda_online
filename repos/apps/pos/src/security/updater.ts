import crypto from "node:crypto";

/**
 * HU-134: Auto-actualizador firmado (Ed25519 + Authenticode) de la App Instalable
 * con canales beta/stable y bloqueo de actualización si hay un turno abierto.
 */

export interface UpdateManifest {
  version: string;
  channel: "beta" | "stable";
  release_date: string;
  download_url: string;
  sha256_checksum: string;
  signature_ed25519_b64: string;
}

export class AppUpdater {
  public downloadedUpdate: UpdateManifest | null = null;
  public updateVerified = false;

  constructor(
    public readonly currentVersion: string,
    public readonly trustedPublicKeySpkiB64: string
  ) {}

  /**
   * Verifica la firma Ed25519 del manifiesto de actualización
   */
  public verifyUpdateManifest(manifest: UpdateManifest): boolean {
    const payload = `${manifest.version}:${manifest.channel}:${manifest.release_date}:${manifest.sha256_checksum}`;
    const pubKey = crypto.createPublicKey({
      key: Buffer.from(this.trustedPublicKeySpkiB64, "base64"),
      format: "der",
      type: "spki"
    });

    const isSigValid = crypto.verify(
      null,
      Buffer.from(payload, "utf8"),
      pubKey,
      Buffer.from(manifest.signature_ed25519_b64, "base64")
    );

    if (!isSigValid) {
      throw new Error("403 INVALID_UPDATE_SIGNATURE: El paquete de actualización no está firmado por TienditaOnline");
    }

    this.downloadedUpdate = manifest;
    this.updateVerified = true;
    return true;
  }

  /**
   * Bloqueo estricto: Si la caja tiene un turno abierto (hasOpenShift = true),
   * no se permite instalar la actualización para no interrumpir el cobro.
   */
  public canApplyUpdate(hasOpenShift: boolean): { canApply: boolean; reason?: string } {
    if (!this.updateVerified || !this.downloadedUpdate) {
      return { canApply: false, reason: "No hay actualización verificada lista para aplicar" };
    }
    if (hasOpenShift) {
      return {
        canApply: false,
        reason: "Hay un turno de caja abierto. Debe realizar el cierre y arqueo de turno antes de reiniciar para actualizar."
      };
    }
    return { canApply: true };
  }
}
