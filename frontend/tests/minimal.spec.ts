import { test, expect } from '@playwright/test'

test.use({
  headless: true,
  viewport: { width: 1280, height: 1024 },
})

test('Minimal Canvas rendering test', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.evaluate(() => window.scrollTo(0, window.innerHeight))
  await page.waitForTimeout(5000)

  const canvases = page.locator('canvas')
  const canvasCount = await canvases.count()
  console.log('Canvas count:', canvasCount)

  for (let i = 0; i < canvasCount; i++) {
    const canvas = canvases.nth(i)
    const box = await canvas.boundingBox()
    console.log(`Canvas ${i}: box=${JSON.stringify(box)}`)

    const pixelData = await canvas.evaluate(async (el) => {
      const gl = el.getContext('webgl') || el.getContext('webgl2')
      if (!gl) return { error: 'no webgl' }
      const pixels = new Uint8Array(4)
      gl.readPixels(el.width / 2, el.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      return {
        width: el.width,
        height: el.height,
        centerPixel: [pixels[0], pixels[1], pixels[2], pixels[3]]
      }
    })
    console.log(`Canvas ${i} pixel data:`, JSON.stringify(pixelData))
  }

  console.log('Console errors:', errors.length)
  errors.forEach((e) => console.log('  ERROR:', e))

  await page.screenshot({ path: '/tmp/test-minimal.png', fullPage: true })
})
