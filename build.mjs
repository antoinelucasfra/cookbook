// build.mjs — .gram recipes → Quarto site data
// Usage: node build.mjs
import {
  readdirSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
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
        html: toHTML(clean),
        gantt: toGanttHTML(clean),
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
  <div class="recipe-render"></div>
  <details class="gantt-details"><summary>${ui.timeline}</summary><div class="gantt-render"></div></details>
  <script type="application/json" class="recipe-data">${JSON.stringify(scales).replace(/</g, "\\u003c")}</script>
</div>`;
    writeFileSync(`${includeDir}/${slug}.html`, interactive);

    const langSwitch =
      lang === "fr"
        ? `[🇬🇧 English version](../../cookbook/${slug}.html){.lang-switch}`
        : `[🇫🇷 Version française](../fr/cookbook/${slug}.html){.lang-switch}`;
    writeFileSync(
      `${cookbookDir}/${slug}.qmd`,
      `---
title: "${base.title}"
${lang === "fr" ? "lang: fr\n" : ""}category: "${base.meta?.category ?? "Uncategorized"}"
total_time: "${base.metrics?.totalTime ?? 0} min"
portions: "${base.meta?.portions ?? ""}"
---

${langSwitch}\n
{{< recipe ${slug} >}}
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

const en = await buildPass({
  dir: "recipes",
  includeDir: "site/_includes",
  cookbookDir: "site/cookbook",
  excludeFr: true,
});
const fr = await buildPass({
  dir: "recipes/fr",
  includeDir: "site/_includes/fr",
  cookbookDir: "site/fr/cookbook",
  lang: "fr",
});

// fr recipes embed {{< recipe fr/slug >}} → reads _includes/fr/<slug>.html
for (let i = 0; i < fr.length; i++) {
  let qmd = readFileSync(`site/fr/cookbook/${fr[i].slug}.qmd`, "utf8");
  qmd = qmd.replace(
    `{{< recipe ${fr[i].slug} >}}`,
    `{{< recipe fr/${fr[i].slug} >}}`,
  );
  writeFileSync(`site/fr/cookbook/${fr[i].slug}.qmd`, qmd);
}
writeFileSync("site/recipes-index.json", JSON.stringify(en, null, 2));
writeFileSync("site/recipes-index-fr.json", JSON.stringify(fr, null, 2));
console.log(`\n${en.length} EN + ${fr.length} FR recipes → site/`);
