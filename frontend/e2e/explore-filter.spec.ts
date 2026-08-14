// playwright test for explore page filter, empty search, pagination
import { test, expect, Page, Route } from "@playwright/test";
import { mockCampaign } from "@/stories/mocks";

// Helper to mock campaigns API response
async function mockCampaigns(page: Page, campaigns: any[]) {
  await page.route("**/api/campaigns**", (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ campaigns, hasMore: campaigns.length > 9 }),
    });
  });
}

test.describe("Explore page filtering and pagination", () => {
  test("category filter narrows visible list", async ({ page }) => {
    const campaigns = [
      { ...mockCampaign, id: 1, category: "Health" },
      { ...mockCampaign, id: 2, category: "Education" },
      { ...mockCampaign, id: 3, category: "Health" },
    ];
    await mockCampaigns(page, campaigns);
    await page.goto("/explore");
    // assume a category dropdown exists with data-test-id="category-filter"
    await page.selectOption("[data-test-id='category-filter']", "Health");
    const visible = await page.locator("[data-test-id='campaign-card']").count();
    expect(visible).toBe(2);
  });

  test("empty search shows empty state", async ({ page }) => {
    const campaigns = [mockCampaign];
    await mockCampaigns(page, campaigns);
    await page.goto("/explore");
    await page.fill("#explore-search", "nonexistent");
    await page.waitForTimeout(400);
    await expect(page.locator("text=No campaigns match your search.")).toBeVisible();
  });

  test("load more button respects hasMore flag", async ({ page }) => {
    const firstPage = Array.from({ length: 9 }, (_, i) => ({ ...mockCampaign, id: i + 1 }));
    const secondPage = Array.from({ length: 3 }, (_, i) => ({ ...mockCampaign, id: i + 10 }));
    // first call returns hasMore true, second call returns hasMore false
    await page.route("**/api/campaigns**", async (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset")) || 0;
      if (offset === 0) {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ campaigns: firstPage, hasMore: true }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ campaigns: secondPage, hasMore: false }),
        });
      }
    });
    await page.goto("/explore");
    await expect(page.locator("text=Load More")).toBeVisible();
    await page.click("text=Load More");
    await expect(page.locator("text=Load More")).toBeHidden();
  });
});
