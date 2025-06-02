import { MetadataRoute } from "next";

// REF: https://github.com/vercel/next.js/issues/68667
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
  };
}
