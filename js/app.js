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
    initTodayPanel();
    initSensoryJournal();
    initCertificate();
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
    const certBtn = document.querySelector("[data-action='open-certificate']");
    if (certBtn) certBtn.hidden = done < total;
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

  // ---------- TODAY PANEL ----------
  const FACTS = [
    "Koji's enzymes — proteases, amylases, lipases — are the engine behind soy sauce, miso, and sake.",
    "Aquafaba's foaming power comes from saponins and small soluble proteins parking at the air–water interface.",
    "Maillard browning needs ≈140 °C; boiling water caps the surface at 100 °C — so wet pans don't brown.",
    "Methylcellulose gels when heated and melts when cooled — backwards from most hydrocolloids. It's the magic in plant burgers.",
    "Algae are the original source of long-chain omega-3s. Fish are the middlemen.",
    "Soy stores its proteins so densely that even a 7% solution can be turned into tofu.",
    "Glutamate plus a 5'-ribonucleotide produces an umami response 8–15× stronger than either alone.",
    "Calcium ions cross-link alginate chains via the 'egg-box' model — the secret behind spherification.",
    "Coconut oil is solid because of lauric acid, a saturated fatty acid whose chains pack tightly.",
    "Cultured cashew cheese works for the same reason dairy cheese does: lactic acid bacteria drop the pH to the proteins' isoelectric point.",
    "A plant-based shift could free roughly 3.1 billion hectares of farmland — an area about the size of Africa.",
    "Mycelium grows naturally fibrous — no extruder needed. That's why Quorn and Meati can make whole cuts.",
    "Phytic acid in legumes is reduced by 50–90% via sourdough fermentation — the chemistry behind ancient wisdom.",
    "Kala namak's 'eggy' flavor comes from natural hydrogen sulfide — the same volatile compound in cooked yolks.",
    "Aspergillus oryzae was officially named Japan's national microbe in 2006."
  ];

  function initTodayPanel() {
    const panel = document.querySelector("[data-today]");
    const hero = document.querySelector("[data-hero]");
    if (!panel || !hero) return;
    const dismissed = localStorage.getItem("vfs.today.dismissed") === "true";
    const progress = Progress.all();
    const hasProgress = Object.keys(progress).length > 0;
    if (dismissed || !hasProgress) return;

    fetch(document.documentElement.dataset.searchIndex || "/search.json")
      .then(r => r.json())
      .then(items => {
        const modules = items.filter(it => it.kind && it.kind.startsWith("Module ")).sort((a, b) => a.kind.localeCompare(b.kind));
        // Map module URL → id (m01, m02, ...) by index
        const byId = {};
        modules.forEach((m, i) => { byId[`m${String(i + 1).padStart(2, "0")}`] = m; });

        const doneCount = Object.values(progress).filter(v => v.done).length;
        // Next module to resume — first one not done
        let next = modules.find((m, i) => !progress[`m${String(i + 1).padStart(2, "0")}`]?.done);
        if (!next) next = modules[modules.length - 1]; // all done — point at capstone

        const titleEl = panel.querySelector("[data-today-title]");
        if (titleEl) {
          titleEl.textContent = doneCount === 0
            ? "You started — let's keep going."
            : doneCount >= 12
              ? "You finished the course. 🌿"
              : `${doneCount} of 12 modules done. Keep the streak.`;
        }

        const resume = panel.querySelector("[data-today-resume]");
        if (resume) {
          resume.href = next.url;
          panel.querySelector("[data-today-resume-title]").textContent = next.title;
        }

        const stats = SR.stats();
        const reviewTitle = panel.querySelector("[data-today-review-title]");
        if (reviewTitle) {
          reviewTitle.textContent = stats.due === 0
            ? (stats.total === 0 ? "No questions in queue yet" : "Caught up — no reviews due")
            : `${stats.due} question${stats.due === 1 ? "" : "s"} due today`;
        }

        const factEl = panel.querySelector("[data-today-fact]");
        if (factEl) {
          const dayIdx = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % FACTS.length;
          factEl.textContent = FACTS[dayIdx];
        }

        hero.hidden = true;
        panel.hidden = false;
      })
      .catch(() => { /* If index fails, fall back to default hero — silent */ });

    panel.querySelector("[data-today-dismiss]")?.addEventListener("click", () => {
      localStorage.setItem("vfs.today.dismissed", "true");
      panel.hidden = true;
      hero.hidden = false;
    });
  }

  // ---------- SENSORY JOURNAL ----------
  const JOURNAL_DB = "vfs.journal.v1";
  const JOURNAL_STORE = "entries";

  function openJournalDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(JOURNAL_DB, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(JOURNAL_STORE)) {
          const store = db.createObjectStore(JOURNAL_STORE, { keyPath: "id", autoIncrement: true });
          store.createIndex("by_lab", "labKey", { unique: false });
          store.createIndex("by_date", "date", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function journalAdd(entry) {
    const db = await openJournalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(JOURNAL_STORE, "readwrite");
      tx.objectStore(JOURNAL_STORE).add(entry).onsuccess = (e) => resolve(e.target.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function journalAll() {
    const db = await openJournalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(JOURNAL_STORE, "readonly");
      const req = tx.objectStore(JOURNAL_STORE).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.date - a.date));
      req.onerror = () => reject(req.error);
    });
  }
  async function journalDelete(id) {
    const db = await openJournalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(JOURNAL_STORE, "readwrite");
      tx.objectStore(JOURNAL_STORE).delete(id).onsuccess = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function initSensoryJournal() {
    // Inject "Log this batch" button into every lab on module pages
    document.querySelectorAll(".lab").forEach((lab) => {
      const moduleId = document.querySelector("[data-module-id]")?.dataset.moduleId || "lab";
      const labTitle = lab.querySelector(".lab__head h3")?.textContent.trim() || "Kitchen Lab";
      const head = lab.querySelector(".lab__head");
      if (!head) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lab__journal-btn";
      btn.innerHTML = '<span aria-hidden="true">📓</span> Log this batch';
      head.appendChild(btn);
      btn.addEventListener("click", () => openJournalModal({ labKey: `${moduleId}:${labTitle}`, labTitle }));
    });
    // Render the /journal/ page if we're on it
    renderJournalPage();
  }

  function openJournalModal(ctx) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-label="Log a batch">
        <header class="modal__head">
          <h3>Log this batch</h3>
          <button class="modal__close" aria-label="Close">✕</button>
        </header>
        <div class="modal__body">
          <p class="muted" style="margin-top:0;">${ctx.labTitle}</p>
          <label class="field">
            <span>Photo (optional)</span>
            <input type="file" accept="image/*" data-j="photo">
          </label>
          <div class="ratings">
            ${["Texture","Aroma","Body","Balance","Finish"].map(a => `
              <label class="rating">
                <span>${a}</span>
                <input type="range" min="1" max="9" value="5" data-j-rating="${a.toLowerCase()}">
                <output>5</output>
              </label>`).join("")}
          </div>
          <label class="field">
            <span>Notes</span>
            <textarea rows="4" data-j="notes" placeholder="What worked, what didn't, what you'd change next time…"></textarea>
          </label>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" data-j-cancel>Cancel</button>
          <button class="btn btn--primary" data-j-save>Save batch</button>
        </footer>
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    const close = () => { overlay.remove(); document.body.style.overflow = ""; };
    overlay.querySelector(".modal__close").addEventListener("click", close);
    overlay.querySelector("[data-j-cancel]").addEventListener("click", close);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

    overlay.querySelectorAll(".rating input").forEach(input => {
      const out = input.nextElementSibling;
      input.addEventListener("input", () => out.value = input.value);
    });

    overlay.querySelector("[data-j-save]").addEventListener("click", async () => {
      const photoInput = overlay.querySelector("[data-j='photo']");
      const file = photoInput.files[0];
      const ratings = {};
      overlay.querySelectorAll("[data-j-rating]").forEach(r => ratings[r.dataset.jRating] = parseInt(r.value, 10));
      const notes = overlay.querySelector("[data-j='notes']").value.trim();

      let photo = null;
      if (file) {
        photo = await new Promise(res => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.readAsDataURL(file);
        });
      }
      await journalAdd({
        date: Date.now(),
        labKey: ctx.labKey,
        labTitle: ctx.labTitle,
        ratings, notes, photo,
      });
      close();
      // Toast
      showToast("Saved to your journal.");
    });
  }

  function showToast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2400);
  }

  async function renderJournalPage() {
    const root = document.querySelector("[data-journal-root]");
    if (!root) return;
    let entries;
    try { entries = await journalAll(); } catch { entries = []; }

    if (entries.length === 0) {
      root.innerHTML = `
        <div class="callout callout--note">
          <div class="callout__title">No entries yet</div>
          <p style="margin:0;">Open any module's lab and tap <strong>📓 Log this batch</strong> after you cook. Your photos, notes, and ratings will collect here as a personal portfolio.</p>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="journal__bar">
        <p class="muted" style="margin:0;">${entries.length} batch${entries.length === 1 ? "" : "es"} logged. All entries live on this device only.</p>
        <button class="btn btn--ghost" data-j-print>Export as PDF</button>
      </div>
      <div class="journal__list">
        ${entries.map(e => `
          <article class="journal-entry">
            ${e.photo ? `<img src="${e.photo}" alt="" class="journal-entry__photo">` : '<div class="journal-entry__photo journal-entry__photo--empty"></div>'}
            <div class="journal-entry__body">
              <header>
                <h3>${e.labTitle}</h3>
                <small>${new Date(e.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</small>
              </header>
              <div class="journal-entry__ratings">
                ${Object.entries(e.ratings || {}).map(([k, v]) => `<span class="rating-chip"><strong>${k}</strong> ${v}/9</span>`).join("")}
              </div>
              ${e.notes ? `<p class="journal-entry__notes">${e.notes.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>` : ''}
              <button class="journal-entry__del" data-j-del="${e.id}">Delete</button>
            </div>
          </article>`).join("")}
      </div>`;

    root.querySelectorAll("[data-j-del]").forEach(b =>
      b.addEventListener("click", async () => {
        if (!confirm("Delete this batch?")) return;
        await journalDelete(parseInt(b.dataset.jDel, 10));
        renderJournalPage();
      })
    );
    root.querySelector("[data-j-print]")?.addEventListener("click", () => window.print());
  }

  // ---------- COMPLETION CERTIFICATE ----------
  function initCertificate() {
    // ?cert=preview anywhere on the site opens the certificate modal — for sharing.
    // Doesn't touch the vfs.cert.seen flag so the real moment still happens organically.
    if (new URLSearchParams(location.search).get("cert") === "preview") {
      requestAnimationFrame(launchCertificate);
    }

    // Trigger when the user marks the 12th module complete
    document.querySelectorAll("[data-action='mark-complete']").forEach(btn => {
      btn.addEventListener("click", () => {
        // Slight delay so progress write happens first
        setTimeout(() => {
          const done = Object.values(Progress.all()).filter(v => v.done).length;
          const seen = localStorage.getItem("vfs.cert.seen") === "true";
          if (done >= 12 && !seen) {
            localStorage.setItem("vfs.cert.seen", "true");
            launchCertificate();
          }
        }, 80);
      });
    });

    // Allow re-opening the certificate from the curriculum page if already earned
    document.querySelectorAll("[data-action='open-certificate']").forEach(btn =>
      btn.addEventListener("click", launchCertificate)
    );
  }

  function launchCertificate() {
    fireConfetti();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open";
    overlay.innerHTML = `
      <div class="modal modal--cert" role="dialog" aria-label="Course certificate">
        <header class="modal__head">
          <h3>You finished. 🌿</h3>
          <button class="modal__close" aria-label="Close">✕</button>
        </header>
        <div class="modal__body">
          <p>Twelve modules. Eleven kitchen labs. A capstone product. Add your name and download a certificate worth printing.</p>
          <label class="field">
            <span>Your name</span>
            <input type="text" data-cert-name placeholder="Jamie Rivera" maxlength="48" autocomplete="name">
          </label>
          <div class="cert-preview" data-cert-preview></div>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" data-cert-cancel>Maybe later</button>
          <button class="btn btn--primary" data-cert-download disabled>Download certificate</button>
        </footer>
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    const nameInput = overlay.querySelector("[data-cert-name]");
    const dl = overlay.querySelector("[data-cert-download]");
    const preview = overlay.querySelector("[data-cert-preview]");

    const renderPreview = () => {
      const name = nameInput.value.trim() || "Your name";
      preview.innerHTML = certificateSVG(name, true);
      dl.disabled = !nameInput.value.trim();
    };
    nameInput.addEventListener("input", renderPreview);
    renderPreview();
    requestAnimationFrame(() => nameInput.focus());

    const close = () => { overlay.remove(); document.body.style.overflow = ""; };
    overlay.querySelector(".modal__close").addEventListener("click", close);
    overlay.querySelector("[data-cert-cancel]").addEventListener("click", close);

    dl.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) return;
      downloadCertificate(name);
    });
  }

  function certificateSVG(name, scaled) {
    const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const w = 1200, h = 800;
    const safe = name.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${scaled ? '100%' : w}" height="${scaled ? 'auto' : h}">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fdfaf3"/>
            <stop offset="100%" stop-color="#ede1c4"/>
          </linearGradient>
          <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#36732a"/>
            <stop offset="100%" stop-color="#c25b3a"/>
          </linearGradient>
        </defs>
        <rect width="${w}" height="${h}" fill="url(#bg)"/>
        <rect x="40" y="40" width="${w-80}" height="${h-80}" fill="none" stroke="#36732a" stroke-width="3" rx="14"/>
        <rect x="56" y="56" width="${w-112}" height="${h-112}" fill="none" stroke="#36732a" stroke-width="0.8" stroke-dasharray="3 6" rx="10"/>
        <text x="${w/2}" y="170" text-anchor="middle" font-family="Inter, sans-serif" font-size="22" letter-spacing="6" fill="#36732a">THE PLANT LAB</text>
        <text x="${w/2}" y="240" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="60" fill="#14201a">Certificate of Completion</text>
        <text x="${w/2}" y="320" text-anchor="middle" font-family="Inter, sans-serif" font-size="18" fill="#5a6660">awarded to</text>
        <text x="${w/2}" y="400" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="72" font-style="italic" fill="#14201a">${safe}</text>
        <line x1="${w/2-220}" y1="430" x2="${w/2+220}" y2="430" stroke="url(#accent)" stroke-width="3"/>
        <text x="${w/2}" y="490" text-anchor="middle" font-family="Inter, sans-serif" font-size="20" fill="#2f3a35">for completing all twelve modules of</text>
        <text x="${w/2}" y="525" text-anchor="middle" font-family="Inter, sans-serif" font-size="20" fill="#2f3a35">the Plant Lab curriculum in vegan food science —</text>
        <text x="${w/2}" y="560" text-anchor="middle" font-family="Inter, sans-serif" font-size="20" fill="#2f3a35">eleven kitchen labs and a capstone product.</text>

        <g transform="translate(${w/2}, ${h-160})">
          <circle r="60" fill="none" stroke="#36732a" stroke-width="3"/>
          <circle r="50" fill="#36732a"/>
          <text y="-2" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="40" font-weight="600" fill="white">P</text>
          <text y="22" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" letter-spacing="3" fill="white">PLANT LAB</text>
        </g>

        <text x="160" y="${h-80}" font-family="Inter, sans-serif" font-size="14" fill="#5a6660">Awarded ${date}</text>
        <text x="${w-160}" y="${h-80}" text-anchor="end" font-family="Inter, sans-serif" font-size="14" fill="#5a6660">theplantlab.io</text>
      </svg>`;
  }

  function downloadCertificate(name) {
    const svg = certificateSVG(name, false);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2400; canvas.height = 1600;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `the-plant-lab-${name.replace(/\s+/g, "-").toLowerCase()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, "image/png");
    };
    img.onerror = () => alert("Could not render the certificate image. Please try again.");
    img.src = url;
  }

  function fireConfetti() {
    const c = document.createElement("canvas");
    c.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:300";
    c.width = innerWidth; c.height = innerHeight;
    document.body.appendChild(c);
    const ctx = c.getContext("2d");
    const colors = ["#36732a", "#6dac57", "#c25b3a", "#d6a83a", "#8c3a5e"];
    const pieces = Array.from({ length: 140 }, () => ({
      x: Math.random() * c.width,
      y: -20 - Math.random() * c.height * 0.4,
      r: 4 + Math.random() * 6,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      a: Math.random() * Math.PI * 2,
      va: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    let frames = 0, raf;
    const tick = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      pieces.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.a += p.va; p.vy += 0.04;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
        ctx.restore();
      });
      frames++;
      if (frames < 240) raf = requestAnimationFrame(tick);
      else c.remove();
    };
    tick();
  }
})();
