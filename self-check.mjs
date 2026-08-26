// self-check.mjs — asserts for import-parser; run: node self-check.mjs
import {
  parseRecipeText,
  extractJsonLdRecipe,
  jsonLdToDraft,
  draftToGram,
  aiNeededTags,
  hasHardGaps,
  toGramQty,
} from "./import-parser.mjs";

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
assert(d.ingredients.length === 5, `ingredients count ${d.ingredients.length}`);
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
assert(
  compact.ingredients.length === 3,
  `compact ings ${JSON.stringify(compact.ingredients)}`,
);
assert(compact.steps.length === 1, `compact steps ${compact.steps.length}`);

// timing extraction + temp conversion in gram output
const timed = draftToGram({
  title: "T",
  ingredients: [{ qty: "", unit: "", name: "x" }],
  steps: [
    "Bake for 35 minutes.",
    "Preheat oven to 350°F.",
    "Chill the dough 2 hours.",
    "Simmer about 30 seconds.",
  ],
});
assert(
  timed.includes("[Step 1] Bake, ~{35 min}"),
  `timer: ${timed.match(/\[Step 1\].*/)?.[0]}`,
);
assert(timed.includes("177 °C"), `temp: ${timed.match(/\[Step 2\].*/)?.[0]}`);
assert(
  timed.includes("[Step 3] Chill the dough, ~{120 min}"),
  `hours timer: ${timed.match(/\[Step 3\].*/)?.[0]}`,
);
assert(
  timed.includes("~{30 s}"),
  `seconds timer: ${timed.match(/\[Step 4\].*/)?.[0]}`,
);

// new unit mappings
assert(toGramQty("1", "gal") === "3800 ml", `gal ${toGramQty("1", "gal")}`);
assert(
  toGramQty("2", "sticks") === "226 g",
  `stick ${toGramQty("2", "sticks")}`,
);

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

// cookware wrapping (first mention per step, skipped if step already has one)
assert(
  timed.includes("Preheat #oven{} to"),
  `cookware: ${timed.match(/\[Step 2\].*/)?.[0]}`,
);
const cw = draftToGram({
  title: "T",
  ingredients: [],
  steps: ["Fry in a large skillet until golden."],
});
assert(
  cw.includes("large #skillet{}"),
  `cookware size: ${cw.match(/\[Step 1\].*/)?.[0]}`,
);

// cleanName strips stray parens / "to taste" noise
const messyIng = jsonLdToDraft({
  name: "X",
  recipeYield: "12 servings, 12 falafel",
  recipeIngredient: ["2 (15-oz) cans chickpeas )", "Sea salt (to taste)"],
  recipeInstructions: ["Do it."],
});
assert(
  messyIng.meta.portions === "12",
  `portions norm ${messyIng.meta.portions}`,
);
assert(
  messyIng.ingredients[0].name === "cans chickpeas",
  `stray paren name: "${messyIng.ingredients[0].name}"`,
);
assert(
  messyIng.ingredients[1].name === "Sea salt" && !messyIng.ingredients[1].qty,
  `to-taste name: "${messyIng.ingredients[1].name}"`,
);

console.log(
  process.exitCode ? "SELF-CHECK FAILED" : "import-parser self-check OK",
);

// P0 regression cases: portions from draft, size descriptors, prep split, bare °F, temp-fragment lines
{
  const d = parseRecipeText(
    "Soup\n\nServes 6\n\nIngredients:\n- 2 large eggs\n- 2 medium carrots, diced\n- 400F oven\n\nInstructions:\n1. Bake at 400F for 15 minutes.",
  );
  const g = draftToGram(d);
  assert(
    g.includes("portions: 6"),
    `draft portions: ${g.match(/portions: \d+/)?.[0]}`,
  );
  assert(
    g.includes("@eggs{2}"),
    `size unit: ${g.match(/@eggs\{[^}]*\}/)?.[0]}`,
  );
  assert(
    g.includes("@carrots{2}(diced)"),
    `prep split: ${g.match(/@carrots.*/)?.[0]}`,
  );
  assert(
    !d.ingredients.some((i) => i.name === "oven"),
    "temp fragment line became ingredient",
  );
  assert(
    g.includes("204 °C"),
    `bare °F convert: ${g.match(/\[Step 1\].*/)?.[0]}`,
  );
  const tags = aiNeededTags({
    title: "T",
    ingredients: [{ qty: "1", unit: "cup", name: "rice" }],
    steps: ["Simmer for 30 minutes, then rest."],
  });
  assert(
    tags.some((t) => t.includes("timer")),
    `unextracted-time tag: ${JSON.stringify(tags)}`,
  );
}
