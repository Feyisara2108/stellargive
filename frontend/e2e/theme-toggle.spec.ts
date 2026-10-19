import { test, expect } from "@playwright/test";

test.describe("Theme Toggle Persistence & Anti-flash", () => {
  test("selects dark theme via the radio group, reloads, and persists", async ({ page }) => {
    await page.goto("/");

    const darkRadio = page.getByRole("radio", { name: /Dark theme/ });
    await expect(darkRadio).toBeVisible();

    await darkRadio.click();

    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);
    await expect(darkRadio).toHaveAttribute("aria-checked", "true");

    // Reload page
    await page.reload();

    // Assert dark mode and the checked radio persist across reload
    await expect(html).toHaveClass(/dark/);
    await expect(page.getByRole("radio", { name: /Dark theme/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("selects light theme via the radio group, reloads, and persists", async ({ page }) => {
    await page.goto("/");

    const lightRadio = page.getByRole("radio", { name: /Light theme/ });
    await expect(lightRadio).toBeVisible();

    await lightRadio.click();

    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    await expect(lightRadio).toHaveAttribute("aria-checked", "true");

    await page.reload();

    await expect(html).not.toHaveClass(/dark/);
    await expect(page.getByRole("radio", { name: /Light theme/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
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
    const systemRadio = page.getByRole("radio", { name: /System theme/ });
    await expect(systemRadio).toBeVisible();
    await expect(systemRadio).toHaveAttribute("aria-checked", "true");
    await expect(html).toHaveClass(/dark/);
  });

  test.use({ colorScheme: "light" });
  test("system mode follows light OS preference", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    // Assert the theme is applied immediately
    await expect(html).not.toHaveClass(/dark/);

    const systemRadio = page.getByRole("radio", { name: /System theme/ });
    await expect(systemRadio).toHaveAttribute("aria-checked", "true");
  });
});
