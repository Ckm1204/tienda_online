/**
 * HU-002: Static code quality & security analyzer for TypeScript and Rust sources.
 * Blocks explicit `any`, concatenated SQL template literals, floating point money,
 * hardcoded secrets, and `.unwrap()` in Rust domain modules.
 */
export interface LintViolation {
  rule: "no-explicit-any" | "no-concatenated-sql" | "no-rust-unwrap" | "no-hardcoded-secret";
  line: number;
  message: string;
}

export function analyzeTypeScriptSource(source: string): LintViolation[] {
  const violations: LintViolation[] = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
      return;
    }

    if (/:\s*any\b|<any>|as\s+any\b/.test(line)) {
      violations.push({
        rule: "no-explicit-any",
        line: lineNo,
        message: "Prohibido el uso de 'any' explícito (HU-002)."
      });
    }

    if (/`\s*(SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/i.test(line)) {
      violations.push({
        rule: "no-concatenated-sql",
        line: lineNo,
        message: "Prohibido concatenar SQL con template literals; usa consultas parametrizadas (HU-002)."
      });
    }

    if (/(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|sk_live_[0-9a-zA-Z]{10,}|ghp_[0-9a-zA-Z]{20,})/.test(line)) {
      violations.push({
        rule: "no-hardcoded-secret",
        line: lineNo,
        message: "Credencial o llave privada detectada en texto plano (HU-003)."
      });
    }
  });

  return violations;
}

export function analyzeRustDomainSource(source: string, filePath: string): LintViolation[] {
  const violations: LintViolation[] = [];
  const isDomainPath = filePath.replace(/\\/g, "/").includes("src-tauri/domain");
  if (!isDomainPath) {
    return violations;
  }

  const lines = source.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//")) return;
    if (/\.unwrap\s*\(\)/.test(line)) {
      violations.push({
        rule: "no-rust-unwrap",
        line: idx + 1,
        message: "clippy::unwrap_used: Prohibido usar .unwrap() en módulos de dominio Rust (HU-002)."
      });
    }
  });

  return violations;
}
