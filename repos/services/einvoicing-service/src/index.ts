/**
 * @tiendita/einvoicing-service
 * ÉPICA 15: Facturación Electrónica y Documento Equivalente POS DIAN
 * Cubre: HU-136, HU-137, HU-138, HU-379..HU-387, HU-460..HU-465, HU-505.
 */

export * from "./types.js";
export * from "./dian-fiscal-engine.js";
export * from "./numbering-block-manager.js";
export * from "./ubl-builder.js";
export * from "./contingency-and-worm.js";

import { DianFiscalEngine } from "./dian-fiscal-engine.js";
import { NumberingBlockManager } from "./numbering-block-manager.js";
import { UblBuilder } from "./ubl-builder.js";
import { ContingencyAndWormManager } from "./contingency-and-worm.js";

export class EinvoicingService {
  public readonly fiscalEngine = DianFiscalEngine;
  public readonly numbering = new NumberingBlockManager();
  public readonly ubl = UblBuilder;
  public readonly contingencyWorm = new ContingencyAndWormManager();
}
