use tiendita_pos_core::peripherals::{
    format_two_columns, sanitize_escpos_text, CashDrawerCommands, EscPosTicketGenerator,
    PaperWidth,
};

#[test]
fn test_sanitize_escpos_text_strips_control_codes_and_injections() {
    // Intento de inyectar comando de corte de papel (\x1DV\x42\x00) y pulso de cajón (\x1Bp\x00)
    let dirty = "Leche Entera 1L\x1DV\x42\x00\x07 Promo\x1Bp\x00 Especial \x1F\x7F";
    let cleaned = sanitize_escpos_text(dirty);

    // No debe contener caracteres de control ni secuencias \x1B / \x1D
    assert!(!cleaned.contains('\x1B'));
    assert!(!cleaned.contains('\x1D'));
    assert!(!cleaned.contains('\x07'));
    assert!(!cleaned.contains('\x1F'));
    assert!(!cleaned.contains('\x7F'));
    assert!(cleaned.contains("Leche Entera 1L"));
    assert!(cleaned.contains("Promo"));
    assert!(cleaned.contains("Especial"));
}

#[test]
fn test_two_columns_formatting_58mm_32cols() {
    let cols = PaperWidth::Width58mm.columns();
    assert_eq!(cols, 32);

    // Caso 1: Renglón corto que cabe en una sola línea
    let lines_short = format_two_columns("Arroz Diana 1kg", "$4.200", cols);
    assert_eq!(lines_short.len(), 1);
    let line1 = &lines_short[0];
    assert_eq!(line1.chars().count(), 32);
    assert!(line1.starts_with("Arroz Diana 1kg"));
    assert!(line1.ends_with("$4.200"));

    // Caso 2: Nombre largo que se debe partir en múltiples líneas sin que el monto se desplace
    let long_item = "Aceite Vegetal Gourmet Botella Familiar 3000ml";
    let lines_long = format_two_columns(long_item, "$38.500", cols);
    assert!(lines_long.len() > 1);

    // Cada línea no debe exceder los 32 caracteres
    for l in &lines_long {
        assert!(l.chars().count() <= 32);
    }
    // La última línea debe terminar con el monto alineado a la derecha
    let last = &lines_long[lines_long.len() - 1];
    assert!(last.ends_with("$38.500"));
}

#[test]
fn test_two_columns_formatting_80mm_48cols() {
    let cols = PaperWidth::Width80mm.columns();
    assert_eq!(cols, 48);

    let lines = format_two_columns("Chocolate Corona Tradicional 500g", "$12.900", cols);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].chars().count(), 48);
    assert!(lines[0].starts_with("Chocolate Corona"));
    assert!(lines[0].ends_with("$12.900"));
}

#[test]
fn test_cash_drawer_pulse_and_paper_cut_bytes() {
    let pulse_pin0 = CashDrawerCommands::rj11_pulse(0);
    assert_eq!(pulse_pin0, [0x1B, 0x70, 0x00, 0x19, 0xFA]);

    let pulse_pin1 = CashDrawerCommands::rj11_pulse(1);
    assert_eq!(pulse_pin1, [0x1B, 0x70, 0x01, 0x19, 0xFA]);

    let kick_serial = CashDrawerCommands::serial_kick_byte();
    assert_eq!(kick_serial, [0x07]);
}

#[test]
fn test_escpos_ticket_generator_full_pipeline() {
    let mut gen = EscPosTicketGenerator::new(PaperWidth::Width58mm);
    gen.set_alignment(1)
        .set_bold(true)
        .add_line("TIENDA LA GRAN ESQUINA")
        .set_bold(false)
        .add_line("NIT: 900.123.456-7")
        .add_line("Carrera 7 # 45-12, Bogota")
        .set_alignment(0)
        .add_separator()
        .add_two_columns("Gaseosa Postobon 1.5L", "$4.500")
        .add_two_columns("Papas Margarita Pollo", "$2.800")
        .add_separator()
        .set_bold(true)
        .add_two_columns("TOTAL COP", "$7.300")
        .set_bold(false);

    let qr_url = "https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=cude123";
    let qr_res = gen.add_qr_code(qr_url);
    assert!(qr_res.is_ok());

    gen.open_drawer().cut_paper(false);

    let bytes = gen.into_bytes();
    assert!(!bytes.is_empty());

    // Validar inicio de inicialización ESC @
    assert_eq!(bytes[0..2], [0x1B, 0x40]);

    // Validar presencia de texto
    let as_str = String::from_utf8_lossy(&bytes);
    assert!(as_str.contains("TIENDA LA GRAN ESQUINA"));
    assert!(as_str.contains("Gaseosa Postobon"));
    assert!(as_str.contains("TOTAL COP"));

    // Validar presencia del comando de corte al final
    let len = bytes.len();
    assert_eq!(&bytes[len - 4..len], &[0x1D, 0x56, 0x42, 0x00]);
}
