//! Paridad con el motor TypeScript (HU-475): ambos deben dar exactamente los mismos totales.

use std::{error::Error, fs, path::PathBuf};

use serde::Deserialize;
use tiendita_pos_core::domain::{
    calculate_cart_totals, CalculatedCartTotals, CartCalculationInput,
};

#[derive(Deserialize)]
struct GoldenCase {
    id: String,
    input: CartCalculationInput,
    expected: CalculatedCartTotals,
}

#[test]
fn matches_every_shared_golden_case() -> Result<(), Box<dyn Error>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/tax-engine/golden-cases.json");
    let cases: Vec<GoldenCase> = serde_json::from_str(&fs::read_to_string(path)?)?;
    assert!(
        cases.len() >= 245,
        "golden set shrank to {} cases",
        cases.len()
    );

    for case in &cases {
        let actual =
            calculate_cart_totals(&case.input).map_err(|e| format!("{}: {e:?}", case.id))?;
        assert_eq!(actual, case.expected, "{}", case.id);
    }
    Ok(())
}
