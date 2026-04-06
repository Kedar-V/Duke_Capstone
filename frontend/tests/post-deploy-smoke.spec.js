import { test, expect } from '@playwright/test'

import { loginAsStudent, logoutFromAccountMenu } from './helpers/auth'

test.describe('Post-deploy student smoke checks', () => {
  test('route guard redirects unauthenticated users', async ({ page }) => {
    await page.goto('/rankings')
    await page.waitForURL('**/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('student login and core page navigation works', async ({ page }) => {
    await loginAsStudent(page)

    await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Partners', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rankings', exact: true })).toBeVisible()

    await page.goto('/projects')
    await expect(page.getByRole('button', { name: 'Go to selected projects' })).toBeVisible()

    await page.goto('/partners')
    await expect(page.getByRole('heading', { name: 'Partners' })).toBeVisible()

    await page.goto('/rankings')
    await expect(page.getByRole('heading', { name: 'Capstone Project Ranking' })).toBeVisible()

    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  })

  test('student can logout cleanly', async ({ page }) => {
    await loginAsStudent(page)
    await logoutFromAccountMenu(page)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })
})
