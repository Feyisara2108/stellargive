import type { Metadata } from "next";
import AdminClient from "./AdminClient";

export const metadata: Metadata = {
  title: "Campaign Administration | StellarGive",
  description: "Manage StellarGive campaigns and platform settings.",
};

export default function AdminPage() {
  return <AdminClient />;
}
