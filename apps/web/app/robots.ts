import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://bookpro-fawn.vercel.app").replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/login",
          "/register",
          "/register-customer",
          "/book/*",
          "/customer/invite",
        ],
        disallow: [
          "/api/*",
          "/app/*",
          "/admin/*",
          "/workspace/*",
          "/settings/*",
          "/account/*",
          "/_next/*",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
