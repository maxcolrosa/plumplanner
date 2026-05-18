import { test, expect } from '@playwright/test'
import { randomBytes } from 'crypto'

const testEmail = () => `test+${randomBytes(4).toString('hex')}@example.com`

test.describe('Marketing pages', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /plan your team/i })).toBeVisible()
    // Use the nav link specifically to avoid matching other "Pricing" text on the page
    await expect(page.getByRole('link', { name: 'Pricing', exact: true })).toBeVisible()
  })

  test('pricing page renders all three plans', async ({ page }) => {
    await page.goto('/pricing')
    // Use exact: true — the pricing card titles are the canonical plan name occurrences
    await expect(page.getByText('Starter', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Team', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Agency', { exact: true }).first()).toBeVisible()
  })
})

// Tests below require a live Supabase project with credentials in .env.local
// To run: set NEXT_PUBLIC_SUPABASE_URL to a real *.supabase.co project URL
test.describe('Authentication flow (requires live Supabase)', () => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('supabase.co'),
    'Skipped: no live Supabase project configured'
  )

  test('sign up → onboarding → create org → redirect to timeline', async ({ page }) => {
    const email = testEmail()

    await page.goto('/sign-up')
    await page.getByLabel('Full name').fill('Test User')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL('/onboarding', { timeout: 10000 })

    await page.getByLabel('Organisation name').fill('Test Agency')
    await page.getByRole('button', { name: /create organisation/i }).click()

    await expect(page).toHaveURL(/\/test-agency(-[a-f0-9]+)?\/timeline/, { timeout: 10000 })
  })

  test('sign in with wrong password shows error', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill('notauser@example.com')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible({ timeout: 5000 })
  })

  test('unauthenticated user redirected from org route', async ({ page }) => {
    await page.goto('/some-org/timeline')
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 5000 })
  })
})
