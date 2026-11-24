// Run from _career with RESUME_CONTENT_KEY loaded into the environment.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { webcrypto } from 'node:crypto'

const mode = process.argv[2]
if (!['seal', 'open'].includes(mode)) throw new Error('Use seal or open')
if (!process.env.RESUME_CONTENT_KEY) throw new Error('RESUME_CONTENT_KEY is required')
const key = await webcrypto.subtle.importKey('raw', Buffer.from(process.env.RESUME_CONTENT_KEY, 'base64'), 'AES-GCM', false, ['encrypt', 'decrypt'])
const plaintext = new URL('./private/resume.html', import.meta.url)
const sealed = new URL('./sealed.json', import.meta.url)

if (mode === 'seal') {
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const contents = await readFile(plaintext)
  const encrypted = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, contents)
  await writeFile(sealed, JSON.stringify({ iv: Buffer.from(iv).toString('base64'), ciphertext: Buffer.from(encrypted).toString('base64') }) + '\n')
} else {
  const { iv, ciphertext } = JSON.parse(await readFile(sealed, 'utf8'))
  const contents = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(iv, 'base64') }, key, Buffer.from(ciphertext, 'base64'))
  await mkdir(new URL('./private/', import.meta.url), { recursive: true })
  await writeFile(plaintext, new Uint8Array(contents), { flag: 'wx', mode: 0o600 })
}
