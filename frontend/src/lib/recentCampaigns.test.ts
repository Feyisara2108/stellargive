import { describe, it, expect, beforeEach } from "vitest";
import { RECENT_CAMPAIGNS_KEY, getRecentCampaigns, trackRecentCampaign } from "./recentCampaigns";

describe("recentCampaigns", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty list when nothing is stored or the value is corrupt", () => {
    expect(getRecentCampaigns()).toEqual([]);
    localStorage.setItem(RECENT_CAMPAIGNS_KEY, "not json");
    expect(getRecentCampaigns()).toEqual([]);
    localStorage.setItem(RECENT_CAMPAIGNS_KEY, '{"id":"1"}');
    expect(getRecentCampaigns()).toEqual([]);
  });

  it("puts the newest campaign first and removes duplicates", () => {
    trackRecentCampaign("1", "First");
    trackRecentCampaign("2", "Second");
    trackRecentCampaign("1", "First again");

    expect(getRecentCampaigns()).toEqual([
      { id: "1", title: "First again" },
      { id: "2", title: "Second" },
    ]);
  });

  it("keeps at most five campaigns", () => {
    for (let i = 1; i <= 7; i++) trackRecentCampaign(String(i), `Campaign ${i}`);

    const recent = getRecentCampaigns();
    expect(recent).toHaveLength(5);
    expect(recent[0].id).toBe("7");
    expect(recent[4].id).toBe("3");
  });
});
