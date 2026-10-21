import type { Metadata } from "next";
import ProfileClient from "./ProfileClient";

export const metadata: Metadata = {
  title: "My Campaigns | StellarGive",
  description: "Review the campaigns you have created and supported on StellarGive.",
};

export default function ProfilePage() {
  return <ProfileClient />;
}