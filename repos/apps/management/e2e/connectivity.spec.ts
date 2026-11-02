import { expect, test } from "@playwright/test";

test("HU-096: blocks private content on network loss and recovers only after a successful probe", async ({ page, context }, testInfo) => {
  await page.route("http://127.0.0.1:3000/health/ready", (route) => route.fulfill({
    json: { status: "ok", service: "bff-app" },
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }
  }));
  await page.goto("/");
  await expect(page.getByTestId("management-session")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.fonts.check("16px DMSans_600SemiBold"))).toBe(true);
  await context.setOffline(true);
  await expect(page.getByText("Sin conexion a internet")).toBeVisible();
  await expect(page.getByTestId("management-session")).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reintentar conexion" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator("svg").count()).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("offline.png"), fullPage: true });
  await context.setOffline(false);
  await expect(page.getByTestId("management-session")).toBeVisible();
  await expect(page.getByTestId("connection-blocker")).toHaveCount(0);
});

test("HU-096: backend failure blocks access even when the browser reports online", async ({ page }) => {
  let reachable = true;
  await page.route("http://127.0.0.1:3000/health/ready", (route) => reachable
    ? route.fulfill({ json: { status: "ok", service: "bff-app" }, headers: { "Access-Control-Allow-Origin": "*" } })
    : route.abort("connectionfailed"));
  await page.goto("/");
  await expect(page.getByTestId("management-session")).toBeVisible();
  reachable = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Sin conexion a internet")).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await page.getByRole("button", { name: "Reintentar conexion" }).click();
  await expect(page.getByTestId("management-session")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reintentar conexion" })).toBeEnabled();
  reachable = true;
  await page.getByRole("button", { name: "Reintentar conexion" }).click();
  await expect(page.getByTestId("management-session")).toBeVisible();
});

test("HU-096: a captive portal or unrelated service does not unlock management", async ({ page }) => {
  await page.route("http://127.0.0.1:3000/health/ready", (route) => route.fulfill({
    json: { status: "ok", service: "hotel-captive-portal" },
    headers: { "Access-Control-Allow-Origin": "*" }
  }));
  await page.goto("/");
  await expect(page.getByText("Sin conexion a internet")).toBeVisible();
  await expect(page.getByTestId("management-session")).toHaveCount(0);
});