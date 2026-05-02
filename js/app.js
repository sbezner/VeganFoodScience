/* Vegan Food Science — site logic
 * Vanilla JS, no dependencies. Handles:
 *   - dark mode toggle (persisted)
 *   - mobile menu
 *   - module progress in localStorage
 *   - quiz interactivity & scoring
 *   - glossary search
 *   - active section highlighting in module TOC
 *   - small reveal-on-scroll
 */

(() => {
  "use strict";

  const STORE_KEY = "vfs.progress.v1";
  const THEME_KEY = "vfs.theme";

  // ---------- THEME ----------
  const root = document.documentElement;
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) root.setAttribute("data-theme", savedTheme);

  function toggleTheme() {
    const cur = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = cur === "dark" ? "light" : "dark";
    if (next === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    localStorage.setItem(THEME_KEY, next);
  }

  // ---------- PROGRESS ----------
  function getProgress() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch { return {}; }
  }
  function setProgress(p) { localStorage.setItem(STORE_KEY, JSON.stringify(p)); }
  function markComplete(moduleId) {
    const p = getProgress(); p[moduleId] = { done: true, when: Date.now() }; setProgress(p);
  }
  function unmarkComplete(moduleId) {
    const p = getProgress(); delete p[moduleId]; setProgress(p);
  }

  // expose for buttons in pages
  window.VFS = { markComplete, unmarkComplete, getProgress, toggleTheme };

  // ---------- DOM READY ----------
  document.addEventListener("DOMContentLoaded", () => {

    // Theme toggle button
    document.querySelectorAll("[data-action='toggle-theme']").forEach(btn => {
      btn.addEventListener("click", toggleTheme);
    });

    // Mobile menu
    const toggle = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".nav");
    if (toggle && nav) {
      toggle.addEventListener("click", () => nav.classList.toggle("open"));
    }

    // Mark active nav link
    const path = location.pathname.replace(/index\.html$/, "");
    document.querySelectorAll(".nav a").forEach(a => {
      const href = a.getAttribute("href").replace(/index\.html$/, "");
      if (href && (path.endsWith(href) || (href !== "/" && path.includes(href)))) {
        a.classList.add("active");
      }
    });

    // Module card progress badges
    const progress = getProgress();
    document.querySelectorAll(".module-card[data-module-id]").forEach(card => {
      const id = card.dataset.moduleId;
      if (progress[id]?.done) card.classList.add("completed");
    });
    // Update progress bar if present (curriculum overview)
    const totalEl = document.querySelector("[data-progress-total]");
    if (totalEl) {
      const total = parseInt(totalEl.dataset.progressTotal, 10) || 1;
      const done = Object.values(progress).filter(v => v.done).length;
      const fill = document.querySelector(".progress-bar__fill");
      const label = document.querySelector("[data-progress-label]");
      if (fill) fill.style.width = `${Math.round((done / total) * 100)}%`;
      if (label) label.textContent = `${done} of ${total} modules complete`;
    }

    // Module page: complete/uncomplete button
    document.querySelectorAll("[data-action='mark-complete']").forEach(btn => {
      const id = btn.dataset.moduleId;
      const refresh = () => {
        const done = !!getProgress()[id]?.done;
        btn.textContent = done ? "✓ Marked complete — undo" : "Mark module complete";
        btn.classList.toggle("btn--ghost", done);
        btn.classList.toggle("btn--primary", !done);
      };
      btn.addEventListener("click", () => {
        if (getProgress()[id]?.done) unmarkComplete(id); else markComplete(id);
        refresh();
      });
      refresh();
    });

    // Quizzes
    document.querySelectorAll(".quiz").forEach(initQuiz);

    // Glossary search
    const search = document.querySelector(".glossary-search");
    if (search) {
      search.addEventListener("input", () => {
        const q = search.value.trim().toLowerCase();
        document.querySelectorAll(".glossary-term").forEach(t => {
          const text = t.textContent.toLowerCase();
          t.classList.toggle("hidden", q && !text.includes(q));
        });
        // Hide letter headings with no visible terms
        document.querySelectorAll(".glossary-letter").forEach(h => {
          const next = nextSiblingsUntil(h, ".glossary-letter");
          const anyVisible = next.some(n => n.classList.contains("glossary-term") && !n.classList.contains("hidden"));
          h.style.display = anyVisible ? "" : "none";
        });
      });
    }

    // Module TOC scroll-spy
    const toc = document.querySelector(".toc");
    if (toc) {
      const links = [...toc.querySelectorAll("a[href^='#']")];
      const sections = links.map(a => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
      const setActive = (id) => {
        links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + id));
      };
      const obs = new IntersectionObserver((entries) => {
        const visible = entries.filter(e => e.isIntersecting)
          .sort((a, b) => a.target.offsetTop - b.target.offsetTop);
        if (visible[0]) setActive(visible[0].target.id);
      }, { rootMargin: "-30% 0px -60% 0px" });
      sections.forEach(s => obs.observe(s));
    }

    // Reveal on scroll
    const reveals = document.querySelectorAll(".reveal");
    if (reveals.length) {
      const ro = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); } });
      }, { threshold: 0.12 });
      reveals.forEach(el => ro.observe(el));
    }
  });

  function nextSiblingsUntil(el, selector) {
    const out = [];
    let n = el.nextElementSibling;
    while (n && !n.matches(selector)) { out.push(n); n = n.nextElementSibling; }
    return out;
  }

  // ---------- QUIZ ENGINE ----------
  // Quiz format (markup):
  // <div class="quiz" data-quiz-id="m1">
  //   <h3 class="quiz__title">Check yourself</h3>
  //   <div class="quiz-q" data-answer="1" data-explain="...">
  //     <div class="quiz-q__q">Question?</div>
  //     <div class="quiz-q__opts">
  //       <label class="quiz-opt"><input type="radio" name="q-id-0"> Option</label>
  //       ...
  //     </div>
  //   </div>
  //   <div class="quiz__actions">
  //     <button class="btn btn--primary" data-action="quiz-check">Check answers</button>
  //     <button class="btn btn--ghost" data-action="quiz-reset">Reset</button>
  //     <span class="quiz__score" data-quiz-score></span>
  //   </div>
  // </div>
  function initQuiz(quiz) {
    const questions = quiz.querySelectorAll(".quiz-q");
    questions.forEach((q, i) => {
      const opts = q.querySelectorAll(".quiz-opt input");
      opts.forEach((opt, j) => {
        opt.dataset.idx = j;
        opt.name = `${quiz.dataset.quizId || "q"}-${i}`;
      });
    });
    quiz.querySelector("[data-action='quiz-check']")?.addEventListener("click", () => {
      let correct = 0;
      questions.forEach(q => {
        const answer = parseInt(q.dataset.answer, 10);
        const opts = q.querySelectorAll(".quiz-opt");
        let chosen = -1;
        opts.forEach((label, idx) => {
          const input = label.querySelector("input");
          label.classList.remove("correct", "wrong");
          if (input.checked) chosen = idx;
        });
        opts.forEach((label, idx) => {
          if (idx === answer) label.classList.add("correct");
          else if (idx === chosen) label.classList.add("wrong");
        });
        const exp = q.querySelector(".quiz-q__exp");
        if (exp) exp.classList.add("show");
        if (chosen === answer) correct++;
      });
      const score = quiz.querySelector("[data-quiz-score]");
      if (score) score.textContent = `Score: ${correct}/${questions.length}`;
    });
    quiz.querySelector("[data-action='quiz-reset']")?.addEventListener("click", () => {
      questions.forEach(q => {
        q.querySelectorAll(".quiz-opt").forEach(l => l.classList.remove("correct", "wrong"));
        q.querySelectorAll("input").forEach(i => (i.checked = false));
        q.querySelector(".quiz-q__exp")?.classList.remove("show");
      });
      const score = quiz.querySelector("[data-quiz-score]");
      if (score) score.textContent = "";
    });
  }
})();
