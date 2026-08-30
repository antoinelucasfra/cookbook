# AGENTS.md — cookbook-web

Bilingual recipe site powered by the [Gram DSL](https://gram-lang.org) +
Quarto. Source of truth is `.gram` files; build pipeline compiles them to static
HTML at build time.

- **GitHub remote:** <https://github.com/antoinelucasfra/cookbook-web>
- **Primary branch:** `main`
- **Content license:** CC BY-SA (recipe content)
- **Quarto version:** ≥ 1.9.37
- **Node requirement:** ≥ 18 (build time only)

## Architecture

```
sources/**/*.gram                    ──┐
.gram/ingredients.yaml (ingredient DB)  ├──> build.mjs ──> site/_includes/*.{html,json}
                                      ──┘                  │
                                                            ├──> Quarto render ──> site/_site/
                                       client.js ──esbuild──> site/recipe-app.js  (scale, cook mode, import)
```

### Build pipeline

`npm run build` runs four stages:

1. **`build.mjs`** — Compiles every `.gram` × scale (0.5×, 1×, 2×, 3×) → HTML +
   Gantt + snippet JSON into `site/_includes/`. Also builds two per-language
   index JSON files: `recipes-index.json` (EN), `recipes-index-fr.json` (FR) — filenames kept stable (build outputs); only source dir renamed.
   Ingredient DB loaded from `.gram/ingredients.yaml`.
2. **`esbuild`** — Bundles `client.js` (imports `@gram-lang/renderer`) →
   `site/recipe-app.js` (IIFE format). Powers: scale switcher, cook mode, browse
   filter table, Import page.
3. **`quarto render`** — Renders the `site/` Quarto project → `site/_site/`.
4. **`fix-fr-chrome.mjs --self-check`** — Fixes French Chrome rendering quirks;
   runs self-check.

### Gram pipeline (`@gram-lang/cli`)

Uses `@gram-lang/parser` → `@gram-lang/kitchen` (timeline, sections, shopping
list) → `@gram-lang/analyzer` (mass normalization, yields, nutrition,
aggregation) → `@gram-lang/renderer` (HTML output). The `gram check
"sources/**/*.gram"` command validates all sources.

### Ingredient DB

`gram-quarto` is a **dev dependency** on this project — never direct-imported
from consuming code. The bundled compiler in `_quarto-gram-cache/` or
`_extensions/gram/resources/` handles compilation. `.gram/ingredients.yaml`
holds physical + nutritional data (densities, yields, French/English names).
When adding an ingredient, include both EN and FR names/aliases.

## Key Directories

| Path | Description |
| ------ | ------------- |
| `sources/` | English recipe sources (`*.gram`) + `bases/` (reusable modules) |
| `sources/fr/` | French recipe sources (`*.gram`) |
| `sources/_drafts/` | In-progress drafts (from `import-parser.mjs`) |
| `.gram/ingredients.yaml` | Ingredient DB (densities, nutrition, EN+FR names) |
| `.gram/config.yaml` | Gram configuration |
| `build.mjs` | Main build: compiles all `.gram` → HTML + JSON in `site/_includes/` |
| `snippet.mjs` | Gram → table-style quick-overview snippet |
| `import-parser.mjs` | Recipe text / schema.org JSON-LD → `.gram` draft (unit conversion to g/ml) |
| `client.js` | Recipe interactivity (bundled → `site/recipe-app.js`) |
| `site/` | Quarto website project |
| `site/_quarto.yml` | Quarto config (filters: `gram`, navbar, bilingual links) |
| `site/_includes/` | Compiled recipe HTML + JSON (generated) |
| `site/_site/` | Quarto rendered output (generated, gitignored) |
| `site/css/` | `gram.css`, `gantt.css`, `app.css` |
| `site/recipe-app.js` | Bundled client JS (generated) |
| `site/cookbook/` | English rendered recipes |
| `site/fr/cookbook/` | French rendered recipes |
| `.quarto-gram-cache/` | Gram compilation cache (gitignored) |

## Bilingual site

- English in `sources/` → renders to `site/cookbook/`
- French in `sources/fr/*.gram` → renders to `site/fr/cookbook/` (renderer
  `lang: fr` for French UI labels/tooltips/timings)
- Each page links to its counterpart ("Version française" / "English version")
- Browse table reads `recipes-index.json` or `recipes-index-fr.json` based on
  page `<html lang>`
- Ingredient French names from `name_fr` + aliases in `.gram/ingredients.yaml`

## Development Commands

```bash
npm install
npm run build     # gram pipeline + esbuild + quarto render + self-check
npm run serve     # python3 -m http.server 8801 -d site/_site
npm run check     # gram check "sources/**/*.gram"
npm test          # node snippet.mjs && node self-check.mjs
```

### Adding a recipe

Write `sources/<slug>.gram` (VS Code: "Gram - Recipe Language" extension), then:

```bash
npx gram check "sources/**/*.gram"
npm run build
```

### Translating an external recipe

1. **AI** — `npx gram import <url-or-file> --pick-model` (needs AI provider key)
2. **Static** — Import tab on website: paste URL/raw text → extracts schema.org
   JSON-LD → falls back to plain-text → converts units → emits downloadable
   `.gram` draft. Untagged items (`# review:` comment in draft) → review, then
   save under `sources/`, extend `.gram/ingredients.yaml` if needed, then
   `npx gram check`.

## Code conventions

- **JavaScript** (Node ≥ 18, CommonJS — `"type": "commonjs"`)
- **esbuild** for bundling (no webpack/rollup)
- No linter configured — style consistent with `@gram-lang/*` ecosystem
- `build.mjs` calls `runPipeline()` from `@gram-lang/cli` — do not call
  `@gram-lang/*` directly outside the build scripts

## Git

- `site/_site/`, `site/recipe-app.js`, `.quarto-gram-cache/`, `node_modules/`
  are gitignored
- `.pi-lens.json` ignores `site/_site/`, `site/site_libs/`, `site/_includes/`,
  `site/recipe-app.js`, `node_modules/`, `dist/`
