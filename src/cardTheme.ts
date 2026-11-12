import type { CSSProperties } from "react";

// Each title gets its own coordinated matte, paper, and two visible card layers.
const palettes: Record<string, [string, string, string, string]> = {
  "demo:grand-budapest": ["#d39aa5", "#86a397", "#fff0dd", "#eddbca"],
  "demo:moonrise": ["#cc8b45", "#7c916e", "#fff1ce", "#eadab7"],
  "demo:amelie": ["#bd6045", "#d4b65d", "#edf0dc", "#d7dfc8"],
  "demo:life-aquatic": ["#d27450", "#d9b54f", "#e9f0e4", "#c7dad4"],
  "demo:past-lives": ["#6d9389", "#d3a36f", "#f9e7da", "#ead5c7"],
  "demo:over-garden": ["#956342", "#65856c", "#f3e5c5", "#d9d5b9"],
  "demo:darjeeling": ["#548c88", "#ca7947", "#ffebcf", "#e8d2af"],
  "demo:severance": ["#be9b7c", "#60868e", "#eaf0e8", "#cfded8"],
};
export function cardTheme(id?: string): CSSProperties {
  let hash = 2166136261;
  for (const char of id ?? "filmer")
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash >>>= 0;
  const extra: [string, string, string, string][] = [
    ["#b87359", "#8fa998", "#fff0db", "#e9d7be"],
    ["#7b9c9c", "#ddbb6c", "#eff1df", "#d7e2d6"],
    ["#b98492", "#c4aa70", "#f8e5dd", "#e8d2c5"],
    ["#c27f4e", "#6b9193", "#fff0ce", "#e7d4b6"],
  ];
  const all = [...Object.values(palettes), ...extra];
  const [a, b, paper, matte] = palettes[id ?? ""] ?? all[hash % all.length];
  const patterns = [
    [
      "radial-gradient(circle,#fff9ed66 0 1.1px,transparent 1.6px)",
      "12px 12px",
    ],
    [
      "repeating-linear-gradient(90deg,#fff9ed62 0 3px,transparent 3px 13px)",
      "auto",
    ],
    [
      "repeating-linear-gradient(45deg,#fff9ed63 0 3px,transparent 3px 15px)",
      "auto",
    ],
    [
      "linear-gradient(90deg,#fff9ed55 2px,transparent 2px),linear-gradient(#fff9ed55 2px,transparent 2px)",
      "18px 18px,18px 18px",
    ],
    ["radial-gradient(circle,#fff9ed77 0 1.6px,transparent 2px)", "19px 19px"],
  ];
  const first = patterns[hash % patterns.length],
    second = patterns[(hash + 2) % patterns.length];
  return {
    "--card-layer-a": a,
    "--card-layer-b": b,
    "--card-paper": paper,
    "--card-matte": matte,
    "--card-pattern-a": first[0],
    "--card-pattern-size-a": first[1],
    "--card-pattern-b": second[0],
    "--card-pattern-size-b": second[1],
  } as CSSProperties;
}
