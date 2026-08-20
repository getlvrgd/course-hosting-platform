import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Course art and lesson thumbnails are stored as their own bytes rather than as a
     * link, so saving a course carries the image in the request body. The 1MB default
     * would refuse one before the action ever saw it.
     *
     * Videos and attachments do *not* come through here — they go to blob storage from
     * the browser, precisely so a 2GB upload never has to fit in a server action.
     */
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
