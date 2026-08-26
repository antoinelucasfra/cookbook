// fetch-batch.mjs — batch-fetch recipe URLs from sources.txt into .gram drafts
// Usage: node fetch-batch.mjs [sources.txt]
// Drafts land in recipes/_drafts/<slug>.gram; review before moving into recipes/.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  parseRecipeText,
  jsonLdToDraft,
  draftToGram,
  hasHardGaps,
} from "./import-parser.mjs";

const LIST = process.argv[2] ?? "sources.txt";
const OUT = "recipes/_drafts";

/** Pull every application/ld+json block via regex (no DOM in bare node). */
function extractJsonLd(html) {
  const found = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      found.push(JSON.parse(m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "")));
    } catch {
      /* malformed block — skip */
    }
  }
  return found;
}

function findRecipe(nodes) {
  const queue = Array.isArray(nodes) ? [...nodes] : [nodes];
  while (queue.length) {
    const n = queue.shift();
    if (!n || typeof n !== "object") continue;
    if ((n["@type"] ?? []).toString().toLowerCase().includes("recipe"))
      return n;
    queue.push(...Object.values(n).flat());
  }
  return null;
}

async function fetchPage(url) {
  // direct first (node has no CORS); jina markdown as fallback for blocked hosts
  for (const u of [url, `https://r.jina.ai/${url}`]) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.text();
    } catch {
      /* try next */
    }
  }
  throw new Error("fetch failed");
}

function slugify(s) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "recipe"
  );
}

mkdirSync(OUT, { recursive: true });
const lines = readFileSync(LIST, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

for (const url of lines) {
  const slug = slugify(
    url.replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, ""),
  );
  const dest = `${OUT}/${slug}.gram`;
  if (existsSync(dest)) {
    console.log(`skip ${slug}`);
    continue;
  }
  try {
    const page = await fetchPage(url);
    let draft;
    if (page.includes("ld+json")) {
      const r = findRecipe(extractJsonLd(page));
      if (r) draft = jsonLdToDraft(r);
    }
    if (!draft || hasHardGaps(draft))
      draft = parseRecipeText(
        page,
        decodeURIComponent(slug).replace(/-/g, " "),
      );
    const gram = draftToGram(draft, {
      source: url,
      portions: draft.meta?.portions ?? draft.portions,
    });
    writeFileSync(dest, gram);
    console.log(
      `ok ${slug}: ${draft.ingredients.length} ing / ${draft.steps.length} steps`,
    );
  } catch (e) {
    console.log(`FAIL ${url}: ${e.message}`);
  }
}
