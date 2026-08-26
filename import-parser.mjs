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

function toGramQty(qtyStr, unitStr) {
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
  const out = { title: titleHint || "", ingredients: [], steps: [], portions: "" };
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
      if (m) {
        out.ingredients.push({
          qty: m[1].trim(),
          unit: (m[2] || "").toLowerCase(),
          name: m[3].replace(/\s*\(.*?\)\s*/g, " ").trim(),
        });
      } else if (cleaned.split(/\s+/).length <= 6 && !/[.]$/.test(cleaned)) {
        // short qty-less lines like "Salt to taste"; longer prose is not an ingredient
        out.ingredients.push({ qty: "", unit: "", name: cleaned });
      }
      if (out.ingredients.at(-1)?.name === cleaned || m) continue;
      // prose under Ingredients header — fall through to step handling
    }
    if (mode !== "steps" && m && cleaned.length < 120) {
      out.ingredients.push({
        qty: m[1].trim(),
        unit: (m[2] || "").toLowerCase(),
        name: m[3].replace(/\s*\(.*?\)\s*/g, " ").trim(),
      });
      continue;
    }
    // prose after the ingredient list counts as a step; intro prose before
    // any section is story text — never a step
    if (
      mode === "steps" ||
      (out.ingredients.length && (cleaned.length >= 120 || /[.;]$/.test(cleaned)))
    ) {
      out.steps.push(cleaned);
    } else if (!out.ingredients.length && !out.title && !/[.;]$/.test(cleaned)) {
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
    return d ?? { qty: "", unit: "", name: String(s) };
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
      portions: r.recipeYield ?? "",
      time: r.totalTime ?? "",
    },
  };
}

function parseLine(line) {
  const m = line.match(ING_RE);
  if (!m) return null;
  return {
    qty: m[1].trim(),
    unit: (m[2] || "").toLowerCase(),
    name: m[3].replace(/\s*\(.*?\)\s*/g, " ").trim(),
  };
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
  } else tags.push("No ingredient list detected — AI extraction recommended");
  if (!draft.steps.length)
    tags.push("No instruction steps detected — AI extraction recommended");
  return tags;
}

/** Extraction-level failure: static pass likely produced garbage. */
export function hasHardGaps(draft) {
  return !draft.title || !draft.ingredients.length || !draft.steps.length;
}

/** Draft → full .gram file source. */
export function draftToGram(draft, meta = {}) {
  const title = draft.title || meta.title || "Imported recipe";
  const portions = meta.portions || "";
  const tags = aiNeededTags(draft);
  const tagComment = hasHardGaps(draft)
    ? `# review: ${tags.join("; ")}\n# tip: npx gram import <url> --pick-model for an AI-assisted translation\n`
    : "";
  const ingLines = draft.ingredients.map((i) => {
    const q = i.qty ? `{${toGramQty(i.qty, i.unit)}}` : "{}";
    return `- @${slugify(i.name)}${q} — ${i.name}`;
  });
  const stepLines = draft.steps.map((s, idx) => `[Step ${idx + 1}] ${s}`);
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

// --- self-check ---
if (
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("import-parser.mjs")
) {
  const assert = (cond, msg) => {
    if (!cond) {
      console.error("FAIL:", msg);
      process.exitCode = 1;
    }
  };

  const d = parseRecipeText(`# Vegan Pad Thai

## Ingredients

- 112 g dry rice noodles
- 2 cups spinach
- 3 tbsp soy sauce
- 1 ½ oz peanuts
- Salt to taste

## Instructions

1. Soak the noodles.
2. Stir fry everything. Serve hot.`);
  assert(d.title === "Vegan Pad Thai", "title");
  assert(
    d.ingredients.length === 5,
    `ingredients count ${d.ingredients.length}`,
  );
  assert(
    d.ingredients[0].qty === "112" &&
      d.ingredients[0].unit === "g" &&
      d.ingredients[0].name === "dry rice noodles",
    JSON.stringify(d.ingredients[0]),
  );
  assert(
    toGramQty("2", "cups") === "480 ml",
    `cup map ${toGramQty("2", "cups")}`,
  );
  assert(toGramQty("1 ½", "oz") === "42 g", `oz map ${toGramQty("1 ½", "oz")}`);
  assert(d.steps.length === 2, `steps ${d.steps.length}`);

  const gram = draftToGram(d, { portions: 2, source: "https://example.com" });
  assert(gram.includes("title: Vegan Pad Thai"), "gram title");
  assert(
    gram.includes("@dry-rice-noodles{112 g}"),
    `gram ing: ${gram.split("\n")[12]}`,
  );
  assert(gram.includes("@spinach{480 ml}"), "gram cup conversion");
  assert(gram.includes("[Step 1] Soak"), "gram step");

  const html = `<html><script type="application/ld+json">{"@graph":[{"@type":"Article"},{"@type":"Recipe","name":"Tofu Curry","recipeYield":"4","recipeIngredient":["200 g tofu","1 cup rice"],"recipeInstructions":[{"text":"Fry."},{"text":"Simmer 10 min."}]}</script></html>`;
  // DOMParser not available in bare node — test jsonLd path via jsdom-free fallback:
  if (typeof DOMParser === "undefined") {
    console.log("(DOMParser unavailable in node — skipping JSON-LD check)");
  } else {
    const r = extractJsonLdRecipe(html);
    assert(r?.name === "Tofu Curry", "jsonld name");
    const d2 = jsonLdToDraft(r);
    assert(d2.ingredients.length === 2, "jsonld ings");
    assert(d2.steps[0] === "Fry.", "jsonld steps");
  }

  // intro prose must not leak into steps
  const cake = parseRecipeText(`Best Chocolate Cake

This cake has been in my family for years. It is amazing.

Serves 8 | Prep 20 min

Ingredients:
- 250 g flour
- 2 large eggs
- pinch of salt

Instructions:
Preheat oven to 180°C.
Mix dry ingredients.`);
  assert(cake.title === "Best Chocolate Cake", `cake title ${cake.title}`);
  assert(
    !cake.steps.some((s) => /family/.test(s)),
    `intro prose leaked into steps: ${cake.steps}`,
  );
  assert(cake.steps.length === 2, `cake steps ${cake.steps.length}`);
  assert(cake.portions === "8", `serves parsed ${cake.portions}`);
  assert(
    !aiNeededTags(cake).some((t) => /unfamiliar/i.test(t)),
    `large eggs false-positive: ${aiNeededTags(cake)}`,
  );
  // compact one-liner ingredient format
  const compact = parseRecipeText(
    "Pancakes\nIngredients: 200 g flour, 2 eggs, 300 ml milk\nMix all. Fry in pan.",
  );
  assert(compact.ingredients.length === 3, `compact ings ${JSON.stringify(compact.ingredients)}`);
  assert(compact.steps.length === 1, `compact steps ${compact.steps.length}`);

  // AI-needed tagging
  assert(!hasHardGaps(d), "clean draft has no hard gaps");
  const dTags = aiNeededTags(d);
  assert(
    dTags.some((t) => /quantity/.test(t)),
    `salt-to-taste flagged soft: ${dTags}`,
  );
  const messy = parseRecipeText(
    "Random prose paragraph about my grandmother and food memories.",
  );
  const mt = aiNeededTags(messy);
  assert(hasHardGaps(messy), "messy draft flagged hard");
  assert(
    mt.some((t) => /ingredient/i.test(t)),
    `messy draft tagged for ingredients: ${mt}`,
  );
  assert(
    mt.some((t) => /instruction/i.test(t)) ||
      mt.some((t) => /ingredient/i.test(t)),
    `messy draft tagged for extraction gaps: ${mt}`,
  );
  const noSteps = parseRecipeText("# Soup\n\n## Ingredients\n\n- 200 g tofu");
  assert(
    aiNeededTags(noSteps).some((t) => /instruction/i.test(t)),
    `missing steps flagged: ${aiNeededTags(noSteps)}`,
  );
  assert(
    draftToGram(messy).includes("# review:"),
    "tags emitted as review comment in .gram",
  );
  assert(
    !draftToGram(d).includes("# review:"),
    "clean draft has no review comment",
  );

  console.log(
    process.exitCode ? "SELF-CHECK FAILED" : "import-parser self-check OK",
  );
}
