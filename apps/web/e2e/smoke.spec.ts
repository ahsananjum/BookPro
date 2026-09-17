import { test, expect } from "@playwright/test";

test.describe("BookPro Web Application Smoke Test", () => {
    test("should load homepage with correct title", async ({ page }) => {
        await page.goto("/");
        await expect(page).toHaveTitle(/BookPro/);
        await expect(page.locator("h1")).toContainText("BookPro Governance & Infrastructure Foundation");
    });
});
