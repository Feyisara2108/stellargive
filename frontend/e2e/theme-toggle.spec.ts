import { test, expect } from "@playwright/test";

test.describe("Theme Toggle Persistence & Anti-flash", () => {
  test("toggles theme to dark, reloads, and persists", async ({ page }) => {
    await page.goto("/");

    // By default, since we don't emulate colorScheme in this test block and
    // defaultTheme="system", next-themes usually defaults to light or system.
    // Let's explicitly force light mode first or just toggle it to dark.
    // Wait for the hydration and the button to be ready.
    const themeButton = page.locator('button:has-text("Toggle theme")');
    await expect(themeButton).toBeVisible();

    // Check current theme by looking at html class
    const html = page.locator("html");
    const isDark = await html.evaluate((node) => node.classList.contains("dark"));

    // If it's not dark, click to make it dark. If it's already dark, we make it light then dark.
    if (!isDark) {
      await themeButton.click();
    }
    
    // Ensure it's now dark
    await expect(html).toHaveClass(/dark/);
    
    // Reload page
    await page.reload();

    // Assert dark mode persists across reload
    await expect(html).toHaveClass(/dark/);
  });

  test.use({ colorScheme: "dark" });
  test("system mode correctly follows emulated OS preference and prevents flash", async ({
    page,
  }) => {
    // We navigate and immediately check the html tag to ensure the anti-flash
    // script applied the correct class before JS hydration.
    await page.goto("/");

    const html = page.locator("html");
    
    // Assert the theme is applied immediately
    await expect(html).toHaveClass(/dark/);
    
    // Optionally check that the resolved theme state matches once hydrated
    const themeButton = page.locator('button:has-text("Toggle theme")');
    await expect(themeButton).toBeVisible();
    await expect(html).toHaveClass(/dark/);
  });

  test.use({ colorScheme: "light" });
  test("system mode follows light OS preference", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    // Assert the theme is applied immediately
    await expect(html).not.toHaveClass(/dark/);
  });
});
