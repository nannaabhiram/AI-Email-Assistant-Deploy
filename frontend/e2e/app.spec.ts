import { expect, test, type Page } from '@playwright/test'

/** Synthetic demo user created by supabase/seed.sql (local development only). */
const DEMO = { email: 'demo@mailpilot.test', password: 'mailpilot-demo-password' }

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(DEMO.email)
  await page.getByLabel('Password').fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('login form validates input before contacting the server', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Enter a valid email address')).toBeVisible()
  await expect(page.getByText('Enter your password')).toBeVisible()
  await page.getByLabel('Email').fill(DEMO.email)
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password')
})

test('dashboard shows counts, status and inference health', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Good')
  await expect(page.getByRole('link', { name: /High priority \(7d\)/ })).toBeVisible()
  await expect(page.getByText('DGX inference', { exact: true })).toBeVisible()
  // The banner must match the live inference state reported by the API (Spark 2 may or may not be up).
  const state = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))
    const token = key ? (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token : ''
    const res = await fetch('http://localhost:8000/api/v1/system/status', { headers: { Authorization: `Bearer ${token}` } })
    return ((await res.json()) as { llm: { state: string } }).llm.state
  })
  const banners: Record<string, RegExp> = {
    not_configured: /No DGX inference endpoint is configured/, unreachable: /DGX inference is offline/,
    model_missing: /does not serve the configured model/,
  }
  for (const [s, text] of Object.entries(banners)) {
    if (s === state) await expect(page.getByText(text)).toBeVisible()
    else await expect(page.getByText(text)).toHaveCount(0)
  }
  await expect(page.getByRole('list', { name: 'Important emails' })).toContainText('Q4 vendor contract renewal')
  await page.screenshot({ path: `e2e/screenshots/dashboard-${test.info().project.name}.png`, fullPage: true })
})

test('priority inbox filters, detail analysis and priority override', async ({ page }) => {
  await signIn(page)
  await page.goto('/inbox')
  await page.getByRole('button', { name: 'High', exact: true }).click()
  await expect(page).toHaveURL(/f=HIGH/)
  const list = page.getByRole('list', { name: 'Emails' })
  await expect(list).toContainText('URGENT: update payroll bank details today')
  await expect(list).not.toContainText('Weekly product digest')

  await list.getByRole('button', { name: /Q4 vendor contract renewal/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Q4 vendor contract renewal')
  await expect(page.getByRole('meter', { name: 'Priority score' })).toBeVisible()
  await expect(page.getByText('No risk indicators detected')).toBeVisible()
  await page.screenshot({ path: `e2e/screenshots/email-detail-${test.info().project.name}.png`, fullPage: true })

  const group = page.getByRole('group', { name: 'Set priority' })
  await group.getByRole('button', { name: 'Medium' }).click()
  await expect(page.getByText('Priority updated')).toBeVisible()
  await expect(group.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true')
  await group.getByRole('button', { name: 'Reset to AI' }).click()
  await expect(group.getByRole('button', { name: 'High' })).toHaveAttribute('aria-pressed', 'true')
})

test('phishing email shows security warnings and the safety disclaimer', async ({ page }) => {
  await signIn(page)
  await page.goto('/inbox?f=risky')
  await page.getByRole('button', { name: /URGENT: update payroll/ }).click()
  const panel = page.getByRole('region', { name: 'Security analysis' })
  await expect(panel).toContainText('Payment instruction change')
  await expect(panel).toContainText('does not guarantee an email is safe')
})

test('natural-language search finds the last quotation', async ({ page }) => {
  await signIn(page)
  await page.goto('/search')
  test.setTimeout(120_000)
  await page.getByRole('button', { name: 'Find the last quotation someone sent me' }).click()
  // With Spark 2 available the query is parsed by the model, which can take tens of seconds.
  await expect(page.getByRole('region', { name: 'Search results' })).toContainText('Quotation for 40 laptops', { timeout: 90_000 })
})

test('drafting a reply cannot be sent without send permission and approval', async ({ page }) => {
  await signIn(page)
  await page.goto(`/inbox?q=${encodeURIComponent('Design review sync')}`)
  await page.getByRole('button', { name: /Design review sync on Thursday/ }).click()
  await page.getByRole('button', { name: 'Draft reply' }).click()
  const dialog = page.getByRole('dialog', { name: 'Draft a reply' })
  // Keep the test independent of the DGX: never generate text, always start from a blank draft.
  const useAi = dialog.getByRole('checkbox', { name: /Write the first version with AI/ })
  if (await useAi.isChecked()) await useAi.uncheck()
  await dialog.getByRole('button', { name: 'Start blank draft' }).click()
  await expect(page.getByRole('heading', { name: 'Reply drafts' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Message' }).fill('Hi Arjun, Thursday 3 PM works for me.')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Draft saved')).toBeVisible()
  await page.getByRole('button', { name: 'Request send approval' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Sending requires Gmail send permission' })).toBeVisible()
  await page.getByRole('button', { name: 'Discard' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click()
  await expect(page).toHaveURL(/\/drafts$/)
})

test('tasks show evidence and suggested items await confirmation', async ({ page }) => {
  await signIn(page)
  await page.goto('/tasks')
  await expect(page.getByText('sign it by Friday 5 PM IST')).toBeVisible()
  await page.getByRole('tab', { name: /Needs confirmation/ }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Confirm SLA change in section 4')
})

test('mobile navigation drawer works', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile only')
  await signIn(page)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Approvals', exact: true }).click()
  await expect(page).toHaveURL(/\/approvals/)
  await expect(page.getByRole('heading', { name: 'Pending approvals' })).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/approvals-mobile.png', fullPage: true })
})
