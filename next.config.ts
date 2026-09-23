import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["playwright", "sharp", "archiver", "ffmpeg-static"],
};

export default nextConfig;
