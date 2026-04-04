# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GitHub Pages 기반 개인 사이트 (TypoStudio/typ0s2d10.github.io). Jekyll의 `jekyll-theme-minimal` 테마를 사용하며, 정적 이력서 페이지(`resume.html`)를 호스팅한다.

## Architecture

- `_config.yml` — Jekyll 설정 (테마 지정)
- `index.md` — GitHub Pages 기본 랜딩 페이지 (Markdown, Jekyll이 빌드)
- `resume.html` — 한국어 이력서 페이지 (독립 정적 HTML, Jekyll 빌드 대상 아님)
- `resume.css` / `resume.js` — 이력서 페이지 전용 스타일/스크립트

`resume.html`은 외부 서비스에서 export한 단일 파일로, Jekyll 레이아웃을 사용하지 않는 독립 HTML이다. CSS/JS도 번들된 단일 파일이므로 직접 수정보다는 원본 소스에서 재export하는 것이 일반적이다.

## Development

로컬에서 Jekyll 사이트를 실행하려면:

```bash
bundle exec jekyll serve
```

GitHub Pages에 배포는 `master` 브랜치에 push하면 자동으로 이루어진다.
