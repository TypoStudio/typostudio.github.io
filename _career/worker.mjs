import { DurableObject } from 'cloudflare:workers'
import sealed from './sealed.json'

const lifetime = 60
const cookieName = '__Host-resume-ticket'
const ticketFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export class ResumeTickets extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS tickets (token TEXT PRIMARY KEY, expires INTEGER NOT NULL)')
  }

  issue() {
    const now = Date.now()
    this.sql.exec('DELETE FROM tickets WHERE expires <= ?', now)
    const token = crypto.randomUUID()
    this.sql.exec('INSERT INTO tickets VALUES (?, ?)', token, now + lifetime * 1000)
    return token
  }

  redeem(token) {
    return this.sql.exec('DELETE FROM tickets WHERE token = ? AND expires > ? RETURNING token', token, Date.now()).toArray().length === 1
  }
}

const headers = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
}

function page(content, status = 200, extra = {}) {
  return new Response(content, { status, headers: { ...headers, ...extra } })
}

function shell(body) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>개발자 이력서 · typ0s2d10</title>
<style>body{max-width:34rem;margin:12vh auto;padding:0 1rem;color:#253545;font:1rem/1.65 system-ui,sans-serif}button{margin-top:1rem;padding:.6rem 1rem;font:inherit;cursor:pointer}a{color:#155293}</style>
<main><h1>개발자 이력서</h1>${body}</main></html>`
}

function notice(message, status) {
  return page(shell(`<p>${message}</p><a href="/">다시 확인하기</a>`), status)
}

function cookie(value, age) {
  return `${cookieName}=${value}; Max-Age=${age}; Path=/; Secure; HttpOnly; SameSite=Strict`
}

async function openResume(secret) {
  const bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', bytes(secret), 'AES-GCM', false, ['decrypt'])
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(sealed.iv) }, key, bytes(sealed.ciphertext))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    if (request.method === 'GET' && (path === '/resume.css' || path === '/resume-custom.css')) {
      return env.STYLES.fetch(request)
    }
    if (request.method === 'GET' && path === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } })
    }
    if (request.method === 'GET' && path === '/') {
      if (!/^[\w-]+$/.test(env.RECAPTCHA_SITE_KEY ?? '') || !env.RECAPTCHA_SECRET || !env.RESUME_CONTENT_KEY) {
        return notice('이력서 열람 설정을 준비하고 있습니다.', 503)
      }
      return page(shell(`<p>이력서를 열려면 아래의 사용자 확인을 완료하십시오.</p>
<form method="post" action="/verify">
<div class="g-recaptcha" data-sitekey="${env.RECAPTCHA_SITE_KEY}"></div>
<noscript><p>사용자 확인을 위해 자바스크립트를 켜 주십시오.</p></noscript>
<button type="submit">이력서 열기</button></form>
<script src="https://www.google.com/recaptcha/api.js?hl=ko" async defer></script>`))
    }
    if (request.method === 'POST' && path === '/verify') {
      if (request.headers.get('Origin') !== url.origin) return notice('다시 사용자 확인을 진행하십시오.', 403)
      if (!env.RECAPTCHA_SECRET || !env.RESUME_CONTENT_KEY) return notice('현재 사용자 확인을 이용할 수 없습니다.', 503)
      if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/x-www-form-urlencoded') {
        return notice('확인 양식을 이용하십시오.', 415)
      }
      const token = new URLSearchParams(await request.text()).get('g-recaptcha-response')
      if (!token || token.length > 8192) return notice('사용자 확인을 완료하십시오.', 403)
      let verification
      try {
        const result = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          body: new URLSearchParams({ secret: env.RECAPTCHA_SECRET, response: token }),
          signal: AbortSignal.timeout(8000)
        })
        if (!result.ok) return notice('잠시 후 다시 시도하십시오.', 503)
        verification = await result.json()
      } catch {
        return notice('확인 서버에 연결할 수 없습니다. 잠시 후 다시 시도하십시오.', 503)
      }
      if (verification?.success !== true || verification.hostname !== url.hostname) {
        return notice('사용자 확인이 만료되었거나 유효하지 않습니다.', 403)
      }
      const ticket = await env.TICKETS.getByName('resume').issue()
      return page(null, 303, { Location: '/resume.html', 'Set-Cookie': cookie(ticket, lifetime) })
    }
    if (request.method === 'GET' && path === '/resume.html') {
      const pair = (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))
      const ticket = pair?.slice(cookieName.length + 1)
      if (!ticketFormat.test(ticket ?? '') || !await env.TICKETS.getByName('resume').redeem(ticket)) {
        return notice('이력서를 열려면 사용자 확인이 필요합니다.', 403)
      }
      try {
        return page(await openResume(env.RESUME_CONTENT_KEY), 200, { 'Set-Cookie': cookie('', 0) })
      } catch {
        return notice('현재 이력서를 열 수 없습니다. 잠시 후 다시 시도하십시오.', 503)
      }
    }
    return page(null, 404)
  }
}
