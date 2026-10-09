export default async function run(page, ui) {
  await page.goto('http://localhost:3001/login')
  await page.waitForTimeout(2000)
  
  // Get console errors
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })
  
  await page.waitForTimeout(2000)
  
  // Get page content
  const content = await page.content()
  
  return { errors, contentLength: content.length }
}