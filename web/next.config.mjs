/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Friendly aliases: the console home is /products (the pipeline dashboard).
      { source: "/dashboard", destination: "/products", permanent: false },
      { source: "/admin", destination: "/products", permanent: false },
      { source: "/console", destination: "/products", permanent: false },
    ];
  },
};
export default nextConfig;
