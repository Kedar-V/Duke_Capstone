import { test, expect } from '@playwright/test'

import { loginAsStudent, logoutFromAccountMenu } from './helpers/auth'

test.describe('Student Workflows', () => {
  test('redirects unauthenticated user from /rankings to /login', async ({ page }) => {
    await page.goto('/rankings')
    await page.waitForURL('**/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('student can log in and sees student navigation', async ({ page }) => {
    await loginAsStudent(page)

    await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Partners', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rankings', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go to selected projects' })).toBeVisible()
  })

  test('catalog supports project navigation and pagination controls', async ({ page }) => {
    await loginAsStudent(page)

    await expect(page.getByRole('button', { name: 'Previous' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()

    const detailsButton = page.getByRole('button', { name: 'Details' }).first()
    const hasDetails = await detailsButton.count()
    test.skip(!hasDetails, 'No projects returned for this student/cohort in current environment.')

    await detailsButton.click()
    await page.waitForURL('**/projects/**')
    await expect(page.getByRole('button', { name: 'Projects' })).toBeVisible()
  })

  test('partners page loads and allows searching classmates', async ({ page }) => {
    await loginAsStudent(page)

    await page.goto('/partners')
    await expect(page.getByRole('heading', { name: 'Partners' })).toBeVisible()

    const searchBox = page.getByPlaceholder('Search by name or email')
    await searchBox.fill('zzz-no-match')
    await expect(searchBox).toHaveValue('zzz-no-match')
    await searchBox.fill('')

    await expect(page.getByRole('button', { name: 'Save choices' })).toBeVisible()
  })

  test('rankings page loads submission controls', async ({ page }) => {
    await loginAsStudent(page)

    await page.goto('/rankings')
    await expect(page.getByRole('heading', { name: 'Capstone Project Ranking' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Submit rankings|Submitted \(Locked\)/ })).toBeVisible()

    const topHeader = page.getByText('Top 10 Ranked')
    const unrankedHeader = page.getByText('Unranked', { exact: true })
    await expect(topHeader).toBeVisible()
    await expect(unrankedHeader).toBeVisible()
  })

  test('profile validates password mismatch and supports logout', async ({ page }) => {
    await loginAsStudent(page)

    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()

    await page.getByPlaceholder('Leave blank to keep current').fill('newpassword1')
    await page.getByPlaceholder('Re-enter new password').fill('differentpassword')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('Password confirmation does not match.')).toBeVisible()

    await logoutFromAccountMenu(page)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })
})
