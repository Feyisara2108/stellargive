import type { Metadata } from "next";
import ActivityClient from "./ActivityClient";

export const metadata: Metadata = {
  title: "On-Chain Activity | StellarGive",
  description: "Browse recent campaign creation, donation, and claim events on StellarGive.",
};

export default function ActivityPage() {
  return <ActivityClient />;
}
