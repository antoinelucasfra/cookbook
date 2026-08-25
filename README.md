# Cookbook

Recipe site powered by the [Gram DSL](https://gram-lang.org) + Quarto.

## Layout

- `recipes/**/*.gram` — source of truth (one file per recipe, `recipes/bases/` for reusable modules)
- `.gram/ingredients.yaml` — ingredient DB (densities, yields, nutrition)
- `build.mjs` — compiles every recipe × scale (0.5/1/2/3×) → HTML + Gantt + snippet JSON in `site/_includes/`
- `snippet.mjs` — gram recipe → table-style quick-overview snippet (action columns + ingredient rows, like `recipe-format-sugg.png`)
- `import-parser.mjs` — recipe text / schema.org JSON-LD → Gram draft (unit conversion to g/ml); self-check via `npm test`
- `client.js` → `site/recipe-app.js` — scale switcher (also swaps the snippet), cook mode, the Browse page filter table, and the Import page (URL / raw text → `.gram` draft)
- `site/` — Quarto website (output: `site/_site/`)

## Commands

    npm install
    npm run build     # gram pipeline + esbuild + quarto render
    npm run serve     # http://127.0.0.1:8801

## Adding a recipe

Write `recipes/<slug>.gram` (VS Code: "Gram - Recipe Language" extension), then
`npx gram check "recipes/**/*.gram"` and `npm run build`.

## Translating an external recipe into Gram

Two paths:

1. **With AI** — `npx gram import <url-or-file> --pick-model` converts a web page,
   JSON-LD file or YouTube video into `.gram`. Needs an AI provider key
   (google/openai/anthropic/ollama) configured for the gram CLI.
2. **Without AI** — the **Import** tab on the website: paste raw recipe text or a
   URL; it extracts schema.org Recipe JSON-LD when present, falls back to plain-text
   parsing, converts cups/tbsp/tsp/oz/lb to ml/g and emits a downloadable `.gram`
   draft. Review it, save under `recipes/`, extend `.gram/ingredients.yaml` with any
   missing ingredients, then `npx gram check`.
