use serde::{Deserialize, Serialize};

pub const TIENDITA_HW_SALT: &str = "TIENDITA_HW_SALT_COLOMBIA_2026_EDICION_LOCAL";

/// HU-307: Estructura de 5 componentes de hardware para Windows
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HardwareFingerprint {
    pub cpu_id_hash: String,
    pub baseboard_serial_hash: String,
    pub disk_serial_hash: String,
    pub machine_guid_hash: String,
    pub mac_address_hash: String,
}

impl HardwareFingerprint {
    pub fn compute_dummy_for_testing(prefix: &str) -> Self {
        Self {
            cpu_id_hash: format!("{}_cpu_sha256", prefix),
            baseboard_serial_hash: format!("{}_baseboard_sha256", prefix),
            disk_serial_hash: format!("{}_disk_sha256", prefix),
            machine_guid_hash: format!("{}_guid_sha256", prefix),
            mac_address_hash: format!("{}_mac_sha256", prefix),
        }
    }

    /// HU-123: Compara dos huellas y cuenta cuántos de los 5 componentes coinciden
    pub fn count_matching_components(&self, other: &HardwareFingerprint) -> usize {
        let mut matches = 0;
        if self.cpu_id_hash == other.cpu_id_hash {
            matches += 1;
        }
        if self.baseboard_serial_hash == other.baseboard_serial_hash {
            matches += 1;
        }
        if self.disk_serial_hash == other.disk_serial_hash {
            matches += 1;
        }
        if self.machine_guid_hash == other.machine_guid_hash {
            matches += 1;
        }
        if self.mac_address_hash == other.mac_address_hash {
            matches += 1;
        }
        matches
    }

    /// HU-123: Regla de tolerancia: al menos 3 de 5 componentes deben coincidir
    pub fn is_hardware_match_valid(&self, other: &HardwareFingerprint) -> bool {
        self.count_matching_components(other) >= 3
    }
}

/// HU-120 & HU-310: Generador y validador de código de recuperación de 16 caracteres
pub struct RecoveryCodeManager;

impl RecoveryCodeManager {
    /// Alfabeto base32 sin caracteres confusos (sin 0, O, 1, I, L)
    const CHARSET: &'static [u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZ";

    pub fn format_code(raw_16_chars: &str) -> String {
        let clean: String = raw_16_chars
            .chars()
            .filter(|c| c.is_alphanumeric())
            .collect();
        if clean.len() != 16 {
            return raw_16_chars.to_string();
        }
        format!(
            "{}-{}-{}-{}",
            &clean[0..4],
            &clean[4..8],
            &clean[8..12],
            &clean[12..16]
        )
    }

    pub fn validate_format(code: &str) -> bool {
        let clean: String = code
            .chars()
            .filter(|c| c.is_alphanumeric())
            .map(|c| c.to_ascii_uppercase())
            .collect();
        if clean.len() != 16 {
            return false;
        }
        clean.bytes().all(|b| Self::CHARSET.contains(&b))
    }
}

/// HU-121..HU-123: Licencia de la Edición Local
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LocalEditionKind {
    #[allow(non_camel_case_types)]
    LOCAL_ESENCIAL,
    #[allow(non_camel_case_types)]
    LOCAL_PLUS,
    TRIAL,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalLicense {
    pub license_id: String,
    pub edition: LocalEditionKind,
    pub business_name: String,
    pub owner_doc: String,
    pub fingerprint: HardwareFingerprint,
    pub signature: String,
    pub updates_until_ms: i64,
    pub trial_started_at_ms: Option<i64>,
}

impl LocalLicense {
    /// HU-123: Verificación offline de licencia
    pub fn verify_offline(
        &self,
        current_hw: &HardwareFingerprint,
        now_ms: i64,
    ) -> Result<usize, &'static str> {
        // En modo TRIAL: 15 días desde trial_started_at_ms
        if self.edition == LocalEditionKind::TRIAL {
            if let Some(start) = self.trial_started_at_ms {
                let duration_ms = now_ms - start;
                let fifteen_days_ms = 15 * 86_400_000;
                if duration_ms > fifteen_days_ms {
                    return Err("TRIAL_EXPIRED");
                }
            } else {
                return Err("TRIAL_INVALID");
            }
        }

        // Verificar tolerancia de huella de hardware (>= 3 de 5)
        let matches = self.fingerprint.count_matching_components(current_hw);
        if matches < 3 {
            return Err("HARDWARE_MISMATCH_LESS_THAN_3_COMPONENTS");
        }

        Ok(matches)
    }
}

/// HU-125 & HU-313: Manifiesto del respaldo `.tdbak` cifrado
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TdbakManifest {
    pub format_version: u32, // Version 1
    pub backup_id: String,
    pub license_id: String,
    pub business_name: String,
    pub kind: String, // AUTO_SHIFT | AUTO_DAILY | MANUAL | TRANSFER
    pub created_at_ms: i64,
    pub counts: TdbakEntityCounts,
    pub sha256_checksum: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TdbakEntityCounts {
    pub products_count: usize,
    pub customers_count: usize,
    pub sales_count: usize,
    pub last_sale_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[allow(non_camel_case_types)]
pub enum DeviceTransferState {
    NORMAL,
    PENDING_RELEASE,
    TRANSFERRED,
}
