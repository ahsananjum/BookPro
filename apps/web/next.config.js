/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ["@bookpro/ui", "@bookpro/contracts", "@bookpro/validation"],
    async redirects() {
        return [
            { source: "/calendar", destination: "/app/calendar", permanent: true },
            { source: "/crm", destination: "/app/customers", permanent: true },
            { source: "/commissions", destination: "/app/commissions", permanent: true },
            { source: "/waitlist", destination: "/app/waitlist", permanent: true },
            { source: "/analytics", destination: "/app/analytics", permanent: true },
            { source: "/optimizer", destination: "/app/optimizer", permanent: true },
            { source: "/ai", destination: "/app/ai", permanent: true },
            { source: "/integrations/google", destination: "/app/integrations/google", permanent: true },
            { source: "/settings/audit", destination: "/app/settings/audit", permanent: true },
            { source: "/staff", destination: "/workspace", permanent: true },
            { source: "/admin/platform", destination: "/platform", permanent: true },
            { source: "/book/:slug", destination: "/:slug/book", permanent: true },
        ];
    },
    async rewrites() {
        return [
            {
                source: "/api/v1/:path*",
                destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:4000/api/v1"}/:path*`,
            },
        ];
    },
    async headers() {
        return [{
            source: "/(.*)",
            headers: [
                { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.stripe.com; frame-src 'self' https://js.stripe.com https://*.stripe.com; connect-src 'self' http://localhost:4000 http://127.0.0.1:4000 https://api.stripe.com https://*.stripe.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self' https://checkout.stripe.com; object-src 'none'" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
            ],
        }];
    },
};

module.exports = nextConfig;
