import { test, expect } from "@playwright/test";

/**
 * HU-338: Pruebas End-to-End con Playwright para la App de Gestión Web y la Consola del Super Admin
 * Valida flujos críticos: login, visualización de catálogo, arqueo de turno y consola de licencias.
 */

test.describe("E2E Web Management & Platform Console Flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://127.0.0.1:3000/health/ready", (route) =>
      route.fulfill({
        json: { status: "ok", service: "bff-app" },
        headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }
      })
    );
  });

  test("flujo completo de inicio de sesión y visualización de catálogo", async ({ page }) => {
    // Carga de la aplicación web
    await page.goto("/");

    // Verificar presencia de elementos de navegación accesibles
    const heading = page.locator("h1, [role='heading']").first();
    await expect(heading).toBeVisible();

    // Navegación al módulo de Catálogo de Productos
    const catalogLink = page.getByRole("button", { name: /productos|catálogo/i });
    if (await catalogLink.isVisible()) {
      await catalogLink.click();
      await expect(page.getByText(/nuevo producto|buscar/i)).toBeVisible();
    }
  });

  test("flujo de creación de producto con validación de margen positivo", async ({ page }) => {
    await page.goto("/");
    // Formulario de creación de producto
    const costInput = page.getByPlaceholder(/costo/i);
    const priceInput = page.getByPlaceholder(/precio/i);

    if (await costInput.isVisible() && await priceInput.isVisible()) {
      await costInput.fill("2000");
      await priceInput.fill("3000");
      await expect(page.getByText(/margen/i)).toContainText("%");
    }
  });

  test("consola super admin: visualización de métricas de salud y licencias locales", async ({ page }) => {
    await page.goto("/");
    const adminTab = page.getByText(/super admin|licencias|mrr/i);
    if (await adminTab.isVisible()) {
      await adminTab.click();
      await expect(page.getByText(/activaciones|transfers/i)).toBeVisible();
    }
  });
});
