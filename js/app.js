/* The Plant Lab — site logic
 * Vanilla JS, no dependencies. Modules:
 *   - theme (light/dark, persisted)
 *   - mobile menu
 *   - module progress (localStorage)
 *   - quiz interactivity + spaced-repetition scheduling (SM-2 simplified)
 *   - glossary search
 *   - module TOC scroll-spy
 *   - reading progress bar + scroll-position restore
 *   - kitchen mode (full-screen lab with checkboxes, timer, wake lock)
 *   - site-wide search (Cmd-K / "/" modal, JSON index)
 *   - reveal-on-scroll
 */

(() => {
  "use strict";

  const STORE = {
    PROGRESS: "vfs.progress.v1",
    THEME: "vfs.theme",
    SR: "vfs.sr.v1",                 // spaced-repetition state per question
    KITCHEN: "vfs.kitchen.v1",       // step checkbox state per lab
    SCROLL: "vfs.scroll.v1",         // last scroll Y per page
  };

  const root = document.documentElement;
  const savedTheme = localStorage.getItem(STORE.THEME);
  if (savedTheme === "dark") root.setAttribute("data-theme", "dark");

  // ---------- helpers ----------
  const get = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
    catch { return fallback; }
  };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  function toggleTheme() {
    const dark = root.getAttribute("data-theme") === "dark";
    if (dark) { root.removeAttribute("data-theme"); localStorage.setItem(STORE.THEME, "light"); }
    else { root.setAttribute("data-theme", "dark"); localStorage.setItem(STORE.THEME, "dark"); }
  }

  // Module progress
  const Progress = {
    all: () => get(STORE.PROGRESS, {}),
    mark: (id) => { const p = Progress.all(); p[id] = { done: true, when: Date.now() }; set(STORE.PROGRESS, p); },
    unmark: (id) => { const p = Progress.all(); delete p[id]; set(STORE.PROGRESS, p); },
  };

  // Spaced repetition (simplified SM-2)
  // For each question key (`${moduleId}:${index}`):
  //   { ef, interval, due, lastSeen, lastResult }
  const SR = {
    all: () => get(STORE.SR, {}),
    schedule(key, correct) {
      const all = SR.all();
      const item = all[key] ?? { ef: 2.5, interval: 0, due: 0, lastSeen: 0, lastResult: null };
      const now = Date.now();
      if (correct) {
        item.interval = item.interval === 0 ? 1 : item.interval === 1 ? 3 : Math.round(item.interval * item.ef);
        item.ef = Math.max(1.3, item.ef + 0.05);
      } else {
        item.interval = 1;
        item.ef = Math.max(1.3, item.ef - 0.2);
      }
      item.lastSeen = now;
      item.due = now + item.interval * 24 * 60 * 60 * 1000;
      item.lastResult = correct;
      all[key] = item;
      set(STORE.SR, all);
    },
    due() {
      const all = SR.all();
      const now = Date.now();
      return Object.entries(all).filter(([, v]) => v.due <= now).map(([k]) => k);
    },
    stats() {
      const all = SR.all();
      const total = Object.keys(all).length;
      const due = SR.due().length;
      const learned = Object.values(all).filter(v => v.interval >= 7).length;
      return { total, due, learned };
    },
  };

  window.VFS = { Progress, SR, toggleTheme };

  // ---------- DOM ready ----------
  document.addEventListener("DOMContentLoaded", () => {
    bindThemeButtons();
    bindMobileMenu();
    highlightActiveNav();
    paintModuleProgress();
    paintCurriculumProgress();
    bindCompleteButtons();
    document.querySelectorAll(".quiz").forEach(initQuiz);
    initGlossarySearch();
    initTOCScrollSpy();
    initReveal();
    initReadingProgress();
    initScrollRestore();
    initKitchenModeForLabs();
    initSiteSearch();
    initReviewPage();
  });

  // ---------- theme + nav ----------
  function bindThemeButtons() {
    document.querySelectorAll("[data-action='toggle-theme']").forEach(b => b.addEventListener("click", toggleTheme));
  }
  function bindMobileMenu() {
    const t = document.querySelector(".menu-toggle"), n = document.querySelector(".nav");
    if (t && n) t.addEventListener("click", () => n.classList.toggle("open"));
  }
  function highlightActiveNav() {
    const path = location.pathname.replace(/index\.html$/, "");
    document.querySelectorAll(".nav a").forEach(a => {
      const href = a.getAttribute("href").replace(/index\.html$/, "");
      if (href && href !== "/" && path.includes(href)) a.classList.add("active");
    });
  }

  // ---------- progress ----------
  function paintModuleProgress() {
    const p = Progress.all();
    document.querySelectorAll(".module-card[data-module-id]").forEach(card => {
      if (p[card.dataset.moduleId]?.done) card.classList.add("completed");
    });
  }
  function paintCurriculumProgress() {
    const totalEl = document.querySelector("[data-progress-total]");
    if (!totalEl) return;
    const total = parseInt(totalEl.dataset.progressTotal, 10) || 1;
    const done = Object.values(Progress.all()).filter(v => v.done).length;
    const fill = document.querySelector(".progress-bar__fill");
    const label = document.querySelector("[data-progress-label]");
    if (fill) fill.style.width = `${Math.round((done / total) * 100)}%`;
    if (label) label.textContent = `${done} of ${total} modules complete`;
  }
  function bindCompleteButtons() {
    document.querySelectorAll("[data-action='mark-complete']").forEach(btn => {
      const id = btn.dataset.moduleId;
      const refresh = () => {
        const done = !!Progress.all()[id]?.done;
        btn.textContent = done ? "✓ Marked complete — undo" : "Mark module complete";
        btn.classList.toggle("btn--ghost", done);
        btn.classList.toggle("btn--primary", !done);
      };
      btn.addEventListener("click", () => {
        if (Progress.all()[id]?.done) Progress.unmark(id); else Progress.mark(id);
        refresh();
      });
      refresh();
    });
  }

  // ---------- quizzes ----------
  function initQuiz(quiz) {
    const moduleId = quiz.dataset.quizId || "q";
    const questions = quiz.querySelectorAll(".quiz-q");
    questions.forEach((q, i) => {
      q.querySelectorAll(".quiz-opt input").forEach((opt, j) => {
        opt.dataset.idx = j;
        opt.name = `${moduleId}-${i}`;
      });
    });
    quiz.querySelector("[data-action='quiz-check']")?.addEventListener("click", () => {
      let correct = 0;
      questions.forEach((q, qi) => {
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
        q.querySelector(".quiz-q__exp")?.classList.add("show");
        if (chosen === answer) correct++;
        if (chosen !== -1) SR.schedule(`${moduleId}:${qi}`, chosen === answer);
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

  // ---------- glossary ----------
  function initGlossarySearch() {
    const input = document.querySelector(".glossary-search");
    if (!input) return;
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      document.querySelectorAll(".glossary-term").forEach(t => {
        t.classList.toggle("hidden", q && !t.textContent.toLowerCase().includes(q));
      });
      document.querySelectorAll(".glossary-letter").forEach(h => {
        let n = h.nextElementSibling, anyVisible = false;
        while (n && !n.classList.contains("glossary-letter")) {
          if (n.classList.contains("glossary-term") && !n.classList.contains("hidden")) { anyVisible = true; break; }
          n = n.nextElementSibling;
        }
        h.style.display = anyVisible ? "" : "none";
      });
    });
  }

  // ---------- module TOC scroll-spy ----------
  function initTOCScrollSpy() {
    const toc = document.querySelector(".toc");
    if (!toc) return;
    const links = [...toc.querySelectorAll("a[href^='#']")];
    const sections = links.map(a => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
    const obs = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.target.offsetTop - b.target.offsetTop);
      if (visible[0]) {
        const id = visible[0].target.id;
        links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + id));
      }
    }, { rootMargin: "-25% 0px -65% 0px" });
    sections.forEach(s => obs.observe(s));
  }

  // ---------- reveal ----------
  function initReveal() {
    const nodes = document.querySelectorAll(".reveal");
    if (!nodes.length) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); } });
    }, { threshold: 0.12 });
    nodes.forEach(n => obs.observe(n));
  }

  // ---------- reading progress (module pages) ----------
  function initReadingProgress() {
    const article = document.querySelector("article");
    if (!article) return;
    const bar = document.createElement("div");
    bar.className = "read-progress";
    bar.innerHTML = '<div class="read-progress__fill"></div>';
    document.body.appendChild(bar);
    const fill = bar.firstElementChild;
    const update = () => {
      const rect = article.getBoundingClientRect();
      const total = article.offsetHeight - window.innerHeight;
      if (total <= 0) { fill.style.width = "100%"; return; }
      const done = Math.min(1, Math.max(0, (-rect.top) / total));
      fill.style.width = `${(done * 100).toFixed(1)}%`;
    };
    document.addEventListener("scroll", update, { passive: true });
    update();
  }

  // ---------- scroll position restore ----------
  function initScrollRestore() {
    const key = location.pathname;
    const saved = get(STORE.SCROLL, {})[key];
    if (saved && saved > 200) {
      requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: "auto" }));
    }
    let pending;
    const save = () => {
      const all = get(STORE.SCROLL, {});
      all[key] = window.scrollY;
      set(STORE.SCROLL, all);
    };
    window.addEventListener("scroll", () => {
      clearTimeout(pending);
      pending = setTimeout(save, 250);
    }, { passive: true });
  }

  // ---------- KITCHEN MODE ----------
  function initKitchenModeForLabs() {
    const labs = document.querySelectorAll(".lab");
    if (!labs.length) return;
    labs.forEach((lab, i) => {
      const moduleId = (document.querySelector("[data-module-id]")?.dataset.moduleId) || `lab-${i}`;
      const title = lab.querySelector(".lab__head h3")?.textContent.trim() || "Kitchen Lab";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lab__kitchen-toggle";
      btn.innerHTML = '<span aria-hidden="true">🍳</span> Open in Kitchen Mode';
      lab.querySelector(".lab__head")?.appendChild(btn);
      btn.addEventListener("click", () => openKitchenMode(lab, `${moduleId}:${i}`, title));
    });
  }

  let _wakeLock = null;
  async function requestWakeLock() {
    try { if ("wakeLock" in navigator) _wakeLock = await navigator.wakeLock.request("screen"); }
    catch (e) { /* ignore */ }
  }
  function releaseWakeLock() {
    if (_wakeLock) { try { _wakeLock.release(); } catch {} _wakeLock = null; }
  }

  function playTimerChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      [880, 1318, 880].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine"; o.frequency.value = freq;
        const t = now + i * 0.18;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + 0.18);
      });
      setTimeout(() => ctx.close(), 1500);
    } catch (e) { /* audio context blocked — vibration still fires */ }
  }

  function openKitchenMode(labEl, key, title) {
    const overlay = buildKitchenOverlay(labEl, key, title);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("open"));
    document.body.classList.add("kitchen-on");
    requestWakeLock();
    const onKey = (e) => { if (e.key === "Escape") closeKitchenMode(overlay, onKey); };
    document.addEventListener("keydown", onKey);
    overlay._onKey = onKey;
  }
  function closeKitchenMode(overlay, onKey) {
    overlay.classList.remove("open");
    document.body.classList.remove("kitchen-on");
    releaseWakeLock();
    document.removeEventListener("keydown", onKey ?? overlay._onKey);
    setTimeout(() => overlay.remove(), 150);
  }

  function buildKitchenOverlay(labEl, key, title) {
    const overlay = document.createElement("div");
    overlay.className = "kitchen-mode";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", `Kitchen mode for ${title}`);
    overlay.innerHTML = `
      <header class="kitchen-mode__bar">
        <button class="kitchen-mode__close" aria-label="Exit kitchen mode">✕</button>
        <div class="kitchen-mode__title">${title}</div>
      </header>
      <main class="kitchen-mode__body">
        <div class="prose-wrap"></div>
      </main>
      <div class="kitchen-timer" hidden>
        <div class="kitchen-timer__presets" aria-label="Timer presets">
          <button data-min="1">1m</button>
          <button data-min="5">5m</button>
          <button data-min="10">10m</button>
          <button data-min="30">30m</button>
        </div>
        <div class="kitchen-timer__display">00:00</div>
        <button class="kitchen-timer__btn" data-action="start-pause">Start</button>
        <button class="kitchen-timer__btn kitchen-timer__btn--ghost" data-action="reset">Reset</button>
      </div>
    `;
    overlay.querySelector(".kitchen-mode__close").addEventListener("click", () => closeKitchenMode(overlay));

    // Render lab content as kitchen-friendly steps + sections
    const wrap = overlay.querySelector(".prose-wrap");
    const body = labEl.querySelector(".lab__body");
    if (body) {
      renderLabBodyToKitchen(body, wrap, key);
    }

    bindKitchenTimer(overlay);
    return overlay;
  }

  function renderLabBodyToKitchen(body, wrap, key) {
    const checks = get(STORE.KITCHEN, {})[key] || {};
    let stepIndex = 0;
    const persist = () => {
      const all = get(STORE.KITCHEN, {});
      all[key] = checks;
      set(STORE.KITCHEN, all);
    };

    [...body.children].forEach(node => {
      const tag = node.tagName.toLowerCase();
      if (tag === "h4") {
        const h = document.createElement("h4");
        h.textContent = node.textContent;
        wrap.appendChild(h);
      } else if (tag === "ol" || tag === "ul") {
        node.querySelectorAll(":scope > li").forEach(li => {
          const idx = stepIndex++;
          const step = document.createElement("div");
          step.className = "kitchen-step";
          step.innerHTML = `<div class="kitchen-step__check" aria-hidden="true"></div><div class="kitchen-step__text"></div>`;
          step.querySelector(".kitchen-step__text").innerHTML = li.innerHTML;
          if (checks[idx]) step.classList.add("done");
          step.setAttribute("role", "checkbox");
          step.setAttribute("aria-checked", !!checks[idx]);
          step.tabIndex = 0;
          const toggle = () => {
            const done = !step.classList.contains("done");
            step.classList.toggle("done", done);
            step.setAttribute("aria-checked", done);
            checks[idx] = done; persist();
          };
          step.addEventListener("click", toggle);
          step.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } });
          wrap.appendChild(step);
        });
      } else if (tag === "p") {
        const p = document.createElement("p");
        p.innerHTML = node.innerHTML;
        wrap.appendChild(p);
      }
    });
  }

  function bindKitchenTimer(overlay) {
    const widget = overlay.querySelector(".kitchen-timer");
    const display = widget.querySelector(".kitchen-timer__display");
    const startBtn = widget.querySelector("[data-action='start-pause']");
    const resetBtn = widget.querySelector("[data-action='reset']");
    const presets = widget.querySelectorAll(".kitchen-timer__presets button");
    let remaining = 0, target = 0, raf, running = false;

    const fmt = (ms) => {
      const s = Math.max(0, Math.round(ms / 1000));
      return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    };
    const tick = () => {
      if (!running) return;
      remaining = target - Date.now();
      if (remaining <= 0) {
        remaining = 0; running = false;
        display.textContent = "00:00";
        playTimerChime();
        if ("vibrate" in navigator) navigator.vibrate([200, 100, 200, 100, 400]);
        widget.animate(
          [{ transform: "translateX(-50%) scale(1)" }, { transform: "translateX(-50%) scale(1.08)" }, { transform: "translateX(-50%) scale(1)" }],
          { duration: 400, iterations: 3 }
        );
        startBtn.textContent = "Start";
        return;
      }
      display.textContent = fmt(remaining);
      raf = requestAnimationFrame(tick);
    };

    presets.forEach(b => b.addEventListener("click", () => {
      const min = parseInt(b.dataset.min, 10);
      remaining = min * 60 * 1000;
      display.textContent = fmt(remaining);
      widget.hidden = false;
      running = false; startBtn.textContent = "Start";
    }));
    startBtn.addEventListener("click", () => {
      if (remaining <= 0) return;
      if (running) {
        running = false; startBtn.textContent = "Resume";
        cancelAnimationFrame(raf);
        remaining = target - Date.now();
      } else {
        running = true; startBtn.textContent = "Pause";
        target = Date.now() + remaining;
        tick();
      }
    });
    resetBtn.addEventListener("click", () => {
      running = false; cancelAnimationFrame(raf);
      remaining = 0; target = 0; display.textContent = "00:00";
      startBtn.textContent = "Start"; widget.hidden = true;
    });

    // Reveal timer on open
    widget.hidden = false;
    display.textContent = "00:00";
  }

  // ---------- SITE SEARCH ----------
  function initSiteSearch() {
    const trigger = document.querySelector("[data-action='open-search']");
    if (!trigger) return;

    let modal = null, items = null, list = null, input = null, active = -1;

    const openModal = () => {
      if (!modal) {
        modal = document.createElement("div");
        modal.className = "search-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-label", "Search the course");
        modal.innerHTML = `
          <div class="search-modal__panel" role="document">
            <div class="search-modal__input-row">
              <span aria-hidden="true">🔎</span>
              <input class="search-modal__input" type="search" placeholder="Search modules, labs, glossary…" aria-label="Search">
              <button class="search-modal__close" aria-label="Close search">esc</button>
            </div>
            <div class="search-results" role="listbox"></div>
          </div>`;
        document.body.appendChild(modal);
        list = modal.querySelector(".search-results");
        input = modal.querySelector(".search-modal__input");
        modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
        modal.querySelector(".search-modal__close").addEventListener("click", closeModal);
        input.addEventListener("input", () => render(input.value));
        input.addEventListener("keydown", onKey);
        loadIndex();
      }
      modal.classList.add("open");
      requestAnimationFrame(() => input.focus());
    };
    const closeModal = () => {
      modal?.classList.remove("open");
    };
    const onKey = (e) => {
      const results = [...list.querySelectorAll(".search-result")];
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(results.length - 1, active + 1); paintActive(results); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); paintActive(results); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); results[active]?.click(); }
      else if (e.key === "Escape") { closeModal(); }
    };
    const paintActive = (results) => {
      results.forEach((r, i) => r.classList.toggle("active", i === active));
      results[active]?.scrollIntoView({ block: "nearest" });
    };

    async function loadIndex() {
      if (items) return;
      try {
        const res = await fetch(document.documentElement.dataset.searchIndex || "/search.json");
        items = await res.json();
      } catch { items = []; }
    }

    function render(query) {
      list.innerHTML = "";
      active = -1;
      const q = query.trim().toLowerCase();
      if (!q) {
        list.innerHTML = '<div class="search-empty">Try "umami," "Maillard," "fermentation"…</div>';
        return;
      }
      if (!items) { list.innerHTML = '<div class="search-empty">Loading index…</div>'; return; }
      const tokens = q.split(/\s+/).filter(Boolean);
      const scored = items.map(it => {
        const hay = (it.title + " " + it.summary + " " + (it.body || "")).toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (it.title.toLowerCase().includes(t)) score += 5;
          if (it.summary.toLowerCase().includes(t)) score += 2;
          if (hay.includes(t)) score += 1;
        }
        return { it, score };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 12);

      if (scored.length === 0) { list.innerHTML = '<div class="search-empty">No matches.</div>'; return; }

      const re = new RegExp("(" + tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
      scored.forEach(({ it }) => {
        const a = document.createElement("a");
        a.className = "search-result";
        a.href = it.url;
        a.setAttribute("role", "option");
        const summary = (it.summary || "").slice(0, 220);
        a.innerHTML = `<strong>${it.title}</strong><small>${it.kind || ""}</small><div>${summary.replace(re, "<mark>$1</mark>")}</div>`;
        list.appendChild(a);
      });
    }

    trigger.addEventListener("click", openModal);
    document.addEventListener("keydown", e => {
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); openModal(); }
      else if (e.key === "/" && !isInput && !modal?.classList.contains("open")) { e.preventDefault(); openModal(); }
    });
  }

  // ---------- REVIEW PAGE ----------
  function initReviewPage() {
    const root = document.querySelector("[data-review-root]");
    if (!root) return;
    const allDataAttr = root.dataset.reviewQuestions;
    if (!allDataAttr) return;
    let bank;
    try { bank = JSON.parse(allDataAttr); } catch { bank = []; }
    if (!bank.length) return;

    const stats = SR.stats();
    document.querySelector("[data-stat-total]")?.replaceChildren(document.createTextNode(stats.total));
    document.querySelector("[data-stat-due]")?.replaceChildren(document.createTextNode(stats.due));
    document.querySelector("[data-stat-learned]")?.replaceChildren(document.createTextNode(stats.learned));

    const due = SR.due();
    const queue = bank.filter(b => due.includes(b.key));
    if (queue.length === 0) {
      // Surface 5 random questions to seed if nothing is due
      const seeded = bank.slice().sort(() => Math.random() - 0.5).slice(0, 5);
      renderReview(root, seeded, true);
    } else {
      renderReview(root, queue, false);
    }
  }

  function renderReview(root, queue, seeding) {
    let i = 0;
    const card = document.createElement("div");
    card.className = "review-card";
    root.appendChild(card);
    const next = () => {
      if (i >= queue.length) {
        card.innerHTML = `<h2>Great session.</h2><p class="muted">You answered ${queue.length} question${queue.length === 1 ? "" : "s"}. Come back tomorrow — your interval grows with each correct answer.</p><p><a href="curriculum/" class="btn btn--primary">Back to curriculum</a></p>`;
        return;
      }
      const q = queue[i];
      const showSeedNote = seeding && i === 0
        ? '<div class="review-card__meta">Warm-up · nothing was due, so here are some random questions</div>'
        : `<div class="review-card__meta">Question ${i + 1} of ${queue.length} · from ${q.module}</div>`;
      card.innerHTML = `${showSeedNote}
        <div class="review-card__q">${q.q}</div>
        <div class="quiz-q__opts">
          ${q.opts.map((o, idx) => `<label class="quiz-opt"><input type="radio" name="rev-${i}" data-idx="${idx}"> ${o}</label>`).join("")}
        </div>
        <div class="quiz-q__exp"></div>
        <div style="margin-top:1rem; display:flex; gap:.5rem; flex-wrap:wrap;">
          <button class="btn btn--primary" data-action="rev-check">Check</button>
          <button class="btn btn--ghost" data-action="rev-skip">Skip</button>
        </div>`;
      const exp = card.querySelector(".quiz-q__exp");
      const opts = card.querySelectorAll(".quiz-opt");
      const check = card.querySelector("[data-action='rev-check']");
      const skip = card.querySelector("[data-action='rev-skip']");
      let answered = false;
      check.addEventListener("click", () => {
        if (answered) { i++; next(); return; }
        let chosen = -1;
        opts.forEach((l, idx) => { if (l.querySelector("input").checked) chosen = idx; });
        if (chosen === -1) return;
        opts.forEach((l, idx) => {
          if (idx === q.answer) l.classList.add("correct");
          else if (idx === chosen) l.classList.add("wrong");
        });
        exp.innerHTML = q.explain || "";
        exp.classList.add("show");
        SR.schedule(q.key, chosen === q.answer);
        check.textContent = "Next →";
        answered = true;
      });
      skip.addEventListener("click", () => { i++; next(); });
    };
    next();
  }
})();
