import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GRAAFIN Marathon Coach",
    short_name: "GRAAFIN",
    description: "Mobile-first marathon training cockpit and persistent AI coach.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f7f2",
    theme_color: "#0f172a",
    orientation: "portrait",
    icons: [
      {
        src: "/next.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/globe.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  };
}
