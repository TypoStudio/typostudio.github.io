# GEMINI.md

This file provides context and instructions for the Gemini CLI agent when working in this repository.

## Project Overview

This is a personal website (TypoStudio/typ0s2d10.github.io) hosted on GitHub Pages. It uses the Jekyll static site generator with the `jekyll-theme-minimal` theme. The project includes a main landing page and a standalone static resume page (`resume.html`).

### Key Technologies
- **Jekyll:** Static site generator for GitHub Pages.
- **GitHub Pages:** Hosting platform.
- **Markdown:** Used for the main landing page (`index.md`).
- **Static Assets:** Large bundled CSS/JS for the resume page.

## Architecture

- `_config.yml`: Jekyll configuration file specifying the theme.
- `index.md`: The primary landing page content.
- `resume.html`: A Korean resume page, exported as an independent static HTML file.
- `resume.css` / `resume.js`: Styles and scripts bundled for `resume.html`. These are large (multi-megabyte) files and should generally be managed via the original source rather than manual edits.

## Development Workflows

### Serving Locally
To run the Jekyll site locally for previewing changes:

```bash
# Note: Ensure jekyll and bundler are installed locally.
bundle exec jekyll serve
```

### Deployment
Deployment is handled automatically by GitHub Pages when changes are pushed to the `master` branch.

### Conventions
- **Main Site:** Update `index.md` or other Markdown files for site content changes.
- **Resume Page:** `resume.html` and its assets are exported standalone files. Exercise caution when editing `resume.css` and `resume.js` manually due to their size and complexity.
- **Languages:** The resume content is in Korean.
