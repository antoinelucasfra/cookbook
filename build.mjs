// build.mjs — .gram recipes → Quarto site data
// Usage: node build.mjs
import { readdirSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
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

function listGram(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listGram(join(dir, e.name))
      : e.name.endsWith(".gram")
        ? [join(dir, e.name)]
        : []
  );
}

rmSync("site/_includes", { recursive: true, force: true });
rmSync("site/cookbook", { recursive: true, force: true });
rmSync("site/recipes-index.json", { force: true });
mkdirSync("site/_includes", { recursive: true });
mkdirSync("site/cookbook", { recursive: true });

const index = [];
for (const file of listGram("recipes").filter((f) => !f.includes("bases/"))) {
  const scales = {};
  for (const s of SCALES) {
    const { analyzed } = await runPipeline(file, {
      db: DB,
      scaleFactor: s === 1 ? undefined : s,
    });
    const r = analyzed.result;
    const clean = { ...r, meta: { title: r.title, portions: r.meta?.portions } };
    scales[String(s)] = { html: toHTML(clean), gantt: toGanttHTML(clean), snippet: toSnippetHTML(r) };
    if (s === 1) {
      var base = r;
    }
  }

  const slug = base.slug;
  const interactive = `<div class="recipe-app" id="app-${slug}">
  <div class="recipe-toolbar">
    <div class="scale-controls" role="group" aria-label="Portions">
      ${SCALES.map((s) => `<button class="scale-btn" data-scale="${s}">${s === 1 ? "1×" : s + "×"}</button>`).join("")}
    </div>
    <button class="cook-start">▶ Cook mode</button>
  </div>
  <details class="cook-bar">
    <summary>Cook mode active — <span class="cook-step-label"></span></summary>
    <button class="cook-next">Next step →</button>
    <button class="cook-exit">Exit</button>
  </details>
  <details class="snippet-box" open>
    <summary>⚡ Quick overview</summary>
    <div class="snippet-slot">${scales["1"].snippet}</div>
  </details>
  <div class="recipe-render"></div>
  <details class="gantt-details"><summary>⏱ Timeline</summary><div class="gantt-render"></div></details>
  <script type="application/json" class="recipe-data">${JSON.stringify(scales).replace(/</g, "\\u003c")}</script>
</div>`;
  writeFileSync(`site/_includes/${slug}.html`, interactive);

  writeFileSync(
    `site/cookbook/${slug}.qmd`,
    `---
title: "${base.title}"
category: "${base.meta?.category ?? "Uncategorized"}"
total_time: "${base.metrics?.totalTime ?? 0} min"
portions: "${base.meta?.portions ?? ""}"
---

{{< recipe ${slug} >}}
`
  );

  index.push({
    slug,
    title: base.title,
    category: base.meta?.category ?? "Uncategorized",
    time: base.metrics?.totalTime ?? 0,
    portions: base.meta?.portions ?? "",
    source: base.meta?.source ?? "",
  });
  console.log(`✓ ${slug} (${base.metrics?.totalTime ?? "?"} min)`);
}

writeFileSync("site/recipes-index.json", JSON.stringify(index, null, 2));
console.log(`\n${index.length} recipes → site/`);
