use serde::{Deserialize, Serialize};

pub const MAX_QTY_MILLI: i64 = 999_999_000;
pub const MAX_UNIT_PRICE_CENTS: i64 = 99_999_999_900;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaxKind {
    PERCENT,
    #[allow(non_camel_case_types)]
    FIXED_PER_UNIT,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaxDefinition {
    pub code: String,
    pub kind: TaxKind,
    pub rate_bp: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CartLineInput {
    pub product_id: String,
    pub qty_milli: i64,
    pub unit_price_cents: i64,
    pub discount_cents: i64,
    pub taxes: Vec<TaxDefinition>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CartCalculationInput {
    pub lines: Vec<CartLineInput>,
    pub apply_cash_rounding: Option<bool>,
    pub rounding_step_cents: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CalculatedCartTotals {
    pub subtotal_cents: i64,
    pub discount_cents: i64,
    pub tax_cents: i64,
    pub rounding_cents: i64,
    pub total_cents: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaxEngineError {
    NumericRangeOverflow(&'static str),
}

fn div_round_half_up(numerator: i128, denominator: i128) -> i128 {
    (numerator + (denominator / 2)) / denominator
}

pub fn calculate_cart_totals(
    input: &CartCalculationInput,
) -> Result<CalculatedCartTotals, TaxEngineError> {
    let mut subtotal_big: i128 = 0;
    let mut discount_big: i128 = 0;
    let mut tax_big: i128 = 0;
    let mut raw_total_big: i128 = 0;

    for line in &input.lines {
        if line.qty_milli <= 0 || line.qty_milli > MAX_QTY_MILLI {
            return Err(TaxEngineError::NumericRangeOverflow(
                "qty_milli out of bounds",
            ));
        }
        if line.unit_price_cents < 0 || line.unit_price_cents > MAX_UNIT_PRICE_CENTS {
            return Err(TaxEngineError::NumericRangeOverflow(
                "unit_price_cents out of bounds",
            ));
        }
        if line.discount_cents < 0 {
            return Err(TaxEngineError::NumericRangeOverflow(
                "discount_cents must be >= 0",
            ));
        }

        let qty = i128::from(line.qty_milli);
        let price = i128::from(line.unit_price_cents);
        let gross = div_round_half_up(qty * price, 1000);
        let req_disc = i128::from(line.discount_cents);
        let disc = if req_disc > gross { gross } else { req_disc };
        let net_merch = gross - disc;

        let mut total_percent_bp: i128 = 0;
        let mut total_fixed_tax: i128 = 0;

        for t in &line.taxes {
            match t.kind {
                TaxKind::PERCENT => {
                    total_percent_bp += i128::from(t.rate_bp);
                }
                TaxKind::FIXED_PER_UNIT => {
                    total_fixed_tax += div_round_half_up(qty * i128::from(t.rate_bp), 1000);
                }
            }
        }

        let base = if total_percent_bp == 0 {
            net_merch
        } else {
            div_round_half_up(net_merch * 10_000, 10_000 + total_percent_bp)
        };

        let percent_tax = net_merch - base;
        let line_tax = percent_tax + total_fixed_tax;
        let line_total = base + line_tax;

        subtotal_big += base;
        discount_big += disc;
        tax_big += line_tax;
        raw_total_big += line_total;
    }

    let mut rounding_big: i128 = 0;
    if input.apply_cash_rounding.unwrap_or(false) && raw_total_big > 0 {
        let step = i128::from(input.rounding_step_cents.unwrap_or(5000));
        if step > 0 {
            rounding_big = -(raw_total_big % step);
        }
    }

    let final_total = raw_total_big + rounding_big;

    Ok(CalculatedCartTotals {
        subtotal_cents: subtotal_big as i64,
        discount_cents: discount_big as i64,
        tax_cents: tax_big as i64,
        rounding_cents: rounding_big as i64,
        total_cents: final_total as i64,
    })
}
