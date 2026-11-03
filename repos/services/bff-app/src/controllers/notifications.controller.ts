import type { NotificationService, NotificationChannel } from "@tiendita/notification-service";
import type { CustomerService } from "@tiendita/customer-service";
import type { HttpRequest, HttpResponse } from "../types.js";
import { requirePermission } from "../middlewares/gateway-security.js";

export class NotificationsController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly customerService: CustomerService
  ) {}

  /**
   * HU-327 & DIAN: Envío digital de comprobante de venta o factura electrónica POS
   * por WhatsApp o Correo Electrónico con CUDE SHA-384 y enlace QR oficial de la DIAN.
   */
  async sendInvoiceReceipt(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "reports.read");

    const body = (req.body as any) || {};
    const {
      invoiceNumber,
      customerName,
      recipient,
      channel = "WHATSAPP",
      totalCents,
      cude,
      qrUrl,
      tenantName
    } = body;

    if (!invoiceNumber || !recipient || !cude || !qrUrl || totalCents === undefined) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: {
          error: "MISSING_REQUIRED_FIELDS",
          message: "invoiceNumber, recipient, cude, qrUrl y totalCents son obligatorios"
        }
      };
    }

    const normChannel: NotificationChannel =
      String(channel).toUpperCase() === "EMAIL" ? "EMAIL" : "WHATSAPP";

    const record = await this.notificationService.sendElectronicInvoiceReceipt({
      tenantId: claims.tid!,
      invoiceNumber: String(invoiceNumber),
      customerName: customerName ? String(customerName) : "Cliente General",
      recipient: String(recipient),
      channel: normChannel,
      totalCents: Number(totalCents),
      cude: String(cude),
      qrUrl: String(qrUrl),
      tenantName: tenantName ? String(tenantName) : "TienditaOnline",
      nowMs
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        success: true,
        notificationId: record.id,
        status: record.status,
        channel: record.channel,
        recipient: record.recipient,
        renderedSubject: record.renderedSubject,
        renderedBody: record.renderedBody,
        sentAtMs: record.sentAtMs
      }
    };
  }

  /**
   * HU-109, HU-364 & HU-446: Despacho de recordatorio de pago a deudor
   * con validación estricta de horarios legales y auditoría ante la SIC (Ley 2300 de 2023).
   */
  async sendDebtReminder(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "customer.credit_manage");

    const body = (req.body as any) || {};
    const { customerId, recipient, channel = "WHATSAPP", customMessage } = body;

    if (!customerId || !recipient) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_REQUIRED_FIELDS", message: "customerId y recipient son obligatorios" }
      };
    }

    const normChannel: NotificationChannel =
      String(channel).toUpperCase() === "EMAIL"
        ? "EMAIL"
        : String(channel).toUpperCase() === "SMS"
          ? "SMS"
          : "WHATSAPP";

    const customerServiceChannel =
      normChannel === "EMAIL"
        ? ("EMAIL" as const)
        : normChannel === "SMS"
          ? ("SMS" as const)
          : ("WHATSAPP" as const);

    const validation = this.customerService.validateCollectionContactAllowed({
      tenantId: claims.tid!,
      customerId,
      targetIsDebtorOrCodebtor: true,
      channel: customerServiceChannel,
      nowMs
    });

    if (!validation.allowed) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: {
          error: "LEY_2300_BLOCKED",
          code: validation.code,
          reason: validation.reason,
          details: validation.details,
          sicComplianceWarning: "Contacto de cobranza bloqueado por Ley 2300 de 2023 ('Dejen de Fregar')"
        }
      };
    }

    const customer = this.customerService.customers.get(customerId);
    const customerName = customer?.full_name ?? "Apreciado/a Cliente";
    const balanceCents = customer?.balance_cents ?? 0;
    const formattedBalance = `$${(balanceCents / 100).toLocaleString("es-CO")} COP`;

    const record = await this.notificationService.queueNotification({
      tenantId: claims.tid!,
      userId: claims.sub,
      recipient: String(recipient),
      channel: normChannel,
      templateCode: "debt.reminder",
      payload: {
        customer_name: customerName,
        tenant_name: "TienditaOnline",
        amount: formattedBalance,
        custom_message: customMessage ?? ""
      },
      dedupeKey: `debt_remind:${claims.tid}:${customerId}:${normChannel}:${nowMs}`,
      isDebtCollection: true,
      debtorId: customerId,
      nowMs
    });

    const auditEntry = this.customerService.recordCollectionContact({
      tenantId: claims.tid!,
      customerId,
      targetIsDebtorOrCodebtor: true,
      channel: customerServiceChannel,
      agentOrSystemId: claims.sub || "system",
      notes: customMessage ? `Mensaje enviado: ${customMessage}` : "Recordatorio automático de saldo",
      nowMs
    });

    const weeklyCount = this.customerService.getWeeklyContactCount(claims.tid!, customerId, nowMs);

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        success: true,
        notificationId: record.id,
        status: record.status,
        channel: record.channel,
        recipient: record.recipient,
        renderedBody: record.renderedBody,
        sicAuditContactId: auditEntry.contactId,
        currentWeeklyContactsCount: weeklyCount
      }
    };
  }

  /**
   * Listado de notificaciones emitidas por el tenant para auditoría y trazabilidad.
   */
  async listNotifications(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "reports.read");

    const notifications = this.notificationService.listNotifications(claims.tid);
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        tenantId: claims.tid,
        count: notifications.length,
        items: notifications
      }
    };
  }
}
