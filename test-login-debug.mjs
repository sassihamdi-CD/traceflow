export default async function run(page, ui) {
  await page.goto('http://localhost:3001/login')
  await page.waitForTimeout(3000)
  
  // Capture console errors
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })
  
  // Also capture page errors
  const pageErrors: string[] = []
  page.on('pageerror', err => {
    pageErrors.push(err.message)
  })
  
  await page.waitForTimeout(3000)
  
  // Get page content
  const content = await page.content()
  
  return { errors, pageErrors, contentLength: content.length }
}