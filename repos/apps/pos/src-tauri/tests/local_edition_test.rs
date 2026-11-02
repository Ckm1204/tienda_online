use tiendita_pos_core::local_edition::{
    HardwareFingerprint, LocalEditionKind, LocalLicense, RecoveryCodeManager, TdbakEntityCounts,
    TdbakManifest,
};

#[test]
fn test_hardware_fingerprint_tolerance_rule_3_of_5() {
    let original = HardwareFingerprint {
        cpu_id_hash: "hash_cpu_1".to_string(),
        baseboard_serial_hash: "hash_base_1".to_string(),
        disk_serial_hash: "hash_disk_1".to_string(),
        machine_guid_hash: "hash_guid_1".to_string(),
        mac_address_hash: "hash_mac_1".to_string(),
    };

    // Mismo equipo: 5/5
    assert_eq!(original.count_matching_components(&original), 5);
    assert!(original.is_hardware_match_valid(&original));

    // Cambio de disco y tarjeta de red (3/5 coincidentes: CPU, Baseboard, GUID) -> ACEPTADO
    let upgraded_pc = HardwareFingerprint {
        cpu_id_hash: "hash_cpu_1".to_string(),
        baseboard_serial_hash: "hash_base_1".to_string(),
        disk_serial_hash: "hash_disk_NEW".to_string(),
        machine_guid_hash: "hash_guid_1".to_string(),
        mac_address_hash: "hash_mac_NEW".to_string(),
    };
    assert_eq!(original.count_matching_components(&upgraded_pc), 3);
    assert!(original.is_hardware_match_valid(&upgraded_pc));

    // Equipo completamente distinto (1/5 coincidente) -> RECHAZADO
    let different_pc = HardwareFingerprint {
        cpu_id_hash: "hash_cpu_DIFFERENT".to_string(),
        baseboard_serial_hash: "hash_base_DIFFERENT".to_string(),
        disk_serial_hash: "hash_disk_DIFFERENT".to_string(),
        machine_guid_hash: "hash_guid_1".to_string(),
        mac_address_hash: "hash_mac_DIFFERENT".to_string(),
    };
    assert_eq!(original.count_matching_components(&different_pc), 1);
    assert!(!original.is_hardware_match_valid(&different_pc));
}

#[test]
fn test_recovery_code_format_and_validation() {
    // Código válido base32 de 16 caracteres
    let valid_raw = "23456789ABCDEFGH";
    let formatted = RecoveryCodeManager::format_code(valid_raw);
    assert_eq!(formatted, "2345-6789-ABCD-EFGH");
    assert!(RecoveryCodeManager::validate_format(&formatted));

    // Código inválido con caracteres prohibidos (0, O, I, L)
    assert!(!RecoveryCodeManager::validate_format("0000-OOOO-IIII-LLLL"));
    assert!(!RecoveryCodeManager::validate_format("SHORT-CODE"));
}

#[test]
fn test_local_license_trial_expiry() {
    let hw = HardwareFingerprint::compute_dummy_for_testing("store1");
    let now = 100_000_000;

    let trial_license = LocalLicense {
        license_id: "LIC-TRIAL-001".to_string(),
        edition: LocalEditionKind::TRIAL,
        business_name: "Tienda Local Prueba".to_string(),
        owner_doc: "12345678".to_string(),
        fingerprint: hw.clone(),
        signature: "ed25519_sig".to_string(),
        updates_until_ms: now + 365 * 86_400_000,
        trial_started_at_ms: Some(now),
    };

    // Día 5 de prueba (5 días < 15 días) -> Válido
    let res_ok = trial_license.verify_offline(&hw, now + 5 * 86_400_000);
    assert!(res_ok.is_ok());

    // Día 16 de prueba (16 días > 15 días) -> Expirado
    let res_expired = trial_license.verify_offline(&hw, now + 16 * 86_400_000);
    assert_eq!(res_expired, Err("TRIAL_EXPIRED"));
}

#[test]
fn test_tdbak_manifest_serialization() {
    let manifest = TdbakManifest {
        format_version: 1,
        backup_id: "tdbak-uuid-123".to_string(),
        license_id: "LIC-LOCAL-ESENCIAL-01".to_string(),
        business_name: "Granero Central".to_string(),
        kind: "AUTO_SHIFT".to_string(),
        created_at_ms: 1730000000000,
        counts: TdbakEntityCounts {
            products_count: 850,
            customers_count: 42,
            sales_count: 1205,
            last_sale_at_ms: Some(1730000000000),
        },
        sha256_checksum: "a".repeat(64),
    };

    let serialized = serde_json::to_string(&manifest).expect("json serialize");
    let deserialized: TdbakManifest = serde_json::from_str(&serialized).expect("json deserialize");
    assert_eq!(manifest, deserialized);
}
