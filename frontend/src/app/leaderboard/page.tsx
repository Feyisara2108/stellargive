import type { Metadata } from "next";
import LeaderboardClient from "./LeaderboardClient";

export const metadata: Metadata = {
  title: "Donor Leaderboard | StellarGive",
  description: "See the leading supporters of StellarGive relief campaigns.",
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
