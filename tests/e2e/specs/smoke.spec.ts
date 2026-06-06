import { expect, test } from '@playwright/test';

test.describe('application smoke', () => {
  test('loads the home page @smoke', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/prodivix/i);
    await expect(
      page.getByRole('heading', { name: /Prodivix/i })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /GitHub/i })).toHaveAttribute(
      'href',
      'https://github.com/Prodivix/prodivix'
    );
  });

  test('opens the editor shell @smoke', async ({ page }) => {
    await page.goto('/editor');

    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(
      page.getByText(/Loading editor|Prodivix|项目|Project/i).first()
    ).toBeVisible();
  });
});
