import type { Metadata } from "next";
import CreateClient from "./CreateClient";

export const metadata: Metadata = {
  title: "Create a Campaign | StellarGive",
  description: "Start a StellarGive relief campaign and invite the community to support it.",
};

export default function CreatePage() {
  return <CreateClient />;
}
