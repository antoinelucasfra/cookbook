(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // import-parser.mjs
  function fracToNum(s) {
    s = s.trim().replace(",", ".");
    const uni = {
      "\xBC": 0.25,
      "\xBD": 0.5,
      "\xBE": 0.75,
      "\u2153": 1 / 3,
      "\u2154": 2 / 3,
      "\u215B": 0.125,
      "\u215C": 0.375,
      "\u215D": 0.625,
      "\u215E": 0.875
    };
    const mixedUni = s.match(/^(\d+)\s+([¼½¾⅓⅔⅛⅜⅝⅞])$/);
    if (mixedUni) return Number(mixedUni[1]) + uni[mixedUni[2]];
    const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    const frac = s.match(/^(\d+)\/(\d+)$/);
    if (frac) return Number(frac[1]) / Number(frac[2]);
    return uni[s] ?? Number(s);
  }
  function cleanName(s) {
    return s.replace(
      /\((?:to taste|optional|for (?:garnish|serving)|garnish|divided|plus more)[^)]*\)/gi,
      ""
    ).replace(/\s*\([^)]*\)\s*/g, " ").replace(/[()\[\]]/g, "").replace(/\s+/g, " ").replace(/^[-–—,.\s]+/, "").replace(/[-–—,.\s]+$/, "").trim();
  }
  function normalizeIng(d) {
    if (SIZE_RE.test(d.unit || "")) d.unit = "";
    const parts = d.name.split(/,\s+/);
    if (parts.length > 1) {
      d.prep = parts.slice(1).join(", ").replace(/\.$/, "");
      d.name = parts[0];
    }
    return d;
  }
  function slugify(s) {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "ingredient";
  }
  function toGramQty(qtyStr, unitStr) {
    const qty = qtyStr.trim();
    const unit = (unitStr || "").toLowerCase().replace(/\.$/, "");
    if (UNIT_MAP[unit]) {
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
  function parseRecipeText(text, titleHint = "") {
    const out = {
      title: titleHint || "",
      ingredients: [],
      steps: [],
      portions: ""
    };
    let mode = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim();
      if (!line) continue;
      const h = line.match(/^#{1,6}\s+(.*)/) || line.match(/^\*\*(.{2,60}?)\*\*:?\s*$/);
      if (h) {
        const head = h[1].toLowerCase();
        if (!out.title && h[1].length < 80 && !/ingredient|instruction|direction|method|step|note/.test(head)) {
          out.title = h[1].trim();
          continue;
        }
        mode = /ingredient/.test(head) ? "ingredients" : /instruction|direction|method|step|preparation|recipe/.test(head) ? "steps" : mode;
        continue;
      }
      const inlineIng = line.match(/^ingredients?\s*:\s*(.+)$/i);
      if (inlineIng) {
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
      if (/^(instructions?|directions?|method|steps?|preparation)\s*:?\s*$/i.test(
        line
      )) {
        mode = "steps";
        continue;
      }
      const cleaned = line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
      if (!cleaned) continue;
      if (/^(print|share|save|join|subscribe|follow|watch|jump to|advertisement)\b/i.test(
        cleaned
      ))
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
        if (m && /^\d{2,3}$/.test(m[1].trim()) && /^[fc]$/i.test((m[2] || "").toLowerCase())) {
          continue;
        }
        if (m) {
          out.ingredients.push(
            normalizeIng({
              qty: m[1].trim(),
              unit: (m[2] || "").toLowerCase(),
              name: m[3].replace(/\s*\(.*?\)\s*/g, " ").trim()
            })
          );
        } else if (cleaned.split(/\s+/).length <= 6 && !/[.]$/.test(cleaned)) {
          out.ingredients.push(normalizeIng({ qty: "", unit: "", name: cleaned }));
        }
        if (out.ingredients.at(-1)?.name === cleaned || m) continue;
      }
      if (mode !== "steps" && m && cleaned.length < 120) {
        out.ingredients.push(
          normalizeIng({
            qty: m[1].trim(),
            unit: (m[2] || "").toLowerCase(),
            name: m[3].replace(/\s*\(.*?\)\s*/g, " ").trim()
          })
        );
        continue;
      }
      if (mode === "steps" || out.ingredients.length && (cleaned.length >= 120 || /[.;]$/.test(cleaned))) {
        out.steps.push(cleaned);
      } else if (!out.ingredients.length && !out.title && !/[.;]$/.test(cleaned)) {
        out.title = cleaned;
      }
    }
    if (titleHint) out.title = titleHint;
    return out;
  }
  function extractJsonLdRecipe(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(
          el.textContent.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "")
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
      }
    }
    return null;
  }
  function jsonLdToDraft(r) {
    const ingredients = (r.recipeIngredient ?? r.ingredients ?? []).map((s) => {
      const d = typeof s === "string" ? parseLine(s) : null;
      return d ?? { qty: "", unit: "", name: cleanName(String(s)) };
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
        // yields arrive messy ("12 servings, 12 falafel") — first number wins
        portions: String(r.recipeYield ?? "").match(/\d+/)?.[0] ?? "",
        time: r.totalTime ?? ""
      }
    };
  }
  function parseLine(line) {
    const m = line.match(ING_RE);
    if (!m) return null;
    return normalizeIng({
      qty: m[1].trim(),
      unit: (m[2] || "").toLowerCase(),
      name: cleanName(m[3])
    });
  }
  function aiNeededTags(draft) {
    const tags = [];
    if (!draft.title) tags.push("No title detected");
    if (draft.ingredients.length) {
      const noQty = draft.ingredients.filter((i) => !i.qty).length;
      if (noQty)
        tags.push(`${noQty} ingredient(s) without a quantity (e.g. "to taste")`);
      const METRIC = /^(g|kg|mg|ml|l|cl|dl|fl\s*oz|pinch|clove|cloves|slice|slices|can|bunch|handful|large|medium|small|whole)s?$/;
      const unmapped = [
        ...new Set(
          draft.ingredients.filter(
            (i) => i.qty && i.unit && !UNIT_MAP[i.unit] && !METRIC.test(i.unit)
          ).map((i) => i.unit)
        )
      ];
      if (unmapped.length)
        tags.push(`Unfamiliar unit(s): ${unmapped.join(", ")}`);
      const timed = draft.steps.filter(
        (s) => !s.includes("~{") && /\d+\s*(hours?|hrs?|minutes?|mins?)\b/i.test(s)
      ).length;
      if (timed)
        tags.push(`${timed} step(s) contain times that need a ~{N min} timer`);
    } else tags.push("No ingredient list detected \u2014 AI extraction recommended");
    if (!draft.steps.length)
      tags.push("No instruction steps detected \u2014 AI extraction recommended");
    return tags;
  }
  function hasHardGaps(draft) {
    return !draft.title || !draft.ingredients.length || !draft.steps.length;
  }
  function convertTemps(s) {
    return s.replace(/(\d{2,3})\s*(?:°\s*)?[Ff]\b(?!\w)/g, (_, f) => {
      const c = Math.round((Number(f) - 32) * 5 / 9);
      return `${c} \xB0C`;
    });
  }
  function extractTimer(s) {
    if (s.includes("~{")) return [s, ""];
    const m = s.match(TIME_RE);
    if (!m) return [s, ""];
    const n = Math.max(Number(m[1]), Number(m[2] ?? m[1]));
    const unit = m[3].toLowerCase();
    const timer = /^h/.test(unit) ? `~{${n * 60} min}` : /^min/.test(unit) || unit === "m" ? `~{${n} min}` : `~{${n} s}`;
    return [
      s.slice(0, m.index).trimEnd().replace(/[,;.]$/, ""),
      timer
    ];
  }
  function addCookware(s) {
    if (s.includes("#")) return s;
    const m = s.match(COOKWARE_RE);
    return m ? s.replace(m[0], m[0].replace(m[1], `#${m[1].toLowerCase()}{}`)) : s;
  }
  function draftToGram(draft, meta = {}) {
    const title = draft.title || meta.title || "Imported recipe";
    const portions = draft.portions || meta.portions || "";
    const tags = aiNeededTags(draft);
    const tagComment = hasHardGaps(draft) ? `# review: ${tags.join("; ")}
# tip: npx gram import <url> --pick-model for an AI-assisted translation
` : "";
    const ingLines = draft.ingredients.map((i) => {
      const q = i.qty ? `{${toGramQty(i.qty, i.unit)}}` : "{}";
      return `- @${slugify(i.name)}${q}${i.prep ? `(${i.prep})` : ""} \u2014 ${i.name}`;
    });
    const stepLines = draft.steps.map((s0, idx) => {
      const [text, timer] = extractTimer(convertTemps(s0));
      const body = addCookware(text);
      return `[Step ${idx + 1}] ${timer ? `${body}, ${timer}` : body}`;
    });
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
  var UNIT_MAP, QTY, ING_RE, SIZE_RE, TIME_RE, COOKWARE_RE;
  var init_import_parser = __esm({
    "import-parser.mjs"() {
      UNIT_MAP = {
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
        gal: "3800 ml",
        gallon: "3800 ml",
        gallons: "3800 ml",
        stick: "113 g",
        sticks: "113 g",
        floz: "30 ml"
      };
      QTY = String.raw`(?:\d+\s+\d*\/\d+|\d+\/\d+|\d+[.,]\d+|\d+|[¼½¾⅓⅔⅛⅜⅝⅞])`;
      ING_RE = new RegExp(
        `^(${QTY}(?:\\s*(?:to|-|\u2013)\\s*${QTY})?)\\s*([a-zA-Z.]+)?\\.?\\s+(.+)$`
      );
      SIZE_RE = /^(large|medium|small|whole)s?$/;
      TIME_RE = /[,;]?\s*(?:for |about )?(\d+)(?:\s*(?:to|-|–)\s*(\d+))?\s*(hours?|hrs?|h|minutes?|mins?|min|seconds?|secs?)\.?\s*$/i;
      COOKWARE_RE = /\b(dutch oven|baking sheet|baking dish|saucepan|skillet|wok|mixing bowl|pot|pan|bowl|oven)\b/i;
    }
  });

  // client.js
  var require_client = __commonJS({
    "client.js"() {
      init_import_parser();
      function initApp(root) {
        let data;
        try {
          data = JSON.parse(root.querySelector("script.recipe-data").textContent);
        } catch {
          return;
        }
        const renderEl = root.querySelector(".recipe-render");
        const ganttEl = root.querySelector(".gantt-render");
        const btns = [...root.querySelectorAll(".scale-btn")];
        let scale = "1";
        function setHTML(el, html) {
          const frag = new DOMParser().parseFromString(html, "text/html").body;
          el.replaceChildren(...frag.childNodes);
        }
        function render() {
          setHTML(renderEl, `<div class="gram-preview">${data[scale].html}</div>`);
          setHTML(ganttEl, data[scale].gantt);
          const slot = root.querySelector(".snippet-slot");
          if (slot && data[scale].snippet) setHTML(slot, data[scale].snippet);
          btns.forEach(
            (b) => b.classList.toggle("active", b.dataset.scale === scale)
          );
          exitCookMode();
        }
        btns.forEach((b) => b.addEventListener("click", () => {
          scale = b.dataset.scale;
          render();
        }));
        const cookBar = root.querySelector(".cook-bar");
        const cookLabel = root.querySelector(".cook-step-label");
        function steps() {
          return [...renderEl.querySelectorAll("ol.steps > li")];
        }
        function exitCookMode() {
          root.classList.remove("cooking");
          steps().forEach((s) => s.classList.remove("cook-active", "cook-done", "cook-pending"));
          cookBar?.removeAttribute("open");
        }
        function showStep(i) {
          const ss = steps();
          if (i >= ss.length) return exitCookMode();
          root.classList.add("cooking");
          if (cookBar) cookBar.setAttribute("open", "");
          ss.forEach((s, j) => {
            s.classList.toggle("cook-active", j === i);
            s.classList.toggle("cook-done", j < i);
            s.classList.toggle("cook-pending", j > i);
          });
          const secs = [...renderEl.querySelectorAll("section")];
          const active = ss[i].closest("section");
          secs.forEach(
            (s) => s.classList.toggle("cook-hidden-section", s !== active && !s.contains(ss[i]))
          );
          cookLabel.textContent = `${document.documentElement.lang === "fr" ? "\xC9tape" : "Step"} ${i + 1}/${ss.length}`;
          ss[i].scrollIntoView({ behavior: "smooth", block: "center" });
        }
        root.querySelector(".cook-start")?.addEventListener("click", () => showStep(0));
        root.querySelector(".cook-next")?.addEventListener("click", () => {
          const i = steps().findIndex((s) => s.classList.contains("cook-active"));
          showStep(i + 1);
        });
        root.querySelector(".cook-exit")?.addEventListener("click", exitCookMode);
        render();
      }
      document.querySelectorAll(".recipe-app").forEach(initApp);
      function fmtTime(min) {
        if (min == null) return "";
        const h = Math.floor(min / 60), m = Math.round(min % 60);
        return h ? `${h} h ${m ? m + " min" : ""}`.trim() : `${m} min`;
      }
      async function initBrowse() {
        const table = document.querySelector("#browse-table");
        if (!table) return;
        let recipes;
        const fr = document.documentElement.lang === "fr";
        try {
          recipes = await (await fetch(fr ? "../recipes-index-fr.json" : "recipes-index.json")).json();
        } catch {
          table.textContent = fr ? "\xC9chec du chargement de l\u2019index des recettes." : "Failed to load recipe index.";
          return;
        }
        const tbody = table.querySelector("tbody");
        const search = document.querySelector("#browse-search");
        const catSel = document.querySelector("#browse-category");
        const count = document.querySelector("#browse-count");
        const cats = [...new Set(recipes.map((r) => r.category))].sort();
        for (const c of cats) catSel.add(new Option(c, c));
        let sortKey = "title", sortAsc = true;
        function rows() {
          const q = search.value.trim().toLowerCase();
          const cat = catSel.value;
          return recipes.filter(
            (r) => (!cat || r.category === cat) && (!q || `${r.title} ${r.category} ${r.source}`.toLowerCase().includes(q))
          ).sort((a, b) => {
            const va = a[sortKey], vb = b[sortKey];
            const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
            return sortAsc ? c : -c;
          });
        }
        function render() {
          const rs = rows();
          tbody.replaceChildren(
            ...rs.map((r) => {
              const tr = document.createElement("tr");
              const td = (text) => {
                const c = document.createElement("td");
                c.textContent = text;
                return c;
              };
              const link = document.createElement("a");
              link.href = `cookbook/${r.slug}.html`;
              link.textContent = r.title;
              const titleTd = document.createElement("td");
              titleTd.append(link);
              tr.append(titleTd, td(r.category), td(fmtTime(r.time)), td(r.portions), td(r.source ?? ""));
              return tr;
            })
          );
          count.textContent = `${rs.length} / ${recipes.length} ${fr ? "recettes" : "recipes"}`;
        }
        table.querySelectorAll("th[data-sort]").forEach(
          (th) => th.addEventListener("click", () => {
            const k = th.dataset.sort;
            sortAsc = k === sortKey ? !sortAsc : true;
            sortKey = k;
            table.querySelectorAll("th[data-sort]").forEach((t) => t.classList.remove("sort-asc", "sort-desc"));
            th.classList.add(sortAsc ? "sort-asc" : "sort-desc");
            render();
          })
        );
        search.addEventListener("input", render);
        catSel.addEventListener("change", render);
        render();
      }
      initBrowse();
      async function fetchPage(url) {
        const attempts = [url, `https://r.jina.ai/${url}`];
        let lastErr;
        for (const u of attempts) {
          try {
            const res = await fetch(u);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
          } catch (e) {
            lastErr = e;
          }
        }
        throw lastErr ?? new Error("fetch failed");
      }
      function initImport() {
        const form = document.querySelector("#import-form");
        if (!form) return;
        const fr = document.documentElement.lang === "fr";
        const T = fr ? {
          needsReview: "\u26A0 \xC0 v\xE9rifier \u2014 traduction IA recommand\xE9e pour :",
          aiTip: "Essayez `npx gram import <url> --pick-model` pour une conversion assist\xE9e par IA.",
          parsed: (i, s) => `${i} ingr\xE9dients et ${s} \xE9tapes analys\xE9s.`,
          flagged: (n) => ` ${n} \xE9l\xE9ment(s) marqu\xE9(s) \xE0 relire.`,
          clean: " Traduction statique qui semble compl\xE8te.",
          enter: "Saisissez une URL de recette ou collez le texte de la recette.",
          urlPrefix: "L\u2019URL doit commencer par http(s)://",
          fetching: "R\xE9cup\xE9ration\u2026",
          failed: (m) => `\xC9chec de l\u2019import : ${m}. Collez plut\xF4t le texte de la recette.`,
          copied: "Copi\xE9 dans le presse-papiers."
        } : {
          needsReview: "\u26A0 Needs review \u2014 AI translation recommended for these:",
          aiTip: "Try `npx gram import <url> --pick-model` for AI-assisted conversion.",
          parsed: (i, s) => `Parsed ${i} ingredients and ${s} steps.`,
          flagged: (n) => ` ${n} item(s) flagged for review.`,
          clean: " Looks like a clean static translation.",
          enter: "Enter a recipe URL or paste the recipe text.",
          urlPrefix: "URL must start with http(s)://",
          fetching: "Fetching\u2026",
          failed: (m) => `Import failed: ${m}. Paste the recipe text instead.`,
          copied: "Copied to clipboard."
        };
        const urlIn = document.querySelector("#import-url");
        const textEl = document.querySelector("#import-text");
        const status = document.querySelector("#import-status");
        const out = document.querySelector("#import-output");
        const preview = out?.querySelector("#import-preview");
        let gramText = "";
        function show(msg, isError = false) {
          status.textContent = msg;
          status.classList.toggle("error", isError);
        }
        function emit(draft, meta) {
          gramText = draftToGram(draft, meta);
          const tags = aiNeededTags(draft);
          if (preview) preview.value = gramText;
          const tagBox = out.querySelector("#import-tags");
          tagBox.replaceChildren();
          if (tags.length) {
            const p = document.createElement("p");
            p.className = "import-tags-title";
            p.textContent = T.needsReview;
            const ul = document.createElement("ul");
            for (const t of tags) {
              const li = document.createElement("li");
              li.textContent = t;
              ul.append(li);
            }
            const tip = document.createElement("p");
            tip.textContent = T.aiTip;
            tagBox.append(p, ul, tip);
          }
          tagBox.hidden = !tags.length;
          out.hidden = false;
          show(
            `${T.parsed(draft.ingredients.length, draft.steps.length)}${tags.length ? T.flagged(tags.length) : T.clean}`,
            tags.length > 0 && (!draft.ingredients.length || !draft.steps.length)
          );
        }
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          out.hidden = true;
          const url = urlIn.value.trim();
          const raw = textEl.value.trim();
          try {
            if (raw && !url) {
              emit(parseRecipeText(raw), {});
              return;
            }
            if (!url) return show(T.enter, true);
            if (!/^https?:\/\//.test(url)) return show(T.urlPrefix, true);
            show(T.fetching);
            const body = await fetchPage(url);
            let recipe = null;
            try {
              recipe = extractJsonLdRecipe(body);
            } catch {
            }
            if (recipe) {
              const draft = jsonLdToDraft(recipe);
              if (!draft.title) draft.title = parseRecipeText("").title || url;
              emit(draft, { source: url, portions: String(recipe.recipeYield ?? "") });
            } else {
              emit(parseRecipeText(body, ""), { source: url });
            }
          } catch (err) {
            show(T.failed(err.message), true);
          }
        });
        const currentText = () => preview?.value || gramText;
        document.querySelector("#import-copy")?.addEventListener("click", async () => {
          await navigator.clipboard.writeText(currentText());
          show(T.copied);
        });
        document.querySelector("#import-download")?.addEventListener("click", () => {
          const gram = currentText();
          const title = gram.match(/^title: (.+)$/m)?.[1] ?? "recipe";
          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([gram], { type: "text/plain" }));
          a.download = `${slug}.gram`;
          a.click();
          URL.revokeObjectURL(a.href);
        });
      }
      initImport();
    }
  });
  require_client();
})();
