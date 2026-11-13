const { test, expect } = require('@playwright/test');

test('la tienda carga y muestra el catálogo', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Potencia tu hogar');
  await expect(page.locator('#catalogo-productos')).toBeVisible();
});

test('el botón de panel administrativo abre el panel para administradores', async ({ page }) => {
  await page.goto('/');
  await page.locator('#boton-login').click();
  await page.locator('#form-login [name="usuario"]').fill('Admin');
  await page.locator('#form-login [name="contrasena"]').fill('Admin');
  await page.locator('#form-login [type="submit"]').click();

  const botonPanel = page.locator('#boton-panel-admin');
  await expect(botonPanel).toBeVisible();
  await Promise.all([
    page.waitForURL('**/panel-administrativo'),
    botonPanel.click()
  ]);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('el panel administrativo muestra e imprime facturas de compra', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      window.__printSolicitado = true;
    };
  });
  await page.goto('/');
  await page.locator('#boton-login').click();
  await page.locator('#form-login [name="usuario"]').fill('Admin');
  await page.locator('#form-login [name="contrasena"]').fill('Admin');
  await page.locator('#form-login [type="submit"]').click();
  await page.locator('#boton-panel-admin').click();
  await page.waitForURL('**/panel-administrativo');

  const proveedor = `Proveedor de prueba ${Date.now()}`;
  await page.locator('#form-compra [name="proveedor"]').fill(proveedor);
  await page.locator('#form-compra [name="cantidad_comprada"]').fill('1');
  await page.locator('#form-compra [name="precio_unitario"]').fill('1');
  await page.locator('#form-compra [type="submit"]').click();

  const botonImprimir = page.locator('#listado-compras [data-imprimir-compra]').first();
  await botonImprimir.waitFor();
  await botonImprimir.click();
  await expect(page.locator('#factura-titulo')).toContainText('Factura #');
  await expect(page.locator('.invoice-parties')).toContainText(proveedor);
  await page.getByRole('button', { name: 'Imprimir factura' }).click();
  expect(await page.evaluate(() => window.__printSolicitado)).toBe(true);
});

test('el usuario completa el checkout con método de pago y datos de entrega', async ({ page }) => {
  const usuario = `cliente${Date.now()}`;
  await page.addInitScript(() => {
    window.print = () => {
      window.__printSolicitado = true;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.locator('#form-registro [name="usuario"]').fill(usuario);
  await page.locator('#form-registro [name="contrasena"]').fill('Compra123');
  await page.locator('#form-registro [type="submit"]').click();

  await expect(page.locator('#usuario-texto')).toHaveText(usuario);
  await page.locator('.product-card').first().getByRole('button', { name: 'Comprar' }).click();
  await expect(page.locator('#modal-checkout')).toBeVisible();

  await page.locator('#form-checkout [name="nombre_cliente"]').fill('Cliente de Prueba');
  await page.locator('#form-checkout [name="email_cliente"]').fill(`${usuario}@example.com`);
  await page.locator('#form-checkout [name="telefono_cliente"]').fill('8095550101');
  await page.locator('#form-checkout [name="direccion_cliente"]').fill('Santo Domingo, República Dominicana');
  await page.locator('#form-checkout [name="metodo_pago"]').selectOption('tarjeta');
  await page.locator('#form-checkout [type="submit"]').click();

  await expect(page.locator('#modal-checkout')).toBeHidden();
  await expect(page.locator('#modal-factura')).toBeVisible();
  await expect(page.locator('#factura-titulo')).toContainText('Factura #');
  await page.getByRole('button', { name: 'Imprimir factura' }).click();
  expect(await page.evaluate(() => window.__printSolicitado)).toBe(true);
  await expect(page.locator('.app-toast').last()).toContainText('Compra confirmada');
});
