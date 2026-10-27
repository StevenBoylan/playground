import type { MetadataRoute } from "next";

/** A private demo: ask search engines not to index any of it. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
