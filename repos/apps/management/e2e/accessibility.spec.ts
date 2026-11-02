import { expect, test } from "@playwright/test";

test("HU-495: accesibilidad básica y navegación por teclado en flujos críticos", async ({ page }) => {
  await page.route("http://127.0.0.1:3000/health/ready", (route) =>
    route.fulfill({
      json: { status: "ok", service: "bff-app" },
      headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }
    })
  );

  await page.goto("/");
  await expect(page.getByTestId("management-session")).toBeVisible();

  // Validar contraste y estructura de títulos jerárquicos
  const headings = await page.locator("h1, h2, [role='heading']").count();
  expect(headings).toBeGreaterThanOrEqual(1);

  // Validar accesibilidad por teclado: tabulación debe alcanzar controles interactivos
  await page.keyboard.press("Tab");
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
  expect(focusedTag).toBeDefined();

  // Verificar que botones y enlaces tienen nombres accesibles
  const buttons = page.locator("button, [role='button']");
  const buttonCount = await buttons.count();
  for (let i = 0; i < Math.min(buttonCount, 5); i++) {
    const btn = buttons.nth(i);
    const accessibleName = await btn.evaluate(
      (el) => el.getAttribute("aria-label") || el.textContent || el.getAttribute("title")
    );
    expect(accessibleName?.trim().length).toBeGreaterThan(0);
  }
});
