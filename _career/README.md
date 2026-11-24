# 이력서 열람

GitHub Pages의 마지막 액자는 `https://typ0s2d10-resume.typ0s2d10.workers.dev/`를 엽니다. Google Cloud의 `typ0s2d10` 프로젝트에 이 호스트 전용 reCAPTCHA v2 체크박스 키가 등록되어 있습니다.

Worker는 Google의 검증 결과와 호스트명이 모두 일치하면 무작위 열람 키를 발급하고 `/resume.html`로 이동시킵니다. 키는 HTTPS 전용 HttpOnly 쿠키로 전송됩니다. Durable Object가 유효 시간을 확인하고 키를 한 번만 사용하도록 처리합니다. 새로고침하거나 60초가 지나면 사용자 확인을 다시 거칩니다.

## 배포

이 디렉터리의 `.dev.vars`에 사이트 키, 서버 비밀 키, 본문 암호화 키가 설정되어 있습니다. 아래 명령으로 세 값을 Worker 시크릿에 함께 등록하고 배포합니다. 갤러리는 기존 GitHub Pages 절차로 배포합니다.

```sh
wrangler deploy --secrets-file .dev.vars
```

## 본문 수정

편집할 파일은 `private/resume.html`입니다. Git에는 AES-GCM으로 암호화한 `sealed.json`을 저장합니다. `.dev.vars`의 `RESUME_CONTENT_KEY`는 비밀번호 관리자에도 보관하십시오. 새 작업 환경에서는 같은 키를 복원한 후 아래 첫 번째 명령으로 HTML을 열 수 있습니다. 두 번째 명령은 수정한 HTML을 새로 암호화합니다.

```sh
node --env-file=.dev.vars content.mjs open
node --env-file=.dev.vars content.mjs seal
```

변경된 `sealed.json`을 배포하면 적용됩니다. 원래 경력서의 스타일 파일은 `styles/`에 있습니다.
