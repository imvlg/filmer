import { mkdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const titles = {
  "demo:grand-budapest": ["tt2278388", "The Grand Budapest Hotel"],
  "demo:moonrise": ["tt1748122", "Moonrise Kingdom"],
  "demo:amelie": ["tt0211915", "Amélie"],
  "demo:life-aquatic": ["tt0362270", "The Life Aquatic with Steve Zissou"],
  "demo:past-lives": ["tt13238346", "Past Lives"],
  "demo:over-garden": ["tt3718778", "Over the Garden Wall"],
  "demo:darjeeling": ["tt0838221", "The Darjeeling Limited"],
  "demo:severance": ["tt11280740", "Severance"],
};
// IMDb's public autocomplete feed, not the subscription-based IMDb GraphQL API.
// Run at authoring/build time: the feed does not provide browser CORS headers.
const entries = [];
await mkdir(new URL("public/posters/", root), { recursive: true });
for (const [movieId, [imdbId, title]] of Object.entries(titles)) {
  const metadataUrl = `https://v3.sg.media-imdb.com/suggestion/t/${imdbId}.json`;
  const response = await fetch(metadataUrl, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(`${title}: IMDb metadata ${response.status}`);
  const data = await response.json();
  const match = data.d?.find((item) => item.id === imdbId);
  const url = match?.i?.imageUrl;
  if (!url || new URL(url).hostname !== "m.media-amazon.com")
    throw new Error(`No verified IMDb poster for ${title}`);
  const image = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!image.ok || !image.headers.get("content-type")?.startsWith("image/"))
    throw new Error(`${title}: invalid poster response`);
  const fallback = `posters/${imdbId}.jpg`;
  await writeFile(
    new URL(`public/${fallback}`, root),
    Buffer.from(await image.arrayBuffer()),
  );
  entries.push([
    movieId,
    {
      imdbId,
      title: match.l,
      src: url,
      fallback,
      width: match.i.width,
      height: match.i.height,
      source: `https://www.imdb.com/title/${imdbId}/`,
      metadataUrl,
    },
  ]);
  process.stdout.write(`Verified ${imdbId}: ${match.l}\n`);
}
// Update the manifest only after every title has been verified.
await writeFile(
  new URL("src/imdb-posters.json", root),
  JSON.stringify(Object.fromEntries(entries), null, 2) + "\n",
);
await writeFile(
  new URL("public/posters/imdb-sources.json", root),
  JSON.stringify(
    {
      retrievedAt: new Date().toISOString(),
      posters: Object.fromEntries(entries),
    },
    null,
    2,
  ) + "\n",
);
