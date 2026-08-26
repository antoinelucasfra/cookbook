// fix-fr-chrome.mjs — post-quarto-render pass: swap site-chrome strings to
// French under _site/fr/ (navbar/footer/title are site-wide config, not
// per-directory overridable). Idempotent. Run from repo root after quarto render.
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";

const ROOT = "site/_site/fr";
const RE = [
  [/>Recipes</g, ">Recettes<"],
  [/>Browse</g, ">Parcourir<"],
  [/>Import</g, ">Importer<"],
  [/Cooked with/g, "Cuisiné avec"],
  [/Français 🇫🇷/g, "English 🇬🇧"],
  // navbar brand / <title> site title
  [/>Cookbook</g, ">Recettes<"],
  [" Cookbook – ", " Recettes – "],
  [" Cookbook — ", " Recettes — "],
];

let n = 0;
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".html") ? [p] : [];
  });

for (const p of walk(ROOT)) {
  const before = readFileSync(p, "utf8");
  const after = RE.reduce((h, [re, to]) => h.replace(re, to), before);
  if (after !== before) {
    writeFileSync(p, after);
    n++;
  }
}
console.log(`fr chrome: ${n} files updated`);

// recipe-app.js is referenced relatively by every page but Quarto copies it to
// _site root only — mirror it into each subdir containing HTML pages.
const SITE = "site/_site";
const dirs = new Set(walk(SITE).map((p) => dirname(p)));
let c = 0;
for (const d of dirs) {
  if (d === SITE || existsSync(join(d, "recipe-app.js"))) continue;
  copyFileSync(join(SITE, "recipe-app.js"), join(d, "recipe-app.js"));
  c++;
}
console.log(`recipe-app.js mirrored into ${c} dirs`);

if (process.argv[1]?.endsWith("fix-fr-chrome.mjs")) {
  const sample = readFileSync(join(ROOT, "index.html"), "utf8");
  const ok =
    !/>Recipes</.test(sample) &&
    />Recettes</.test(sample) &&
    !/Cooked with/.test(sample);
  console.log(ok ? "self-check OK" : "SELF-CHECK FAILED");
  process.exitCode = ok ? 0 : 1;
}
