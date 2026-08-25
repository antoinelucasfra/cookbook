# Cookbook

Recipe site powered by the [Gram DSL](https://gram-lang.org) + Quarto.

## Layout
- `recipes/**/*.gram` — source of truth (one file per recipe, `recipes/bases/` for reusable modules)
- `.gram/ingredients.yaml` — ingredient DB (densities, yields, nutrition)
- `build.mjs` — compiles every recipe × scale (0.5/1/2/3×) → HTML + Gantt + snippet JSON in `site/_includes/`
- `snippet.mjs` — gram recipe → table-style quick-overview snippet (action columns + ingredient rows, like `recipe-format-sugg.png`); `npm test` runs its self-check
- `client.js` → `site/recipe-app.js` — scale switcher (also swaps the snippet), cook mode, and the Browse page filter table
- `site/` — Quarto website (output: `site/_site/`)

## Commands
    npm install
    npm run build     # gram pipeline + esbuild + quarto render
    npm run serve     # http://127.0.0.1:8801

## Adding a recipe
Write `recipes/<slug>.gram` (VS Code: "Gram - Recipe Language" extension), then
`npx gram check "recipes/**/*.gram"` and `npm run build`.
