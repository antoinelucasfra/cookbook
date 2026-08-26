// import-parser.mjs — recipe text / JSON-LD → Gram recipe draft
// Self-check: node import-parser.mjs
const UNIT_MAP = {
  tbsp: "15 ml",
  tablespoon: "15 ml",
  tablespoons: "15 ml",
  tsp: "5 ml",
  teaspoon: "5 ml",
  teaspoons: "5 ml",
  cup: "240 ml",
  cups: "240 ml",
  oz: "28 g",
  ounce: "28 g",
  ounces: "28 g",
  lb: "454 g",
  lbs: "454 g",
  pound: "454 g",
  pounds: "454 g",
  pint: "473 ml",
  quart: "946 ml",
  qt: "946 ml",
  gal: "3800 ml",
  gallon: "3800 ml",
  gallons: "3800 ml",
  stick: "113 g",
  sticks: "113 g",
  floz: "30 ml",
};

const QTY = String.raw`(?:\d+\s+\d*\/\d+|\d+\/\d+|\d+[.,]\d+|\d+|[¼½¾⅓⅔⅛⅜⅝⅞])`;
const ING_RE = new RegExp(
  `^(${QTY}(?:\\s*(?:to|-|–)\\s*${QTY})?)\\s*([a-zA-Z.]+)?\\.?\\s+(.+)$`,
);

function fracToNum(s) {
  s = s.trim().replace(",", ".");
  const uni = {
    "¼": 0.25,
    "½": 0.5,
    "¾": 0.75,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
  };
  const mixedUni = s.match(/^(\d+)\s+([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (mixedUni) return Number(mixedUni[1]) + uni[mixedUni[2]];
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return uni[s] ?? Number(s);
}

/** Strip recipe-noise suffixes, stray parens and edge punctuation from a name. */
function cleanName(s) {
  return s
    .replace(
      /\((?:to taste|optional|for (?:garnish|serving)|garnish|divided|plus more)[^)]*\)/gi,
      "",
    )
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[()[\]]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[-–—,.\s]+/, "")
    .replace(/[-–—,.\s]+$/, "")
    .trim();
}

/** Size descriptors are not units: "2 large eggs" has qty 2, no unit. */
const SIZE_RE = /^(large|medium|small|whole)s?$/;

/** Split "carrots, diced" into name + prep note so slugs stay DB-clean. */
function normalizeIng(d) {
  if (SIZE_RE.test(d.unit || "")) d.unit = "";
  const parts = d.name.split(/,\s+/);
  if (parts.length > 1) {
    d.prep = parts.slice(1).join(", ").replace(/\.$/, "");
    d.name = parts[0];
  }
  return d;
}

function slugify(s) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "ingredient"
  );
}

export function toGramQty(qtyStr, unitStr) {
  const qty = qtyStr.trim();
  const unit = (unitStr || "").toLowerCase().replace(/\.$/, "");
  if (UNIT_MAP[unit]) {
    // e.g. "2 cups" → "480 ml"; keep multi-range as-is with mapped unit appended per part is overkill — map the last unit only
    const [num, target] = [qty, UNIT_MAP[unit]];
    const val = num.split(/\s*(?:to|-|–)\s*/).map((p) => {
      const n = fracToNum(p);
      const m = target.match(/^(\d+)\s*(\w+)$/);
      return m ? `${Math.round(n * Number(m[1]))} ${m[2]}` : target;
    });
    return val.join(" to ");
  }
  return `${qty}${unit ? " " + unit : ""}`;
}

/** Parse plain-text ingredient list + instructions into a gram draft. */
export function parseRecipeText(text, titleHint = "") {
  const out = {
    title: titleHint || "",
    ingredients: [],
    steps: [],
    portions: "",
  };
  let mode = null; // null | "ingredients" | "steps"
  for (const raw of text.split(/\r?\n/)) {
    // strip markdown: images, links → text, emphasis
    const line = raw
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim();
    if (!line) continue;
    const h =
      line.match(/^#{1,6}\s+(.*)/) || line.match(/^\*\*(.{2,60}?)\*\*:?\s*$/);
    if (h) {
      const head = h[1].toLowerCase();
      if (
        !out.title &&
        h[1].length < 80 &&
        !/ingredient|instruction|direction|method|step|note/.test(head)
      ) {
        out.title = h[1].trim();
        continue;
      }
      mode = /ingredient/.test(head)
        ? "ingredients"
        : /instruction|direction|method|step|preparation|recipe/.test(head)
          ? "steps"
          : mode;
      continue;
    }
    const inlineIng = line.match(/^ingredients?\s*:\s*(.+)$/i);
    if (inlineIng) {
      // one-liner format: "Ingredients: 200 g flour, 2 eggs"
      mode = "ingredients";
      for (const part of inlineIng[1].split(/[,;]/)) {
        const d = parseLine(part.trim());
        if (d) out.ingredients.push(d);
        else if (part.trim().split(/\s+/).length <= 6)
          out.ingredients.push({ qty: "", unit: "", name: part.trim() });
      }
      continue;
    }
    if (/^(ingredients?|for the .*)\s*:?\s*$/i.test(line)) {
      mode = "ingredients";
      continue;
    }
    if (
      /^(instructions?|directions?|method|steps?|preparation)\s*:?\s*$/i.test(
        line,
      )
    ) {
      mode = "steps";
      continue;
    }
    const cleaned = line
      .replace(/^[-*•]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .trim();
    if (!cleaned) continue;
    if (
      /^(print|share|save|join|subscribe|follow|watch|jump to|advertisement)\b/i.test(
        cleaned,
      )
    )
      continue;
    if (/^(title|name)\s*:\s*/i.test(cleaned)) {
      out.title ||= cleaned.replace(/^(title|name)\s*:\s*/i, "");
      continue;
    }
    const sv = cleaned.match(/^(?:serves|servings?|makes|yield)\s*:?\s*(\d+)/i);
    if (sv) {
      out.portions ||= sv[1];
      continue;
    }
    const m = cleaned.match(ING_RE);
    if (mode === "ingredients" && cleaned.length < 120) {
      if (
        m &&
        /^\d{2,3}$/.test(m[1].trim()) &&
        /^[fc]$/i.test((m[2] || "").toLowerCase())
      ) {
        // "400F oven" is an oven-temp fragment, not an ingredient (≥100 rules out cups)
        continue;
      }
      if (m) {
        out.ingredients.push(
          normalizeIng({
            qty: m[1].trim(),
            unit: (m[2] || "").toLowerCase(),
            name: m[3].replace(/\s*\(.*?\)\s*/g, " ").trim(),
          }),
        );
      } else if (cleaned.split(/\s+/).length <= 6 && !/[.]$/.test(cleaned)) {
        // short qty-less lines like "Salt to taste"; longer prose is not an ingredient
        out.ingredients.push(
          normalizeIng({ qty: "", unit: "", name: cleaned }),
        );
      }
      if (out.ingredients.at(-1)?.name === cleaned || m) continue;
      // prose under Ingredients header — fall through to step handling
    }
    if (mode !== "steps" && m && cleaned.length < 120) {
      out.ingredients.push(
        normalizeIng({
          qty: m[1].trim(),
          unit: (m[2] || "").toLowerCase(),
          name: m[3].replace(/\s*\(.*?\)\s*/g, " ").trim(),
        }),
      );
      continue;
    }
    // prose after the ingredient list counts as a step; intro prose before
    // any section is story text — never a step
    if (
      mode === "steps" ||
      (out.ingredients.length &&
        (cleaned.length >= 120 || /[.;]$/.test(cleaned)))
    ) {
      out.steps.push(cleaned);
    } else if (
      !out.ingredients.length &&
      !out.title &&
      !/[.;]$/.test(cleaned)
    ) {
      out.title = cleaned;
    }
  }
  if (titleHint) out.title = titleHint;
  return out;
}

/** Extract a schema.org Recipe from an HTML document string, or null. */
export function extractJsonLdRecipe(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(
        el.textContent.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, ""),
      );
      const queue = Array.isArray(data) ? data : [data];
      while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== "object") continue;
        if ((node["@type"] ?? []).toString().toLowerCase().includes("recipe"))
          return node;
        queue.push(...Object.values(node).flat());
      }
    } catch {
      /* malformed ld+json — try next block */
    }
  }
  return null;
}

/** JSON-LD Recipe object → parsed draft shape. */
export function jsonLdToDraft(r) {
  const ingredients = (r.recipeIngredient ?? r.ingredients ?? []).map((s) => {
    const d = typeof s === "string" ? parseLine(s) : null;
    return d ?? { qty: "", unit: "", name: cleanName(String(s)) };
  });
  let steps = [];
  const walk = (n) => {
    if (typeof n === "string") steps.push(n.replace(/<[^>]*>/g, "").trim());
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object")
      walk(n.itemListElement ?? n.text ?? n.name);
  };
  walk(r.recipeInstructions ?? []);
  steps = steps.filter(Boolean);
  return {
    title: (typeof r.name === "string" ? r.name : "") || "",
    ingredients,
    steps,
    meta: {
      // yields arrive messy ("12 servings, 12 falafel") — first number wins
      portions: String(r.recipeYield ?? "").match(/\d+/)?.[0] ?? "",
      time: r.totalTime ?? "",
    },
  };
}

function parseLine(line) {
  const m = line.match(ING_RE);
  if (!m) return null;
  return normalizeIng({
    qty: m[1].trim(),
    unit: (m[2] || "").toLowerCase(),
    name: cleanName(m[3]),
  });
}

/**
 * Static confidence pass: tags for parts the pure-static parser could not
 * handle confidently — i.e. where an AI translation pass
 * (`npx gram import <url> --pick-model`) would help.
 */
export function aiNeededTags(draft) {
  const tags = [];
  if (!draft.title) tags.push("No title detected");
  if (draft.ingredients.length) {
    const noQty = draft.ingredients.filter((i) => !i.qty).length;
    if (noQty)
      tags.push(`${noQty} ingredient(s) without a quantity (e.g. "to taste")`);
    const METRIC =
      /^(g|kg|mg|ml|l|cl|dl|fl\s*oz|pinch|clove|cloves|slice|slices|can|bunch|handful|large|medium|small|whole)s?$/;
    const unmapped = [
      ...new Set(
        draft.ingredients
          .filter(
            (i) => i.qty && i.unit && !UNIT_MAP[i.unit] && !METRIC.test(i.unit),
          )
          .map((i) => i.unit),
      ),
    ];
    if (unmapped.length)
      tags.push(`Unfamiliar unit(s): ${unmapped.join(", ")}`);
    // mid-step times the trailing-only timer extractor can't place (~{} added later)
    const timed = draft.steps.filter(
      (s) =>
        !s.includes("~{") && /\d+\s*(hours?|hrs?|minutes?|mins?)\b/i.test(s),
    ).length;
    if (timed)
      tags.push(`${timed} step(s) contain times that need a ~{N min} timer`);
  } else tags.push("No ingredient list detected — AI extraction recommended");
  if (!draft.steps.length)
    tags.push("No instruction steps detected — AI extraction recommended");
  return tags;
}

/** Extraction-level failure: static pass likely produced garbage. */
export function hasHardGaps(draft) {
  return !draft.title || !draft.ingredients.length || !draft.steps.length;
}

/** °F → °C inside step text ("350°F" or bare "350F" → "177 °C"). */
function convertTemps(s) {
  return s.replace(/(\d{2,3})\s*(?:°\s*)?[Ff]\b(?!\w)/g, (_, f) => {
    const c = Math.round(((Number(f) - 32) * 5) / 9);
    return `${c} °C`;
  });
}

/** Trailing duration in a step ("...for 35 minutes.") → gram timer suffix. */
const TIME_RE =
  /[,;]?\s*(?:for |about )?(\d+)(?:\s*(?:to|-|–)\s*(\d+))?\s*(hours?|hrs?|h|minutes?|mins?|min|seconds?|secs?)\.?\s*$/i;

function extractTimer(s) {
  if (s.includes("~{")) return [s, ""];
  const m = s.match(TIME_RE);
  if (!m) return [s, ""];
  const n = Math.max(Number(m[1]), Number(m[2] ?? m[1]));
  const unit = m[3].toLowerCase();
  const timer = /^h/.test(unit)
    ? `~{${n * 60} min}`
    : /^min/.test(unit) || unit === "m"
      ? `~{${n} min}`
      : `~{${n} s}`;
  return [
    s
      .slice(0, m.index)
      .trimEnd()
      .replace(/[,;.]$/, ""),
    timer,
  ];
}

/** Wrap the first cookware mention in gram syntax: "a large pot" → "a large #pot{}". */
const COOKWARE_RE =
  /\b(dutch oven|baking sheet|baking dish|saucepan|skillet|wok|mixing bowl|pot|pan|bowl|oven)\b/i;

function addCookware(s) {
  if (s.includes("#")) return s;
  const m = s.match(COOKWARE_RE);
  return m
    ? s.replace(m[0], m[0].replace(m[1], `#${m[1].toLowerCase()}{}`))
    : s;
}

/** Draft → full .gram file source. */
export function draftToGram(draft, meta = {}) {
  const title = draft.title || meta.title || "Imported recipe";
  const portions = draft.portions || meta.portions || "";
  const tags = aiNeededTags(draft);
  const tagComment = hasHardGaps(draft)
    ? `# review: ${tags.join("; ")}\n# tip: npx gram import <url> --pick-model for an AI-assisted translation\n`
    : "";
  const ingLines = draft.ingredients.map((i) => {
    const q = i.qty ? `{${toGramQty(i.qty, i.unit)}}` : "{}";
    return `- @${slugify(i.name)}${q}${i.prep ? `(${i.prep})` : ""} — ${i.name}`;
  });
  const stepLines = draft.steps.map((s0, idx) => {
    const [text, timer] = extractTimer(convertTemps(s0));
    const body = addCookware(text);
    return `[Step ${idx + 1}] ${timer ? `${body}, ${timer}` : body}`;
  });
  return `${tagComment}---
title: ${title}
portions: ${portions || 4}
category: Imported
source: "${meta.source ?? ""}"
---

## Ingredients

${ingLines.join("\n")}

## Steps

${stepLines.join("\n\n")}
`;
}
