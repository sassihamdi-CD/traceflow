export default async function run(page, ui) {
  // Go to the main page
  await page.goto('http://localhost:3001')
  await page.waitForTimeout(1000)
  
  // Check initial language (should be English)
  const before = await ui.snapshot()
  console.log("INITIAL:", before)
  
  // Open language switcher using page.locator
  console.log("Clicking globe button...")
  await page.locator('button[aria-label="Change language"]').click()
  await page.waitForTimeout(500)
  
  // Wait for dropdown to appear
  await page.waitForSelector('[role="listbox"]', { timeout: 3000 }).catch(() => console.log("Dropdown not found"))
  
  // Check dropdown opened
  const dropdown = await ui.snapshot()
  console.log("DROPDOWN:", dropdown)
  
  // Use page.locator to find and click Italian option in dropdown
  console.log("Looking for Italian option...")
  const italianOption = page.locator('button:has-text("🇮🇹")')
  const count = await italianOption.count()
  console.log("Italian option count:", count)
  
  if (count > 0) {
    await italianOption.first().click()
    await page.waitForTimeout(2000)
  } else {
    console.log("Italian option not found, checking page content...")
    const html = await page.content()
    console.log("Page HTML length:", html.length)
    // Check if dropdown is in DOM
    const dropdownHtml = await page.locator('[role="listbox"]').innerHTML().catch(() => "not found")
    console.log("Dropdown HTML:", dropdownHtml)
  }
  
  // Wait for potential language switch
  await page.waitForTimeout(2000)
  
  // Check after language switch
  const after = await ui.snapshot()
  console.log("AFTER SWITCH:", after)
  
  // Check page content for Italian text
  const content = await page.textContent('main')
  console.log("MAIN CONTENT:", content)
  
  return { success: true }
}