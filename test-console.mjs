export default async function run(page, ui) {
  // Go to the main page
  await page.goto('http://localhost:3001')
  await page.waitForTimeout(500)
  
  // Click "Open the reviewer console"
  const before = await ui.snapshot()
  console.log("HOME:", before)
  
  const consoleMatch = before.match(/@(e\d+) link "Open the reviewer console"/)
  if (!consoleMatch) return { error: 'no console link', snapshot: before }
  
  await ui.click(consoleMatch[1])
  await page.waitForTimeout(1000)
  
  // Check what's on the console page
  const after = await ui.snapshot()
  console.log("CONSOLE:", after)
  
  return { home: before, console: after }
}