import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: { position: "bottom-right" },
  output: "standalone",
  serverExternalPackages: ["playwright", "sharp", "archiver", "ffmpeg-static"],
};

export default nextConfig;
