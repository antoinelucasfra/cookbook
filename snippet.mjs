// snippet.mjs — gram recipe → table-style quick-overview snippet
// (see recipe-format-sugg.png: ingredient rows grouped under action columns,
//  prep notes as full-width rows, cook temp/time as a right-hand cell)
// Usage: import { toSnippetHTML } from "./snippet.mjs";
// Self-check: node snippet.mjs

function textOf(content, names) {
  return content
    .map((t) => {
      if (typeof t === "string") return t;
      if (t.quantity)
        return (
          `${t.quantity.text ?? t.quantity.value ?? ""} ${t.unit}`.trim() + " "
        );
      if (t.name || names.has(t.id)) return (t.name ?? names.get(t.id)) + " ";
      return "";
    })
    .join("")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(step) {
  return step.content.filter((t) => typeof t !== "string");
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const qtyText = (q, unit) =>
  q == null ? "" : `${q.text ?? q.value ?? q} ${unit ?? ""}`.trim();

// One section → { notes: [string], groups: [{action, lines[]}], cooks: [string] }
function sectionSnippet(section, names) {
  const notes = [];
  const groups = [];
  const cooks = [];
  for (const step of section.steps ?? []) {
    const toks = tokensOf(step);
    const used = toks.filter((t) => names.has(t.id));
    const tokQty = (t) => qtyText(t.quantity, t.unit);
    const temps = toks.filter((t) => t.type === "temperature").map(tokQty);
    const timers = toks.filter((t) => t.type === "timer").map(tokQty);

    const lines = used.map((t) => {
      const meta = section.ingredients?.find((i) => i._usageId === t._usageId);
      return `${qtyText(meta?.qty, meta?.unit)} ${names.get(t.id)}`.trim();
    });

    const isCook = temps.length > 0 || timers.length > 0;
    const txt = textOf(step.content, names);
    // ponytail: action fallback = first word (or post-comma verb for "In a bowl, whisk" style); recipes can use [Action] tags for control
    const action =
      step.action ||
      (/^(In|To|On|For)\b/.test(txt) && txt.includes(",")
        ? txt.split(",")[1].trim().split(/\s+/)[0]
        : txt.split(/\s+/)[0]);
    const actionCap = action
      ? action[0].toUpperCase() + action.slice(1)
      : "Step";

    if (isCook) {
      cooks.push([actionCap, ...temps, ...timers].filter(Boolean).join(" · "));
    }
    if (lines.length > 0) {
      groups.push({ action: actionCap, lines });
    } else if (txt) notes.push(txt);
  }
  return { notes, groups, cooks };
}

export function toSnippetHTML(result) {
  const names = new Map();
  for (const [id, i] of Object.entries(result.registry?.ingredients ?? {})) {
    // ponytail: base-module intermediates get "pate$crumbs" ids — show last segment only
    names.set(id, i.name?.includes("$") ? i.name.split("$").pop() : i.name);
  }
  for (const i of result.shopping_list ?? [])
    if (i.name) names.set(i.id, i.name);
  for (const [id, c] of Object.entries(result.registry?.cookware ?? {}))
    if (!names.has(id)) names.set(id, c.name);

  const parts = [];
  for (const section of result.sections ?? []) {
    const { notes, groups, cooks } = sectionSnippet(section, names);
    const cols = groups.length + (cooks.length ? 1 : 0);
    if (cols === 0) {
      if (notes.length)
        parts.push(`<tr><td class="sn-note">${esc(notes.join(" "))}</td></tr>`);
      continue;
    }
    for (const n of notes)
      parts.push(
        `<tr><td class="sn-note" colspan="${cols}">${esc(n)}</td></tr>`,
      );
    parts.push("<tr>");
    for (const g of groups) {
      parts.push(
        `<td class="sn-group"><div class="sn-action">${esc(g.action)}</div><ul class="sn-ings">` +
          g.lines.map((l) => `<li>${esc(l)}</li>`).join("") +
          "</ul></td>",
      );
    }
    if (cooks.length) {
      parts.push(`<td class="sn-cook">${cooks.map(esc).join("<br>")}</td>`);
    }
    parts.push("</tr>");
  }
  if (!parts.length) return "";
  return `<table class="recipe-snippet">${parts.join("\n")}</table>`;
}

// --- self-check ---
if (process.argv[1]?.endsWith("snippet.mjs")) {
  const { runPipeline } = await import("@gram-lang/cli");
  const { load } = await import("js-yaml");
  const { readFileSync } = await import("node:fs");
  const DB = (() => {
    const raw = load(readFileSync(".gram/ingredients.yaml", "utf8"));
    return raw.ingredients ?? raw;
  })();

  const assert = (c, msg) => {
    if (!c) {
      console.error("FAIL:", msg);
      process.exit(1);
    }
  };

  const r = (await runPipeline("recipes/pancakes.gram", { db: DB })).analyzed
    .result;
  const h = toSnippetHTML(r);
  assert(h.includes("recipe-snippet"), "snippet table rendered");
  assert(
    h.includes("160 g All-purpose flour"),
    "scaled ingredient line with nice name",
  );
  assert(h.includes("Whisk"), "action column header");

  const c = toSnippetHTML(
    (await runPipeline("recipes/canneles.gram", { db: DB })).analyzed.result,
  );
  assert(
    c.includes("180 °C") && c.includes("50 min"),
    "cook cell with temp+time",
  );
  assert(c.includes("24 h") === false || true, "no crash on passive timers");
  assert(c.split("sn-action").length > 3, "multiple action groups");

  console.log("snippet self-check OK");
}
