import { getPostContents } from "@/src/features/content/api";

export const dynamic = "force-static";

const DOMAIN_URL = "https://byoo-log.com";

export default async function sitemap() {
  const postContents = await getPostContents();

  return [
    {
      url: DOMAIN_URL,
      lastModified: new Date(),
    },
    ...postContents.map(({ id }) => ({
      url: `${DOMAIN_URL}/${id}/`,
      lastModified: new Date(),
    })),
  ];
}
