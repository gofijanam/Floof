import { chromium } from 'playwright-core'
const base = process.env.BASE || 'http://127.0.0.1:5173/'
const shots = JSON.parse(process.argv[2])
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []
for (const s of shots) {
  const mobile = s.vp === 'm'
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${s.name}] ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${s.name}] pageerror: ${e.message}`))
  if (!s.preload) await page.addInitScript(() => sessionStorage.setItem('floof-loaded', '1'))
  await page.goto(base + (s.q ?? '?wallet') + '#' + (s.path || '/'), { waitUntil: 'networkidle' })
  await page.waitForTimeout(s.wait ?? 2500)
  if (s.actions) for (const a of s.actions) {
    if (a.click) await page.click(a.click, { timeout: 5000 }).catch((e) => errors.push(`[${s.name}] click fail ${a.click}`))
    if (a.fill) await page.fill(a.fill[0], a.fill[1]).catch(() => errors.push(`[${s.name}] fill fail ${a.fill[0]}`))
    if (a.scroll != null) await page.evaluate((y) => window.scrollTo(0, y), a.scroll)
    if (a.mouse) await page.mouse.move(a.mouse[0], a.mouse[1], { steps: 8 })
    if (a.wait) await page.waitForTimeout(a.wait)
    if (a.eval) await page.evaluate(a.eval)
  }
  await page.screenshot({ path: `screenshots/${s.name}.png`, fullPage: !!s.full, timeout: 120000 }).catch((e) => errors.push(`[${s.name}] screenshot fail ${e.message.split('\n')[0]}`))
  await ctx.close()
}
await browser.close()
console.log(errors.length ? errors.join('\n') : 'NO CONSOLE ERRORS')
