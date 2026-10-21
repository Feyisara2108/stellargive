import type { Metadata } from "next";
import ExploreClient from "./ExploreClient";

export const metadata: Metadata = {
  title: "Explore Relief Campaigns | StellarGive",
  description: "Discover and support active relief campaigns on the Stellar network.",
};

export default function ExplorePage() {
  return <ExploreClient />;
}