# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bundle install                              # one-time
bundle exec jekyll serve --livereload       # local dev at http://localhost:4000
bundle exec jekyll build                    # produce _site/ (matches what GH Pages does)
```

There are no tests, linters, or a JS build step — this is a vanilla Jekyll site pinned to the `github-pages` gem.

## Deployment

`.github/workflows/pages.yml` builds and deploys on every push to `main`. The site is served from the apex of `theplantlab.cc` (see `CNAME` and `url:` in `_config.yml`); `baseurl` is empty because of the custom domain. When forking, update `CNAME`, `url:`, and restore a `baseurl:` if it becomes a project page.

## Architecture

**Static Jekyll site, zero JS framework.** All interactive behavior lives in a single IIFE in `js/app.js` (~1.1k lines) that wires up DOM features on `DOMContentLoaded` and exposes `window.VFS = { Progress, SR, toggleTheme }`. State persists per-browser in `localStorage` under the `vfs.*` namespace (`STORE` constants at the top of `app.js`): theme, module completion, spaced-repetition state, kitchen-lab checkboxes, scroll positions. There are no accounts and no backend.

**Course content is config-driven.** `_config.yml` holds the canonical module list under `modules:` (id, slug, title, summary, duration, topics) plus course-level metadata. Pages like `curriculum.html` and `index.html` iterate `site.modules` rather than hardcoding the list. Adding/renaming a module means editing `_config.yml` *and* the corresponding file under `modules/`.

**Module pages share a layout contract.** Each `modules/NN-slug.html` uses `layout: module` and must declare frontmatter the layout depends on: `module_id` (e.g. `m01`), `module_num`, `permalink`, `duration`, `lede`, `sections` (used to render the sidebar TOC), `tags`, and `next`/`prev` (used for the in-page nav). See `_layouts/module.html`.

**Quizzes are split across two files and must stay in sync.** Each in-module quiz reports results to `localStorage` keyed `${quizId}:${questionIndex}` (zero-based, in source order). The standalone Review page reads from `_data/questions.yml`, which contains the same questions keyed identically (e.g. `m1:0`). When you edit a quiz inside a module, update the matching entry in `_data/questions.yml` or the spaced-repetition Review page goes out of sync.

**Spaced repetition.** `js/app.js` implements a simplified SM-2 (`SR.schedule` in `app.js`); only correctness is recorded, with EF and interval updated per attempt. The Review page surfaces items where `due <= now`.

**Visualizations.** Reusable SVG/HTML diagrams live in `_includes/viz/` (e.g. `maillard.html`, `emulsion.html`, `extruder.html`) and are pulled into module pages with `{% include viz/... %}`.

**Comments are off by default.** `comments.enabled` in `_config.yml` is `false`; flipping it on requires real giscus IDs (`repo_id`, `category_id`).

## Conventions worth knowing

- Vanilla CSS variables drive the design system in `css/styles.css`; dark mode is `[data-theme="dark"]` on `<html>`.
- Accessibility is load-bearing: semantic HTML, `:focus-visible` styles, ARIA labels, keyboard navigation. Don't regress these when editing components.
- Content license is CC BY-SA 4.0; site code is MIT.
