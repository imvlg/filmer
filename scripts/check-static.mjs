import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
const root = new URL("../dist/", import.meta.url);
let bytes = 0;
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) { await inspect(url); continue; }
    bytes += (await stat(url)).size;
    assert(!/\.(sqlite|db)(-|$)/i.test(entry.name), "Do not publish the local database");
    if (/\.(js|html)$/.test(entry.name)) {
      const text = await readFile(url, "utf8");
      assert(!/127\.0\.0\.1:8787|localhost:8787|\/api\/(poster|candidates|titles|status)/.test(text), `Local API dependency: ${entry.name}`);
    }
  }
}
await inspect(root);
assert(bytes < 1_000_000_000, "GitHub Pages published sites must be smaller than 1 GB");
const html = await readFile(new URL("index.html", root), "utf8");
assert(!/(src|href)="\/assets\//.test(html), "Assets must work under a repository subpath");
console.log(`Static Pages build verified: ${(bytes / 1_000_000).toFixed(2)} MB, relative assets, no database or local API`);
