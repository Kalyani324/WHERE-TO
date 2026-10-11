// Plays a Quick Mode game alone with ?bots=1 in Devin's Chrome, screenshotting each step in both themes.
import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://localhost:29229')
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, ...(process.env.UA ? { userAgent: process.env.UA } : {}) })
const page = await ctx.newPage()
const out = process.env.HOME + (process.env.OUT || '/shots')
const seen = new Set()
const shot = async (name) => {
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${out}/${name}-${scheme}.png` })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}
await page.goto((process.env.BASE || 'http://localhost:5173') + '/?bots=1')
await page.waitForSelector('#name')
await shot('01-home')
await page.fill('#name', 'Kalyani')
await page.click('text=Create room')
await page.waitForSelector('.room-code')
await page.click('[aria-label="More bots"]').catch(() => {})
await page.getByRole('button', { name: 'Add', exact: true }).click()
await page.waitForTimeout(800)
await shot('02-lobby')
await page.click('text=Start game')
const step = () => page.evaluate(() => document.querySelector('.instruction')?.textContent ?? '')
const t0 = Date.now()
while (Date.now() - t0 < 240000) {
  await page.waitForTimeout(700)
  const s = await step()
  const key = s + (await page.evaluate(() => document.querySelector('h2')?.textContent ?? ''))
  if (!seen.has(key)) {
    seen.add(key)
    await page.waitForTimeout(400)
    await shot(String(seen.size + 2).padStart(2, '0') + '-' + s.replace(/[^a-z0-9]+/gi, '_').toLowerCase())
    console.log('shot', key)
  }
  const click = async (sel) => page.locator(sel).first().click({ timeout: 1500 }).catch(() => {})
  if (s === 'Quick quiz') await click('text=Lock in answers')
  else if (s === 'Pitch a trip') await click("text=I'll support")
  else if (s.startsWith('Round 1') || s === 'Back a plan' || s === 'Final vote') await click('.choice[aria-pressed="false"]')
  else if (s.startsWith('Round 2')) await click('text=Keep')
  else if (s === 'The verdict') { await page.waitForTimeout(3500); await shot('99-reveal'); await page.waitForTimeout(25000); await page.evaluate(() => scrollTo(0, 0)); await shot('99-reveal-done'); await page.evaluate(() => scrollTo(0, 900)); await shot('99-reveal-scrolled'); break }
}
await page.click('text=Plans').catch(() => {})
await shot('98-plans')
await page.click('.tab:has-text("Fit")').catch(() => {})
await page.locator('.fit-row').first().click().catch(() => {})
await shot('98-fit')
console.log('done', seen.size)
await ctx.close()
process.exit(0)
