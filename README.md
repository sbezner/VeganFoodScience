# The Plant Lab

An open, hands-on curriculum in **vegan food science** — built to be hosted on GitHub Pages.

> Twelve modules. Sixty-plus hours of material. Eleven kitchen labs. One capstone product.
> Free, open, and remixable.

## Live site

This site is built with Jekyll and is deployed automatically by GitHub Pages.
After enabling Pages in repository **Settings → Pages → Source: `main` branch / root**, it will be served at:

```
https://sbezner.github.io/veganfoodscience/
```

(or your custom domain if you add one).

## What's in the curriculum

1. Foundations of Plant-Based Food Chemistry
2. Plant Proteins: The Building Blocks
3. Fats, Oils, and Plant Lipids
4. Carbohydrates, Starches, and Hydrocolloids
5. The Art and Science of Fermentation
6. Texturization Technologies
7. Flavor and Sensory Science
8. Replacing Eggs and Dairy
9. Nutrition and Bioavailability
10. Sustainability and Food Systems
11. The Frontier: Precision Fermentation, Cellular Ag &amp; 3-D Printing
12. Capstone — Design a Plant-Based Product

Each module includes:
- A substantive lesson with diagrams and tables
- A hands-on kitchen lab built around basic equipment
- A self-check quiz with explanations
- Module-completion tracking saved to the visitor's browser

## Project layout

```
.
├── _config.yml            # Site + course metadata
├── _layouts/              # default + module layouts
├── _includes/             # shared header & footer
├── css/styles.css         # Custom design system
├── js/app.js              # Theme, quizzes, progress, glossary search
├── modules/               # 12 module pages
├── index.html             # Landing page
├── curriculum.html        # Curriculum overview with progress bar
├── labs.html              # Kitchen labs index
├── glossary.html          # Searchable glossary
├── resources.html         # Books, papers, organizations
├── about.html             # About the course
└── Gemfile                # Pinned to github-pages gem
```

## Running locally

```bash
bundle install
bundle exec jekyll serve --livereload
```

Open `http://localhost:4000`.

You don't strictly need Jekyll installed locally — GitHub Pages will build the site for you on every push.

## Tech notes

- **No JS framework.** Vanilla CSS variables, vanilla JS, ~6 KB of script.
- **Dark mode** persisted in `localStorage`.
- **Module progress** saved per-browser; no accounts.
- **Quizzes** are markup-driven — see `js/app.js` for the schema.
- **Accessible by design** — semantic HTML, `:focus-visible`, ARIA labels, sufficient contrast in both themes, fully keyboard navigable.

## License

Content is released under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
The site code is MIT-licensed; do as you wish.

Pull requests, translations, and corrections welcome. The plant-based food world moves fast — this course is meant to keep up.
