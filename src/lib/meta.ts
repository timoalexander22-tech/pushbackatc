export const pageHead = (title: string, description: string) => () => ({
  meta: [
    { title: `${title} · Virtual Ground Crew Pro` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} · Virtual Ground Crew Pro` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ],
});
