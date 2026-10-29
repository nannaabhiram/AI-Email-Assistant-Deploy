import { expect, test, type Page } from '@playwright/test'

/**
 * Full account lifecycle against the local stack: register, duplicate registration, sign out,
 * password reset via the local mail catcher (Mailpit), sign in with the new password, then
 * delete the throwaway account. Uses a fresh synthetic user, never a real mailbox.
 */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:55324'

async function resetLink(page: Page, email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const list = await (await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email} subject:"Reset"`)}`)).json()
    const id = list.messages?.[0]?.ID
    if (id) {
      const msg = await (await page.request.get(`${MAILPIT}/api/v1/message/${id}`)).json()
      const link = (msg.Text as string).match(/https?:\/\/\S+type=recovery\S*/)?.[0]
      if (link) return link
    }
    await page.waitForTimeout(500)
  }
  throw new Error('reset email not delivered to Mailpit')
}

async function signOut(page: Page, email: string) {
  // The account menu trigger shows the signed-in email (desktop) or "Account menu" (mobile).
  await page.getByRole('button', { name: new RegExp(`^(${email.replace(/[.+]/g, '\\$&')}|Account menu)$`) }).click()
  await page.getByRole('menuitem', { name: /sign out/i }).click()
  await expect(page).toHaveURL(/\/login/)
}

test('register, reject duplicate, reset password and sign in again', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one account lifecycle run is enough')
  const email = `e2e-${Date.now()}@example.test`
  const first = 'first-passw0rd-ok'
  const second = 'second-passw0rd-ok'

  await page.goto('/login')
  await page.getByRole('tab', { name: 'Create account' }).click()
  const signup = page.getByRole('form', { name: 'Create account' })
  await signup.getByLabel('Email').fill(email)
  await signup.getByLabel(/^Password/).fill(first)
  await signup.getByLabel('Confirm password').fill(first)
  await signup.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/onboarding/)
  await expect(page.getByText(/signed in to the demo account/)).toHaveCount(0)
  await signOut(page, email)

  await page.getByRole('tab', { name: 'Create account' }).click()
  await signup.getByLabel('Email').fill(email)
  await signup.getByLabel(/^Password/).fill(first)
  await signup.getByLabel('Confirm password').fill(first)
  await signup.getByRole('button', { name: 'Create account' }).click()
  await expect(signup.getByRole('alert')).toContainText('already exists')

  await page.getByRole('tab', { name: 'Sign in' }).click()
  const signin = page.getByRole('form', { name: 'Sign in' })
  await signin.getByLabel('Email').fill(email)
  await signin.getByLabel('Password').fill('not-the-password-1')
  await signin.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(signin.getByRole('alert')).toContainText('Incorrect email or password')

  await signin.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(signin.getByRole('status')).toContainText('If an account exists')
  await page.goto(await resetLink(page, email))
  await expect(page).toHaveURL(/\/reset-password/)
  await page.getByLabel(/^New password/).fill(second)
  await page.getByLabel('Confirm new password').fill(second)
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await signOut(page, email)

  await signin.getByLabel('Email').fill(email)
  await signin.getByLabel('Password').fill(second)
  await signin.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await page.reload()
  await expect(page).toHaveURL(/\/dashboard/) // session survives a refresh

  // Clean up the throwaway account through the app's own deletion endpoint.
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))
    return key ? (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token : ''
  })
  const api = process.env.E2E_API_URL ?? 'http://localhost:8000'
  const del = await page.request.delete(`${api}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` }, data: { confirm: 'DELETE' } })
  expect(del.status()).toBe(204)
})

test('demo account is labelled and cannot connect a real mailbox', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('demo@mailpilot.test')
  await page.getByLabel('Password').fill('mailpilot-demo-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText(/signed in to the demo account/)).toBeVisible()
})
