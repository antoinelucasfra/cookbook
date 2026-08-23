// client.js — recipe interactivity: scale switching + cook mode
// Bundled with esbuild (IIFE) → site/recipe-app.js
import { toHTML, toGanttHTML } from "@gram-lang/renderer";

function initApp(root) {
  const data = JSON.parse(
    root.querySelector("script.recipe-data").textContent
  );
  const renderEl = root.querySelector(".recipe-render");
  const ganttEl = root.querySelector(".gantt-render");
  const btns = [...root.querySelectorAll(".scale-btn")];
  let scale = "1";

  function render() {
    renderEl.innerHTML = `<div class="gram-preview">${data[scale].html}</div>`;
    ganttEl.innerHTML = data[scale].gantt;
    btns.forEach((b) =>
      b.classList.toggle("active", b.dataset.scale === scale)
    );
    exitCookMode();
  }

  btns.forEach((b) => b.addEventListener("click", () => {
    scale = b.dataset.scale;
    render();
  }));

  // --- Cook mode: step-through ---
  let cooking = false;
  const cookBar = root.querySelector(".cook-bar");
  const cookLabel = root.querySelector(".cook-step-label");

  function steps() {
    return [...renderEl.querySelectorAll("ol.steps > li")];
  }
  function exitCookMode() {
    cooking = false;
    root.classList.remove("cooking");
    steps().forEach((s) => s.classList.remove("cook-active", "cook-done", "cook-pending"));
    cookBar?.removeAttribute("open");
  }
  function showStep(i) {
    const ss = steps();
    if (i >= ss.length) return exitCookMode();
    cooking = true;
    root.classList.add("cooking");
    if (cookBar) cookBar.setAttribute("open", "");
    ss.forEach((s, j) => {
      s.classList.toggle("cook-active", j === i);
      s.classList.toggle("cook-done", j < i);
      s.classList.toggle("cook-pending", j > i);
    });
    const secs = [...renderEl.querySelectorAll("section")];
    const active = ss[i].closest("section");
    secs.forEach((s) =>
      s.classList.toggle("cook-hidden-section", s !== active && !s.contains(ss[i]))
    );
    cookLabel.textContent = `Step ${i + 1}/${ss.length}`;
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
