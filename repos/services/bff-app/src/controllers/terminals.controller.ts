import type { DeviceService } from "@tiendita/device-service";
import type { HttpRequest, HttpResponse } from "../types.js";
import { requirePermission, requireStepUpMfa } from "../middlewares/gateway-security.js";

export class TerminalsController {
  constructor(private readonly deviceService: DeviceService) {}

  async listTerminals(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "terminal.read");
    const list = [...this.deviceService.terminals.values()].filter(
      (t) => t.tenant_id === claims.tid
    );
    return { status: 200, headers: { "Content-Type": "application/json" }, body: list };
  }

  async createTerminal(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "terminal.manage");
    const { branchId, warehouseId, code, receiptPrefix } = (req.body as any) || {};
    const terminal = this.deviceService.createTerminal({
      tenantId: claims.tid!,
      branchId,
      warehouseId,
      code,
      receiptPrefix
    });
    return { status: 201, headers: { "Content-Type": "application/json" }, body: terminal };
  }

  async generateEnrollmentCode(
    terminalId: string,
    req: HttpRequest,
    nowMs: number
  ): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "terminal.manage");
    const enroll = this.deviceService.generateEnrollmentCode(terminalId, nowMs);
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        code: enroll.plainCode,
        qrPayload: enroll.qrPayload,
        expiresAtMs: enroll.expiresAtMs,
        remainingMinutes: 15
      }
    };
  }

  async revokeTerminal(
    terminalId: string,
    req: HttpRequest,
    nowMs: number
  ): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "terminal.manage");
    requireStepUpMfa(claims, 300, nowMs); // 300s = 5 minutos
    this.deviceService.revokeTerminal(terminalId, "Revoked from Management App");
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { revoked: true, terminalId }
    };
  }

  async forceCloseShift(terminalId: string, req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "shift.manage");
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { closed: true, terminalId }
    };
  }
}
