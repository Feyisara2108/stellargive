import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StellarGive",
    short_name: "StellarGive",
    description: "Transparent relief campaigns on Stellar.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8faf5",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
