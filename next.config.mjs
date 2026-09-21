/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Landing page is a self-contained static export served at the site root.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/landing.html" },
        { source: "/sponsor", destination: "/sponsor.html" },
      ],
    };
  },
};

export default nextConfig;
