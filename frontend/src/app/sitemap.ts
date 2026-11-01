import type { MetadataRoute } from "next";
import { getRecentCampaigns } from "@/lib/soroban";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://stellargive.org";
const staticRoutes = ["", "/explore", "/activity", "/leaderboard", "/faq"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const routes: MetadataRoute.Sitemap = staticRoutes.map((path) => ({
    url: new URL(path, siteUrl).toString(),
    lastModified,
  }));

  try {
    const campaigns = await getRecentCampaigns(100, 0);
    routes.push(
      ...campaigns.map((campaign) => ({
        url: new URL(`/campaign/${campaign.id.toString()}`, siteUrl).toString(),
        lastModified,
      })),
    );
  } catch {
    // The static routes remain available when the Soroban RPC is unavailable.
  }

  return routes;
}
