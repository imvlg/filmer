export interface TitleContext {
  summary: string;
  url: string;
}

const cache = new Map<string, Promise<TitleContext | null>>();

async function findContext(imdbId: string): Promise<TitleContext | null> {
  const query = `SELECT ?article WHERE {
    ?item wdt:P345 "${imdbId}".
    ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>.
  } LIMIT 1`;
  const signal = AbortSignal.timeout(7500);
  const lookup = await fetch(`https://query.wikidata.org/sparql?${new URLSearchParams({ format: "json", query })}`, { signal });
  if (!lookup.ok) throw new Error("Title lookup unavailable");
  const match = await lookup.json() as { results?: { bindings?: { article?: { value: string } }[] } };
  const article = match.results?.bindings?.[0]?.article?.value;
  if (!article) return null;
  const url = new URL(article);
  if (url.origin !== "https://en.wikipedia.org" || !url.pathname.startsWith("/wiki/")) return null;
  const options = new URLSearchParams({
    action: "query", prop: "extracts", exintro: "1", explaintext: "1", exchars: "1100",
    titles: decodeURIComponent(url.pathname.slice(6)), redirects: "1", format: "json", formatversion: "2", origin: "*",
  });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${options}`, { signal });
  if (!response.ok) throw new Error("Article context unavailable");
  const result = await response.json() as { query?: { pages?: { extract?: string }[] } };
  const summary = result.query?.pages?.[0]?.extract?.trim();
  return summary ? { summary, url: url.href } : null;
}

export function getTitleContext(imdbId: string): Promise<TitleContext | null> {
  if (!/^tt\d{5,12}$/.test(imdbId)) return Promise.resolve(null);
  let pending = cache.get(imdbId);
  if (!pending) {
    pending = findContext(imdbId).catch(() => {
      cache.delete(imdbId);
      return null;
    });
    cache.set(imdbId, pending);
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
  }
  return pending;
}
