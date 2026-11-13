const { test, expect } = require('@playwright/test');

test('el usuario puede entrar a la tienda y ver productos', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Dazi Solar')).toBeVisible();
  const productos = page.locator('.product-card');
  await expect(productos.first()).toBeVisible();
});
