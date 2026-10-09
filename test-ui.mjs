export default async function run(page, ui) {
  // First, let's snapshot to see what's there
  const before = await ui.snapshot()
  console.log("BEFORE:", before)
  
  // Click the Reviewer sign in link
  const signInMatch = before.match(/@(e\d+) link "Reviewer sign in"/)
  if (!signInMatch) return { error: 'no sign-in link', snapshot: before }
  
  await ui.click(signInMatch[1])
  await page.waitForTimeout(1000)
  
  // Snapshot again after navigation
  const after = await ui.snapshot()
  console.log("AFTER:", after)
  
  return { before, after }
}