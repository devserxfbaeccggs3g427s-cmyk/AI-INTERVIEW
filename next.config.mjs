/** @type {import('next').NextConfig} */
const nextConfig = {
  // NFR-5: Persistent disk required for node:sqlite. Force Node.js runtime everywhere.
  // Per FR-12 and NFR-12, no edge runtime is allowed.
  experimental: {
    // Allow large streaming bodies
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Webpack: silence warnings for the optional dependency native bindings inside pdf-parse.
  webpack: (config) => {
    config.externals = config.externals || [];
    // Make sure we don't bundle pdf-parse into the client.
    config.externals.push({ "pdf-parse": "commonjs pdf-parse" });
    return config;
  },
};

export default nextConfig;
