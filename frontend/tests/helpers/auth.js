import { expect } from '@playwright/test'

export async function loginAsStudent(page) {
  const email = process.env.E2E_STUDENT_EMAIL || 'dev@duke.edu'
  const password = process.env.E2E_STUDENT_PASSWORD || 'devpassword'

  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[autocomplete="current-password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.waitForURL('**/projects')
  await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeVisible()
}

export async function logoutFromAccountMenu(page) {
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL('**/login')
}
