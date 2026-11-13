const { test, expect } = require('@playwright/test');

test('la tienda carga y muestra el catálogo', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Potencia tu hogar');
  await expect(page.locator('#catalogo-productos')).toBeVisible();
});
