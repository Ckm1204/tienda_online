import { describe, it, expect } from "vitest";
import { DeviceService } from "../index.js";

describe("device-service: Local Edition Licensing & Activation (EP-13)", () => {
  it("HU-121: Emite serial de Edición Local guardando únicamente serial_hash y last4", () => {
    const svc = new DeviceService();
    const rec = svc.issueLocalEditionSerialKey({
      customerName: "Tienda Doña Marta",
      customerNitOrCc: "52123456",
      customerPhone: "3001234567",
      edition: "LOCAL_PLUS",
      receiptPrefix: "L01"
    });

    expect(rec.id).toMatch(/^LOC-\d{4}-\d+/);
    expect(rec.serial_key).toMatch(/^TDL-[A-F0-9]{5}-[A-F0-9]{5}-[A-F0-9]{5}-[A-F0-9]{5}$/);
    expect(rec.serial_hash).toHaveLength(64);
    expect(rec.serial_last4).toHaveLength(4);
    expect(rec.status).toBe("PENDING_ACTIVATION");
    expect(rec.updates_until_ms).toBeGreaterThan(Date.now());
    expect(rec.transfers_used).toBe(0);
  });

  it("HU-122: Activación online única con huella de 5 componentes y bloqueo ante segundo PC", () => {
    const svc = new DeviceService();
    const lic = svc.issueLocalEditionSerialKey({
      customerName: "Supermercado El Sol",
      customerNitOrCc: "900999888",
      customerPhone: "3105556677",
      edition: "LOCAL_PLUS"
    });

    const hw1: [string, string, string, string, string] = [
      "cpu_hash_1",
      "board_hash_1",
      "disk_hash_1",
      "guid_hash_1",
      "mac_hash_1"
    ];

    const act1 = svc.activateLocalEditionSerial({
      serialKey: lic.serial_key!,
      fingerprintComponents: hw1,
      devicePublicKeySpkiB64: "spki_key_1"
    });

    expect(act1.certificateToken).toBeDefined();
    expect(act1.payload.license_type).toBe("LOCAL_PERPETUAL");
    expect(act1.payload.edition).toBe("LOCAL_PLUS");

    // Intento de activar el mismo serial en un segundo PC (huella diferente: 0 de 5 coinciden)
    const hw2: [string, string, string, string, string] = [
      "cpu_hash_2",
      "board_hash_2",
      "disk_hash_2",
      "guid_hash_2",
      "mac_hash_2"
    ];

    expect(() =>
      svc.activateLocalEditionSerial({
        serialKey: lic.serial_key!,
        fingerprintComponents: hw2,
        devicePublicKeySpkiB64: "spki_key_2"
      })
    ).toThrow("409 ALREADY_ACTIVATED");

    expect(svc.localActivationAttempts.length).toBe(1);
    expect(svc.localActivationAttempts[0]?.reason).toContain("Hardware mismatch");

    // Reinstalación en el mismo PC (cambio de disco y mac, pero cpu, board y guid siguen iguales: 3 de 5)
    const hw1_modified: [string, string, string, string, string] = [
      "cpu_hash_1",
      "board_hash_1",
      "new_disk_hash",
      "guid_hash_1",
      "new_mac_hash"
    ];

    const actReinstall = svc.activateLocalEditionSerial({
      serialKey: lic.serial_key!,
      fingerprintComponents: hw1_modified,
      devicePublicKeySpkiB64: "spki_key_reinstall"
    });

    expect(actReinstall.certificateToken).toBeDefined();
  });

  it("HU-256: Modo de prueba de 15 días (una sola vez por huella de hardware)", () => {
    const svc = new DeviceService();
    const trial1 = svc.startTrial({
      machineKey: "MACHINE_ABC_123",
      devicePublicKeySpkiB64: "spki_trial_1",
      businessName: "Tienda de Prueba"
    });

    expect(trial1.certificateToken).toBeDefined();
    expect(trial1.payload.license_type).toBe("TRIAL");
    expect(trial1.payload.expires_at_ms).toBeGreaterThan(Date.now() + 14 * 86_400_000);

    // Segundo intento con la misma huella es rechazado
    expect(() =>
      svc.startTrial({
        machineKey: "MACHINE_ABC_123",
        devicePublicKeySpkiB64: "spki_trial_2",
        businessName: "Tienda Reinstalada"
      })
    ).toThrow("409 TRIAL_ALREADY_USED");
  });

  it("HU-255: Liberación por soporte de computador dañado valida tope de 2 al año", () => {
    const svc = new DeviceService();
    const lic = svc.issueLocalEditionSerialKey({
      customerName: "Don Pedro",
      customerNitOrCc: "12345678",
      customerPhone: "3158889900"
    });

    // Activar en PC 1
    svc.activateLocalEditionSerial({
      serialKey: lic.serial_key!,
      fingerprintComponents: ["c1", "b1", "d1", "g1", "m1"],
      devicePublicKeySpkiB64: "pk1"
    });

    // Primer daño de equipo -> liberación por soporte
    const rel1 = svc.releaseDamagedMachineBySupport(lic.serial_hash, "Tarjeta madre quemada");
    expect(rel1.transfers_used).toBe(1);
    expect(rel1.status).toBe("PENDING_ACTIVATION");

    // Activar en PC 2
    svc.activateLocalEditionSerial({
      serialKey: lic.serial_key!,
      fingerprintComponents: ["c2", "b2", "d2", "g2", "m2"],
      devicePublicKeySpkiB64: "pk2"
    });

    // Segundo daño de equipo -> liberación por soporte
    const rel2 = svc.releaseDamagedMachineBySupport(lic.serial_hash, "Robo comprobado con denuncia");
    expect(rel2.transfers_used).toBe(2);

    // Activar en PC 3
    svc.activateLocalEditionSerial({
      serialKey: lic.serial_key!,
      fingerprintComponents: ["c3", "b3", "d3", "g3", "m3"],
      devicePublicKeySpkiB64: "pk3"
    });

    // Tercer daño de equipo -> supera tope legal de 2
    expect(() =>
      svc.releaseDamagedMachineBySupport(lic.serial_hash, "Tercer daño en el mismo año")
    ).toThrow("403 TRANSFER_LIMIT_REACHED");
  });

  it("HU-126 & HU-407: Desactivación por cambio de equipo y actualización de licencia", () => {
    const svc = new DeviceService();
    const lic = svc.issueLocalEditionSerialKey({
      customerName: "Carnicería La Fama",
      customerNitOrCc: "800111222",
      customerPhone: "3167778899"
    });

    svc.activateLocalEditionSerial({
      serialKey: lic.serial_key!,
      fingerprintComponents: ["c1", "b1", "d1", "g1", "m1"],
      devicePublicKeySpkiB64: "pk1"
    });

    // Desactivar con hash del respaldo verificado
    const deact = svc.deactivateForTransfer({
      serialKey: lic.serial_key!,
      deactivationCertificateHash: "sha256_of_final_tdbak_manifest"
    });

    expect(deact.status).toBe("PENDING_ACTIVATION");
    expect(deact.deactivation_certificate_hash).toBe("sha256_of_final_tdbak_manifest");
    expect(deact.transfers_used).toBe(0); // Traslado voluntario no gasta transferencias de soporte

    // Reset de admin request & approval (HU-129, HU-407)
    const resetReq = svc.requestAdminReset({
      serialKey: lic.serial_key!,
      customerNitOrCc: "800111222",
      reason: "Olvidó clave de administrador y perdió papel de recuperación"
    });

    expect(resetReq.status).toBe("PENDING_APPROVAL");
    const approved = svc.approveAdminReset(resetReq.id);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approval_token).toBeDefined();
  });
});
