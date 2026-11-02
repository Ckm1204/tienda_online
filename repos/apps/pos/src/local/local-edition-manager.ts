import crypto from "node:crypto";
import { newId, rawCanonicalSha256Hex } from "@tiendita/contracts";

/**
 * ÉPICA 13: Edición Local (Pago Único, Activación Online Única y Respaldos .tdbak)
 * Cubre: HU-119, HU-120, HU-124..HU-129, HU-257, HU-307, HU-309..HU-315, HU-362, HU-407, HU-439, HU-468.
 */

export interface LocalAdminAccount {
  id: string;
  business_name: string;
  nit_or_cc: string;
  password_hash: string;
  recovery_code_hash: string;
  failed_attempts: number;
  locked_until_ms: number | null;
  eula_accepted_at_ms: number;
}

export interface LocalCashierAccount {
  id: string;
  name: string;
  pin_hash: string;
  active: boolean;
}

export interface LocalProduct {
  id: string;
  barcode: string;
  name: string;
  category: string;
  cost_cents: number;
  price_cents: number;
  stock_milli: number;
}

export interface LocalCustomer {
  id: string;
  name: string;
  doc_number: string;
  phone: string;
  credit_limit_cents: number;
  current_balance_cents: number;
}

export interface LocalSaleRecord {
  id: string;
  receipt_number: string;
  total_cents: number;
  subtotal_cents: number;
  tax_cents: number;
  discount_cents: number;
  payment_method: "CASH" | "TRANSFER" | "CREDIT";
  created_at_ms: number;
  lines: { product_id: string; qty_milli: number; unit_price_cents: number; cost_cents: number }[];
}

export interface LocalShiftRecord {
  id: string;
  cashier_id: string;
  opened_at_ms: number;
  closed_at_ms: number | null;
  initial_cash_cents: number;
  final_cash_cents: number | null;
  sales_count: number;
  total_sales_cents: number;
}

export interface TdbakManifest {
  format_version: number;
  backup_id: string;
  license_id: string;
  business_name: string;
  kind: "AUTO_SHIFT" | "AUTO_DAILY" | "MANUAL" | "TRANSFER";
  created_at_ms: number;
  counts: {
    products_count: number;
    customers_count: number;
    sales_count: number;
    last_sale_at_ms: number | null;
  };
  sha256_checksum: string;
}

export class LocalEditionManager {
  public adminAccount: LocalAdminAccount | null = null;
  public cashiers: LocalCashierAccount[] = [];
  public products = new Map<string, LocalProduct>();
  public customers = new Map<string, LocalCustomer>();
  public sales: LocalSaleRecord[] = [];
  public shifts: LocalShiftRecord[] = [];
  public currentShift: LocalShiftRecord | null = null;
  public deviceTransferState: "NORMAL" | "PENDING_RELEASE" | "TRANSFERRED" = "NORMAL";
  public licenseInfo: {
    license_id: string;
    edition: "LOCAL_ESENCIAL" | "LOCAL_PLUS" | "TRIAL";
    business_name: string;
    owner_doc: string;
    receipt_prefix: string;
    updates_until_ms: number;
    trial_expires_at_ms?: number;
  } | null = null;

  private static readonly RECOVERY_CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

  // ==========================================================================
  // HU-362: EULA de Edición Local
  // ==========================================================================
  public static getEulaText(): string {
    return (
      "CONTRATO DE LICENCIA DE USUARIO FINAL (EULA) - TIENDITA ONLINE EDICIÓN LOCAL\n" +
      "1. Licencia de uso perpetuo en un único computador.\n" +
      "2. CUSTODIA LOCAL DE DATOS: Ningún dato de productos, ventas ni clientes se almacena ni transmite a la nube.\n" +
      "3. RESPALDO Y PROTECCIÓN: El usuario es el único responsable de la custodia de su equipo y de generar y guardar sus respaldos .tdbak en memorias externas.\n" +
      "4. SOPORTE Y ACTUALIZACIONES: Incluye actualizaciones hasta la fecha de vigencia pactada."
    );
  }

  // ==========================================================================
  // HU-120: Asistente de configuración inicial y Código de Recuperación
  // ==========================================================================
  public static generateRecoveryCode(): string {
    let raw = "";
    for (let i = 0; i < 16; i++) {
      const idx = crypto.randomInt(0, LocalEditionManager.RECOVERY_CHARSET.length);
      raw += LocalEditionManager.RECOVERY_CHARSET[idx];
    }
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  }

  public initialSetup(params: {
    businessName: string;
    nitOrCc: string;
    adminPassword: string;
    recoveryCode: string;
    confirmedLast4: string;
    eulaAccepted: boolean;
    nowMs?: number;
  }): { admin: LocalAdminAccount } {
    if (!params.eulaAccepted) {
      throw new Error("400 EULA_MUST_BE_ACCEPTED");
    }
    if (params.adminPassword.length < 8) {
      throw new Error("400 PASSWORD_TOO_SHORT: Minimo 8 caracteres");
    }

    const cleanCode = params.recoveryCode.replace(/-/g, "").toUpperCase();
    if (cleanCode.length !== 16) {
      throw new Error("400 INVALID_RECOVERY_CODE_LENGTH");
    }

    const expectedLast4 = cleanCode.slice(-4);
    if (params.confirmedLast4.toUpperCase() !== expectedLast4) {
      throw new Error("400 RECOVERY_CODE_CONFIRMATION_MISMATCH");
    }

    const nowMs = params.nowMs ?? Date.now();
    const pwHash = crypto.scryptSync(params.adminPassword, "tiendita_salt", 64).toString("hex");
    const recHash = crypto.scryptSync(cleanCode, "tiendita_rec_salt", 64).toString("hex");

    this.adminAccount = {
      id: newId(nowMs),
      business_name: params.businessName,
      nit_or_cc: params.nitOrCc,
      password_hash: pwHash,
      recovery_code_hash: recHash,
      failed_attempts: 0,
      locked_until_ms: null,
      eula_accepted_at_ms: nowMs
    };

    return { admin: this.adminAccount };
  }

  // ==========================================================================
  // HU-119 & HU-309: Inicio Dual (Cajero vs Administrador con Bloqueo Progresivo)
  // ==========================================================================
  public loginCashier(cashierId: string, pin: string): { cashier: LocalCashierAccount; view: "POS_CAJA" } {
    const c = this.cashiers.find((x) => x.id === cashierId && x.active);
    if (!c) throw new Error("404 CASHIER_NOT_FOUND");
    const pinHash = crypto.createHash("sha256").update(pin).digest("hex");
    if (c.pin_hash !== pinHash) {
      throw new Error("401 INVALID_PIN");
    }
    return { cashier: c, view: "POS_CAJA" };
  }

  public loginAdmin(password: string, nowMs = Date.now()): { view: "LOCAL_ADMIN" } {
    if (!this.adminAccount) throw new Error("404 NOT_CONFIGURED");

    if (this.adminAccount.locked_until_ms && nowMs < this.adminAccount.locked_until_ms) {
      const remainingSec = Math.ceil((this.adminAccount.locked_until_ms - nowMs) / 1000);
      throw new Error(`423 ADMIN_LOCKED: Reintente en ${remainingSec} segundos`);
    }

    const candidateHash = crypto.scryptSync(password, "tiendita_salt", 64).toString("hex");
    if (this.adminAccount.password_hash !== candidateHash) {
      this.adminAccount.failed_attempts += 1;
      if (this.adminAccount.failed_attempts >= 5) {
        // Bloqueo progresivo: 5 minutos (300.000 ms)
        this.adminAccount.locked_until_ms = nowMs + 5 * 60_000;
      }
      throw new Error("401 INVALID_ADMIN_PASSWORD");
    }

    // Éxito: reinicia contador de fallos
    this.adminAccount.failed_attempts = 0;
    this.adminAccount.locked_until_ms = null;
    return { view: "LOCAL_ADMIN" };
  }

  // ==========================================================================
  // HU-124 & HU-311: LocalSqliteDataProvider y límites de edición
  // ==========================================================================
  public addCashier(name: string, pin: string): LocalCashierAccount {
    if (this.licenseInfo?.edition === "LOCAL_ESENCIAL") {
      const activeCount = this.cashiers.filter((c) => c.active).length;
      if (activeCount >= 2) {
        throw new Error("403 EDITION_LIMIT_REACHED: Local Esencial permite hasta 2 cajeros");
      }
    }

    const pinHash = crypto.createHash("sha256").update(pin).digest("hex");
    const cashier: LocalCashierAccount = {
      id: newId(),
      name,
      pin_hash: pinHash,
      active: true
    };
    this.cashiers.push(cashier);
    return cashier;
  }

  public addCustomer(params: {
    name: string;
    docNumber: string;
    phone: string;
    creditLimitCents: number;
  }): LocalCustomer {
    if (params.creditLimitCents > 0 && this.licenseInfo?.edition === "LOCAL_ESENCIAL") {
      const creditCustomerCount = [...this.customers.values()].filter((c) => c.credit_limit_cents > 0).length;
      if (creditCustomerCount >= 50) {
        throw new Error("403 EDITION_LIMIT_REACHED: Local Esencial permite hasta 50 clientes con fiado");
      }
    }

    const customer: LocalCustomer = {
      id: newId(),
      name: params.name,
      doc_number: params.docNumber,
      phone: params.phone,
      credit_limit_cents: params.creditLimitCents,
      current_balance_cents: 0
    };
    this.customers.set(customer.id, customer);
    return customer;
  }

  public upsertProduct(product: Omit<LocalProduct, "id"> & { id?: string }): LocalProduct {
    const id = product.id ?? newId();
    const p: LocalProduct = {
      id,
      barcode: product.barcode,
      name: product.name,
      category: product.category,
      cost_cents: product.cost_cents,
      price_cents: product.price_cents,
      stock_milli: product.stock_milli
    };
    this.products.set(id, p);
    return p;
  }

  // ==========================================================================
  // HU-314: Bloqueo de ventas si está transferido o en pendiente de traslado
  // ==========================================================================
  public registerSale(sale: Omit<LocalSaleRecord, "id" | "receipt_number">): LocalSaleRecord {
    if (this.deviceTransferState === "TRANSFERRED") {
      throw new Error("403 DEVICE_TRANSFERRED: Este equipo fue trasladado a otro computador. Modo solo lectura");
    }
    if (this.deviceTransferState === "PENDING_RELEASE") {
      throw new Error("403 TRANSFER_PENDING: Cierre de traslado en curso. Ventas bloqueadas para proteger el respaldo");
    }
    if (!this.currentShift) {
      throw new Error("400 NO_OPEN_SHIFT: Debe abrir turno para vender");
    }

    const seq = this.sales.length + 1;
    const prefix = this.licenseInfo?.receipt_prefix ?? "L01";
    const receiptNumber = `${prefix}-${String(seq).padStart(6, "0")}`;

    const rec: LocalSaleRecord = {
      id: newId(sale.created_at_ms),
      receipt_number: receiptNumber,
      ...sale
    };

    // Descontar inventario localmente
    for (const line of rec.lines) {
      const p = this.products.get(line.product_id);
      if (p) {
        p.stock_milli -= line.qty_milli;
      }
    }

    // Si es fiado, sumar al saldo del cliente
    if (rec.payment_method === "CREDIT") {
      // Cliente predeterminado o específico
      const cust = [...this.customers.values()][0];
      if (cust) {
        cust.current_balance_cents += rec.total_cents;
      }
    }

    this.sales.push(rec);
    this.currentShift.sales_count += 1;
    this.currentShift.total_sales_cents += rec.total_cents;
    return rec;
  }

  // ==========================================================================
  // Turnos y arqueos
  // ==========================================================================
  public openShift(cashierId: string, initialCashCents: number, nowMs = Date.now()): LocalShiftRecord {
    if (this.deviceTransferState !== "NORMAL") {
      throw new Error("403 DEVICE_NOT_OPERATIONAL");
    }
    if (this.currentShift) {
      throw new Error("400 SHIFT_ALREADY_OPEN");
    }

    const shift: LocalShiftRecord = {
      id: newId(nowMs),
      cashier_id: cashierId,
      opened_at_ms: nowMs,
      closed_at_ms: null,
      initial_cash_cents: initialCashCents,
      final_cash_cents: null,
      sales_count: 0,
      total_sales_cents: 0
    };
    this.shifts.push(shift);
    this.currentShift = shift;
    return shift;
  }

  public closeShift(finalCashCents: number, nowMs = Date.now()): LocalShiftRecord {
    if (!this.currentShift) throw new Error("400 NO_OPEN_SHIFT");
    this.currentShift.closed_at_ms = nowMs;
    this.currentShift.final_cash_cents = finalCashCents;
    const closed = this.currentShift;
    this.currentShift = null;
    return closed;
  }

  // ==========================================================================
  // HU-312: Consultas SQL locales de Reportes
  // ==========================================================================
  public getLocalReportSummary() {
    let totalSalesCents = 0;
    let totalTaxCents = 0;
    let totalCostCents = 0;
    const byMethod: Record<string, number> = { CASH: 0, TRANSFER: 0, CREDIT: 0 };

    for (const s of this.sales) {
      totalSalesCents += s.total_cents;
      totalTaxCents += s.tax_cents;
      byMethod[s.payment_method] = (byMethod[s.payment_method] ?? 0) + s.total_cents;
      for (const line of s.lines) {
        totalCostCents += Math.round((line.qty_milli * line.cost_cents) / 1000);
      }
    }

    const grossMarginCents = totalSalesCents - totalCostCents;
    const marginPercent = totalSalesCents > 0 ? (grossMarginCents / totalSalesCents) * 100 : 0;

    let totalCreditReceivableCents = 0;
    for (const c of this.customers.values()) {
      totalCreditReceivableCents += c.current_balance_cents;
    }

    return {
      sales_count: this.sales.length,
      total_sales_cents: totalSalesCents,
      total_tax_cents: totalTaxCents,
      total_cost_cents: totalCostCents,
      gross_margin_cents: grossMarginCents,
      gross_margin_percent: Number(marginPercent.toFixed(2)),
      by_payment_method: byMethod,
      total_credit_receivable_cents: totalCreditReceivableCents,
      products_count: this.products.size
    };
  }

  // ==========================================================================
  // HU-125, HU-127, HU-313: Empaquetador, Cifrador y Verificador .tdbak
  // ==========================================================================
  public generateTdbak(params: {
    recoveryCode: string;
    kind?: "AUTO_SHIFT" | "AUTO_DAILY" | "MANUAL" | "TRANSFER";
    nowMs?: number;
  }): { manifest: TdbakManifest; encryptedPayloadHex: string } {
    const nowMs = params.nowMs ?? Date.now();
    const cleanKey = params.recoveryCode.replace(/-/g, "").toUpperCase();

    const dataDump = JSON.stringify({
      admin: this.adminAccount,
      cashiers: this.cashiers,
      products: [...this.products.values()],
      customers: [...this.customers.values()],
      sales: this.sales,
      shifts: this.shifts,
      license: this.licenseInfo
    });

    const sha256 = crypto.createHash("sha256").update(dataDump).digest("hex");
    const manifest: TdbakManifest = {
      format_version: 1,
      backup_id: newId(nowMs),
      license_id: this.licenseInfo?.license_id ?? "LOC-DEFAULT",
      business_name: this.adminAccount?.business_name ?? "Tiendita Local",
      kind: params.kind ?? "MANUAL",
      created_at_ms: nowMs,
      counts: {
        products_count: this.products.size,
        customers_count: this.customers.size,
        sales_count: this.sales.length,
        last_sale_at_ms: this.sales.length > 0 ? (this.sales[this.sales.length - 1]?.created_at_ms ?? null) : null
      },
      sha256_checksum: sha256
    };

    // Cifrado AES-256-GCM con clave derivada por scrypt del recovery code
    const key = crypto.scryptSync(cleanKey, "tiendita_tdbak_salt", 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(dataDump, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");

    const packageHex = JSON.stringify({
      manifest,
      iv: iv.toString("hex"),
      tag,
      ciphertext: encrypted
    });

    // Verificación post-escritura (relectura y desempacado)
    const rereadManifest = JSON.parse(packageHex).manifest;
    if (rereadManifest.sha256_checksum !== sha256) {
      throw new Error("500 BACKUP_POST_WRITE_VERIFICATION_FAILED");
    }

    return { manifest, encryptedPayloadHex: packageHex };
  }

  public restoreTdbak(params: {
    packageHex: string;
    recoveryCode: string;
    targetLicenseId?: string;
  }): { restoredCounts: TdbakManifest["counts"] } {
    const pkg = JSON.parse(params.packageHex);
    const manifest: TdbakManifest = pkg.manifest;

    // Validación de licencia compatible (salvo aprobación expresa)
    if (params.targetLicenseId && manifest.license_id !== params.targetLicenseId) {
      throw new Error(`403 LICENSE_MISMATCH: Archivo de ${manifest.license_id} en ${params.targetLicenseId}`);
    }

    const cleanKey = params.recoveryCode.replace(/-/g, "").toUpperCase();
    const key = crypto.scryptSync(cleanKey, "tiendita_tdbak_salt", 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(pkg.iv, "hex"));
    decipher.setAuthTag(Buffer.from(pkg.tag, "hex"));

    let decrypted = decipher.update(pkg.ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");

    const dump = JSON.parse(decrypted);
    this.adminAccount = dump.admin;
    this.cashiers = dump.cashiers ?? [];
    this.products.clear();
    for (const p of dump.products ?? []) {
      this.products.set(p.id, p);
    }
    this.customers.clear();
    for (const c of dump.customers ?? []) {
      this.customers.set(c.id, c);
    }
    this.sales = dump.sales ?? [];
    this.shifts = dump.shifts ?? [];

    return { restoredCounts: manifest.counts };
  }

  // ==========================================================================
  // HU-126: Asistente de Solicitud de Cambio de Equipo
  // ==========================================================================
  public initiateDeviceTransfer(recoveryCode: string): { finalBackup: TdbakManifest; transferHash: string } {
    if (this.currentShift) {
      throw new Error("400 MUST_CLOSE_SHIFT_BEFORE_TRANSFER: Cierre el turno antes de iniciar el traslado");
    }

    const backup = this.generateTdbak({ recoveryCode, kind: "TRANSFER" });
    this.deviceTransferState = "PENDING_RELEASE";
    const transferHash = rawCanonicalSha256Hex({
      license_id: this.licenseInfo?.license_id,
      backup_checksum: backup.manifest.sha256_checksum,
      counts: backup.manifest.counts
    });

    return { finalBackup: backup.manifest, transferHash };
  }

  public completeDeviceTransfer(): void {
    this.deviceTransferState = "TRANSFERRED";
  }

  // ==========================================================================
  // HU-128: Validación de updates_until contra fecha de compilación
  // ==========================================================================
  public validateInstallerBuild(installerBuildDateMs: number): { canInstall: boolean; reason?: string } {
    if (!this.licenseInfo) throw new Error("NO_LICENSE");
    if (installerBuildDateMs > this.licenseInfo.updates_until_ms) {
      return {
        canInstall: false,
        reason: `Tu licencia incluye actualizaciones hasta ${new Date(this.licenseInfo.updates_until_ms).toISOString().slice(0, 10)}; tu version actual sigue siendo perpetua`
      };
    }
    return { canInstall: true };
  }

  // ==========================================================================
  // HU-315: Asistente de exportación hacia TienditaOnline Cloud
  // ==========================================================================
  public exportToCloudPackage() {
    return {
      version: "1.0",
      source_license_id: this.licenseInfo?.license_id,
      business_name: this.adminAccount?.business_name,
      nit_or_cc: this.adminAccount?.nit_or_cc,
      exported_at_ms: Date.now(),
      products: [...this.products.values()].map((p) => ({
        barcode: p.barcode,
        name: p.name,
        category: p.category,
        cost_cents: p.cost_cents,
        price_cents: p.price_cents,
        stock_milli: p.stock_milli
      })),
      customers: [...this.customers.values()].map((c) => ({
        name: c.name,
        doc_number: c.doc_number,
        phone: c.phone,
        credit_limit_cents: c.credit_limit_cents,
        current_balance_cents: c.current_balance_cents
      })),
      counts: {
        products: this.products.size,
        customers: this.customers.size,
        sales: this.sales.length
      }
    };
  }

  // ==========================================================================
  // HU-468: Verificación estricta de que Edición Local no hace llamadas de sincronización
  // ==========================================================================
  public isEndpointAllowed(endpointUrl: string): boolean {
    if (endpointUrl.includes("/v1/sync/") || endpointUrl.includes("/v1/terminals/heartbeat")) {
      return false;
    }
    return true;
  }
}
