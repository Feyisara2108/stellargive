import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "stellarGive | Relief Grant Platform",
    short_name: "stellarGive",
    description: "A decentralized donation platform built on Stellar",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
