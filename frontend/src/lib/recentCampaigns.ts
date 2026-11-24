export const RECENT_CAMPAIGNS_KEY = "stellargive_recent_campaigns";

const MAX_RECENT_CAMPAIGNS = 5;

export interface RecentCampaign {
  id: string;
  title: string;
}

export function getRecentCampaigns(): RecentCampaign[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_CAMPAIGNS_KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as RecentCampaign[]) : [];
  } catch {
    return [];
  }
}

export function trackRecentCampaign(id: string, title: string) {
  try {
    const recent = getRecentCampaigns().filter((c) => c.id !== id);
    recent.unshift({ id, title });
    localStorage.setItem(RECENT_CAMPAIGNS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_CAMPAIGNS)));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded).
  }
}
