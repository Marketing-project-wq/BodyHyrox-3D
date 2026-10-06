/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Athlete pages may embed only the official YouTube player (stage frame
  // media lightbox); every other directive stays as before.
  async headers() {
    return [
      {
        source: "/atlet/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-src 'self' https://www.youtube-nocookie.com" }],
      },
    ];
  },
  // Landing page is a self-contained static export served at the site root.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/landing.html" }],
    };
  },
};

export default nextConfig;
