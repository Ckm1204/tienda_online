use serde::{Deserialize, Serialize};

/// HU-048 & HU-344: Ancho de papel térmico ESC/POS estándar en Colombia
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PaperWidth {
    Width58mm, // 32 columnas
    Width80mm, // 48 columnas
}

impl PaperWidth {
    pub const fn columns(&self) -> usize {
        match self {
            Self::Width58mm => 32,
            Self::Width80mm => 48,
        }
    }
}

/// HU-474: Sanitizador de cadenas de texto para impresoras térmicas ESC/POS.
/// Elimina secuencias de escape no autorizadas (\x1B, \x1D) y caracteres de control (0x00..=0x1F, 0x7F)
/// para prevenir ataques de inyección de comandos en periféricos físicos de mostrador.
pub fn sanitize_escpos_text(input: &str) -> String {
    let mut clean = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '\x1B' || c == '\x1D' {
            // Omitir byte siguiente si es un modificador de comando ESC/GS
            let _ = chars.next();
            continue;
        }
        let u = c as u32;
        if (u < 0x20 && c != '\n') || u == 0x7F {
            continue;
        }
        clean.push(c);
    }
    clean.trim().to_string()
}

/// HU-344: Formateador de dos columnas de ancho fijo (Descripción izquierda, Monto derecha)
/// con partición inteligente de palabras sin truncar el valor monetario.
pub fn format_two_columns(left_raw: &str, right_raw: &str, cols: usize) -> Vec<String> {
    let left = sanitize_escpos_text(left_raw);
    let right = sanitize_escpos_text(right_raw);
    let right_len = right.chars().count();

    if cols <= right_len + 2 {
        return vec![left, right];
    }

    let max_left_first = cols - right_len - 1;
    let left_len = left.chars().count();

    if left_len <= max_left_first {
        let spaces_count = cols - left_len - right_len;
        let spaces = " ".repeat(spaces_count);
        return vec![format!("{}{}{}", left, spaces, right)];
    }

    // Partir en palabras
    let words: Vec<&str> = left.split_whitespace().collect();
    let mut wrapped: Vec<String> = Vec::new();
    let mut current = String::new();

    for word in words {
        let candidate = if current.is_empty() {
            word.to_string()
        } else {
            format!("{} {}", current, word)
        };

        if candidate.chars().count() <= cols {
            current = candidate;
        } else {
            if !current.is_empty() {
                wrapped.push(current);
            }
            current = word.to_string();
        }
    }

    if !current.is_empty() {
        wrapped.push(current);
    }

    if let Some(last) = wrapped.last_mut() {
        let last_len = last.chars().count();
        if last_len <= max_left_first {
            let spaces = " ".repeat(cols - last_len - right_len);
            *last = format!("{}{}{}", last, spaces, right);
        } else {
            let spaces = " ".repeat(cols - right_len);
            wrapped.push(format!("{}{}", spaces, right));
        }
    } else {
        wrapped.push(right);
    }

    wrapped
}

/// HU-051 & HU-453: Comandos de apertura de cajón monedero electrónico (pulso 24V / 12V RJ11 o USB Serial)
pub struct CashDrawerCommands;

impl CashDrawerCommands {
    /// Pulso ESC/POS estándar (ESC p m t1 t2) para abrir el cajón a través del puerto RJ11 de la impresora térmica
    /// m: pin (0 = pin 2, 1 = pin 5)
    /// t1: pulso encendido = 25 * 2ms = 50ms
    /// t2: pulso apagado = 250 * 2ms = 500ms
    pub const fn rj11_pulse(pin: u8) -> [u8; 5] {
        [0x1B, 0x70, pin, 0x19, 0xFA]
    }

    /// Secuencia DTR/RTS o byte directo para disparadores de cajón USB-Serial / COM
    pub const fn serial_kick_byte() -> [u8; 1] {
        [0x07] // BEL / kick pulse
    }
}

/// HU-048, HU-049, HU-344, HU-349: Generador de bytes ESC/POS de bajo nivel para recibos térmicos
pub struct EscPosTicketGenerator {
    buffer: Vec<u8>,
    width: PaperWidth,
}

impl EscPosTicketGenerator {
    pub fn new(width: PaperWidth) -> Self {
        let mut gen = Self {
            buffer: Vec::with_capacity(512),
            width,
        };
        gen.init_printer();
        gen
    }

    /// Inicializar impresora: ESC @
    pub fn init_printer(&mut self) -> &mut Self {
        self.buffer.extend_from_slice(&[0x1B, 0x40]);
        self
    }

    /// Alineación: ESC a n (0=Izquierda, 1=Centro, 2=Derecha)
    pub fn set_alignment(&mut self, align: u8) -> &mut Self {
        self.buffer.extend_from_slice(&[0x1B, 0x61, align]);
        self
    }

    /// Negrita: ESC E n (1=Activar, 0=Desactivar)
    pub fn set_bold(&mut self, bold: bool) -> &mut Self {
        self.buffer.extend_from_slice(&[0x1B, 0x45, if bold { 1 } else { 0 }]);
        self
    }

    /// Texto con salto de línea
    pub fn add_line(&mut self, text: &str) -> &mut Self {
        let clean = sanitize_escpos_text(text);
        self.buffer.extend_from_slice(clean.as_bytes());
        self.buffer.push(b'\n');
        self
    }

    /// Renglón de dos columnas (Izquierda - Derecha) adaptado al ancho de columnas
    pub fn add_two_columns(&mut self, left: &str, right: &str) -> &mut Self {
        let lines = format_two_columns(left, right, self.width.columns());
        for line in lines {
            self.buffer.extend_from_slice(line.as_bytes());
            self.buffer.push(b'\n');
        }
        self
    }

    /// Línea separadora continua (ej. '--------------------------------')
    pub fn add_separator(&mut self) -> &mut Self {
        let sep = "-".repeat(self.width.columns());
        self.buffer.extend_from_slice(sep.as_bytes());
        self.buffer.push(b'\n');
        self
    }

    /// HU-137: Inyección de código QR nativo ESC/POS (GS ( k) para CUDE DIAN
    pub fn add_qr_code(&mut self, payload: &str) -> Result<&mut Self, &'static str> {
        let clean = sanitize_escpos_text(payload);
        let len = clean.len() + 3;
        if len > 7090 {
            return Err("QR_PAYLOAD_TOO_LARGE");
        }
        let p_l = (len & 0xFF) as u8;
        let p_h = ((len >> 8) & 0xFF) as u8;

        // 1. Modelo 2 de QR: GS ( k 4 0 49 65 50 0
        self.buffer.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
        // 2. Tamaño del módulo (6 dots): GS ( k 3 0 49 67 6
        self.buffer.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06]);
        // 3. Nivel de corrección de error M: GS ( k 3 0 49 69 49
        self.buffer.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31]);
        // 4. Almacenar datos en buffer de la impresora: GS ( k pL pH 49 80 48 <data>
        self.buffer.extend_from_slice(&[0x1D, 0x28, 0x6B, p_l, p_h, 0x31, 0x50, 0x30]);
        self.buffer.extend_from_slice(clean.as_bytes());
        // 5. Imprimir QR: GS ( k 3 0 49 81 48
        self.buffer.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]);
        self.buffer.push(b'\n');

        Ok(self)
    }

    /// Avance de papel y corte de guillotina: GS V m n
    pub fn cut_paper(&mut self, partial: bool) -> &mut Self {
        // Avance de 3 líneas para que el texto pase la cuchilla
        self.buffer.extend_from_slice(b"\n\n\n");
        let mode = if partial { 0x41 } else { 0x42 };
        self.buffer.extend_from_slice(&[0x1D, 0x56, mode, 0x00]);
        self
    }

    /// Disparar pulso de apertura de cajón
    pub fn open_drawer(&mut self) -> &mut Self {
        let pulse = CashDrawerCommands::rj11_pulse(0);
        self.buffer.extend_from_slice(&pulse);
        self
    }

    /// Obtener los bytes compilados
    pub fn into_bytes(self) -> Vec<u8> {
        self.buffer
    }
}
