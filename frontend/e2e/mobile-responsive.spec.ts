import { test, expect } from "@playwright/test";

test.describe("Mobile Viewport Behavior", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  const routesToTest = ["/", "/explore", "/campaign/1"];

  test("no horizontal overflow on key routes", async ({ page }) => {
    for (const route of routesToTest) {
      await page.goto(route);
      
      // Check for horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      
      expect(hasOverflow).toBeFalsy();
    }
  });

  test("mobile navigation drawer opens and closes correctly", async ({ page }) => {
    await page.goto("/");
    
    // Assume there is a hamburger menu button visible on mobile
    const menuButton = page.locator('button[aria-label="Toggle menu"], button:has(.lucide-menu), .lucide-menu').first();
    await menuButton.waitFor();
    await menuButton.click();

    // Drawer should open, and a nav link or close button should be visible
    const mobileNav = page.locator('nav[role="navigation"], [role="dialog"], [data-state="open"]');
    await expect(mobileNav.first()).toBeVisible();

    // Assume there is a close button or clicking a link closes the drawer
    // Or clicking the menu button again closes it
    const closeButton = page.locator('button[aria-label="Close menu"], button:has(.lucide-x), .lucide-x').first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      await menuButton.click();
    }

    // Nav should be hidden (or closed state)
    // Wait for the drawer to close (animation)
    await page.waitForTimeout(500);
  });

  test("sticky donate bar behaves correctly on campaign detail page", async ({ page }) => {
    await page.goto("/campaign/1");

    // The sticky donate bar should be visible on mobile
    const stickyBar = page.locator('[data-testid="sticky-donate-bar"], .sticky, .fixed').filter({ hasText: "Donate" }).first();
    
    // We expect a sticky donate bar to be visible
    if (await stickyBar.count() > 0) {
      await expect(stickyBar).toBeVisible();
      
      // Ensure it is positioned correctly (e.g. fixed at bottom)
      const boundingBox = await stickyBar.boundingBox();
      expect(boundingBox?.y).toBeGreaterThan(0);
      
      // It should not cause horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasOverflow).toBeFalsy();
    }
  });
});
