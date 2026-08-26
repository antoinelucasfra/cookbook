// build.mjs — .gram recipes → Quarto site data
// Usage: node build.mjs
import {
  readdirSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join, basename } from "node:path";
import { runPipeline } from "@gram-lang/cli";
import { toHTML, toGanttHTML } from "@gram-lang/renderer";
import { toSnippetHTML } from "./snippet.mjs";
import { load } from "js-yaml";

const DB = (() => {
  const raw = load(readFileSync(".gram/ingredients.yaml", "utf8"));
  return raw.ingredients ?? raw;
})();

const SCALES = [0.5, 1, 2, 3];

const UI = {
  en: {
    portions: "Portions",
    cookStart: "▶ Cook mode",
    cookActive: "Cook mode active — ",
    cookNext: "Next step →",
    cookExit: "Exit",
    overview: "⚡ Quick overview",
    timeline: "⏱ Timeline",
  },
  fr: {
    portions: "Portions",
    cookStart: "▶ Mode cuisine",
    cookActive: "Mode cuisine actif — ",
    cookNext: "Étape suivante →",
    cookExit: "Quitter",
    overview: "⚡ Aperçu rapide",
    timeline: "⏱ Chronologie",
  },
};

function listGram(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listGram(join(dir, e.name))
      : e.name.endsWith(".gram")
        ? [join(dir, e.name)]
        : [],
  );
}

rmSync("site/_includes", { recursive: true, force: true });
rmSync("site/cookbook", { recursive: true, force: true });
rmSync("site/recipes-index.json", { force: true });
mkdirSync("site/_includes", { recursive: true });
mkdirSync("site/_includes/fr", { recursive: true });
mkdirSync("site/cookbook", { recursive: true });
mkdirSync("site/fr/cookbook", { recursive: true });

async function buildPass({
  dir,
  includeDir,
  cookbookDir,
  lang = "en",
  excludeFr = false,
}) {
  const ui = UI[lang] ?? UI.en;
  const index = [];
  for (const file of listGram(dir).filter(
    (f) => !f.includes("bases/") && (!excludeFr || !f.includes("/fr/")),
  )) {
    const scales = {};
    for (const s of SCALES) {
      const { analyzed } = await runPipeline(file, {
        db: DB,
        lang,
        scaleFactor: s === 1 ? undefined : s,
      });
      const r = analyzed.result;
      const clean = {
        ...r,
        meta: { title: r.title, portions: r.meta?.portions },
      };
      scales[String(s)] = {
        html: toHTML(clean, { lang }).replace(/>(?=\d+(?:\.\d+)?g)/g, "&gt;"),
        gantt: toGanttHTML(clean, { lang }),
        snippet: toSnippetHTML(r),
      };
      if (s === 1) {
        var base = r;
      }
    }

    const slug = base.slug;
    const interactive = `<div class="recipe-app" id="app-${slug}">
  <div class="recipe-toolbar">
    <div class="scale-controls" role="group" aria-label="${ui.portions}">
      ${SCALES.map((s) => `<button class="scale-btn" data-scale="${s}">${s === 1 ? "1×" : s + "×"}</button>`).join("")}
    </div>
    <button class="cook-start">${ui.cookStart}</button>
  </div>
  <details class="cook-bar">
    <summary>${ui.cookActive}<span class="cook-step-label"></span></summary>
    <button class="cook-next">${ui.cookNext}</button>
    <button class="cook-exit">${ui.cookExit}</button>
  </details>
  <details class="snippet-box" open>
    <summary>${ui.overview}</summary>
    <div class="snippet-slot">${scales["1"].snippet}</div>
  </details>
  <div class="recipe-render"><div class="gram-preview">${scales["1"].html}</div></div>
  <details class="gantt-details"><summary>${ui.timeline}</summary><div class="gantt-render"></div></details>
  <script type="application/json" class="recipe-data">${JSON.stringify(scales).replace(/</g, "\\u003c")}</script>
</div>`;
    writeFileSync(`${includeDir}/${slug}.html`, interactive);

    // cross-language link resolved after both passes (slugs differ per language)
    const langSwitch = "{{LANGSWITCH}}";
    writeFileSync(
      `${cookbookDir}/${slug}.qmd`,
      `---
title: "${base.title}"
${lang === "fr" ? "lang: fr\n" : ""}category: "${base.meta?.category ?? "Uncategorized"}"
total_time: "${base.metrics?.totalTime ?? 0} min"
portions: "${base.meta?.portions ?? ""}"
---

${langSwitch}\n
{{< recipe ${lang === "fr" ? `fr/` : ``}${slug} >}}
`,
    );

    index.push({
      slug,
      title: base.title,
      category: base.meta?.category ?? "Uncategorized",
      time: base.metrics?.totalTime ?? 0,
      portions: base.meta?.portions ?? "",
      source: base.meta?.source ?? "",
    });
    console.log(`✓ ${lang}/${slug} (${base.metrics?.totalTime ?? "?"} min)`);
  }
  return index;
}

// same source basenames pair 1:1 across recipes/ and recipes/fr/
const slugByBase = (idx, files) =>
  Object.fromEntries(idx.map((r, i) => [files[i], r.slug]));

const enFiles = listGram("recipes")
  .filter((f) => !f.includes("bases/") && !f.includes("/fr/"))
  .map((f) => basename(f, ".gram"));
const en = await buildPass({
  dir: "recipes",
  includeDir: "site/_includes",
  cookbookDir: "site/cookbook",
  excludeFr: true,
});
const frFiles = listGram("recipes/fr")
  .filter((f) => !f.includes("bases/"))
  .map((f) => basename(f, ".gram"));
const fr = await buildPass({
  dir: "recipes/fr",
  includeDir: "site/_includes/fr",
  cookbookDir: "site/fr/cookbook",
  lang: "fr",
});

// resolve {{LANGSWITCH}} placeholders using basename→slug maps
const enSlug = slugByBase(en, enFiles);
const frSlug = slugByBase(fr, frFiles);
for (const [base, s] of Object.entries(frSlug)) {
  const p = `site/fr/cookbook/${s}.qmd`;
  writeFileSync(
    p,
    readFileSync(p, "utf8").replace(
      "{{LANGSWITCH}}",
      `<nav class="lang-switch" aria-label="Language"><span class="lang-opt active" aria-current="true">FR</span><a class="lang-opt" href="../../cookbook/${enSlug[base]}.html" hreflang="en" lang="en">EN</a></nav>`,
    ),
  );
}
for (const [base, s] of Object.entries(enSlug)) {
  const p = `site/cookbook/${s}.qmd`;
  writeFileSync(
    p,
    readFileSync(p, "utf8").replace(
      "{{LANGSWITCH}}",
      `<nav class="lang-switch" aria-label="Language"><a class="lang-opt" href="../fr/cookbook/${frSlug[base]}.html" hreflang="fr" lang="fr">FR</a><span class="lang-opt active" aria-current="true">EN</span></nav>`,
    ),
  );
}

writeFileSync("site/recipes-index.json", JSON.stringify(en, null, 2));
writeFileSync("site/recipes-index-fr.json", JSON.stringify(fr, null, 2));
console.log(`\n${en.length} EN + ${fr.length} FR recipes → site/`);
