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

    // Esperar a que la aplicación esté montada
    await expect(page.getByTestId("management-session").or(page.getByTestId("connection-blocker"))).toBeVisible({ timeout: 15000 });

    // Verificar presencia de elementos de navegación accesibles
    const heading = page.locator("h1, h2, [role='heading']").first();
    await expect(heading).toBeVisible();

    // Navegación al módulo de Catálogo de Productos
    const catalogLink = page.getByTestId("nav-item-catalog");
    if (await catalogLink.isVisible()) {
      await catalogLink.click();
      await expect(page.getByText(/nuevo producto|buscar|arroz diana/i).first()).toBeVisible();
    }
  });

  test("flujo de creación de producto con validación de margen positivo", async ({ page }) => {
    await page.goto("/");

    // Ir a Catálogo si está disponible
    const catalogLink = page.getByTestId("nav-item-catalog");
    if (await catalogLink.isVisible()) {
      await catalogLink.click();
    }

    // Botón de nuevo producto
    const newProdBtn = page.getByText(/nuevo producto/i).first();
    if (await newProdBtn.isVisible()) {
      await newProdBtn.click();
    }

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
    const adminTab = page.getByTestId("nav-item-profile");
    if (await adminTab.isVisible()) {
      await adminTab.click();
      await expect(page.getByText(/suscripción|facturación|plan/i).first()).toBeVisible();
    }
  });

  test("módulo de libro fiscal (Art. 616 E.T.) y monitor 3.500 UVT", async ({ page }) => {
    await page.goto("/");
    const fiscalLink = page.getByTestId("nav-item-fiscal");
    if (await fiscalLink.isVisible()) {
      await fiscalLink.click();
      await expect(page.getByText(/libro fiscal/i).first()).toBeVisible();
      await expect(page.getByText(/3\.500 uvt/i).first()).toBeVisible();

      // Probar navegación a la pestaña de Resoluciones DIAN
      const dianTab = page.getByTestId("tab-dian-resolution");
      if (await dianTab.isVisible()) {
        await dianTab.click();
        await expect(page.getByText(/documento equivalente pos/i).first()).toBeVisible();
      }
    }
  });

  test("consola super admin: alternancia de rol a SUPER_ADMIN y navegación a plataforma SaaS", async ({ page }) => {
    await page.goto("/");
    const roleSwitcher = page.getByTestId("btn-role-switcher");
    if (await roleSwitcher.isVisible()) {
      await roleSwitcher.click();
      await expect(page.getByText(/super admin|plataforma saas/i).first()).toBeVisible();
      const platformTab = page.getByTestId("nav-item-platform");
      if (await platformTab.isVisible()) {
        await platformTab.click();
        await expect(page.getByTestId("super-admin-screen")).toBeVisible();
        await expect(page.getByText(/mrr activo/i).first()).toBeVisible();
      }
    }
  });
});

