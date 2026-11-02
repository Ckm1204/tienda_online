/**
 * HU-499: Auditoría automatizada de licencias Open Source para impedir
 * licencias copyleft incompatibles (GPL/AGPL) en código propietario.
 */
export const ALLOWED_OPEN_SOURCE_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MPL-2.0",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "Python-2.0",
  "UNLICENSED"
]);

export interface DependencyLicenseEntry {
  name: string;
  version: string;
  license: string;
}

export interface LicenseAuditResult {
  passed: boolean;
  forbidden: DependencyLicenseEntry[];
}

export function auditDependencyLicenses(
  dependencies: DependencyLicenseEntry[]
): LicenseAuditResult {
  const forbidden: DependencyLicenseEntry[] = [];

  for (const dep of dependencies) {
    const normalized = dep.license.trim();
    const isCopyleft = /\b(AGPL|GPL|LGPL|SSPL|EUPL)\b/i.test(normalized);
    if (isCopyleft || !ALLOWED_OPEN_SOURCE_LICENSES.has(normalized)) {
      forbidden.push(dep);
    }
  }

  return {
    passed: forbidden.length === 0,
    forbidden
  };
}
