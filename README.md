# Mini Inventario Web – Dazi Solar

Aplicación web de inventario para la empresa Dazi Solar, desarrollada con Node.js, Express, SQLite y JavaScript vanilla.

## Descripción

Esta aplicación simula una tienda de energía solar con catálogo de productos, autenticación, gestión de inventario, compras, ventas, facturas y panel de administración. El proyecto está pensado para un entorno académico y se diseñó con enfoque de trabajo realista.

## Usuario administrador inicial

Usuario: `Admin`
Contraseña: `Admin`

Nota: este usuario es solo para desarrollo. En un entorno real debe cambiarse la contraseña y se recomienda crear un usuario distinto con permisos restringidos.

## Requisitos

- Node.js 18+
- npm

## Instalación

1. Clona o descarga el proyecto.
2. Abre la terminal en la raíz del proyecto.
3. Copia `.env.example` a `.env` y ajusta los valores si es necesario.
4. Ejecuta:

```bash
npm install
npm start
```

La aplicación quedará disponible en `http://localhost:3000`.

## Scripts disponibles

```bash
npm start
npm run dev
npm test
npm run test:unit
npm run test:integration
npm run test:smoke
```

## Variables de entorno

- `PORT`: puerto del servidor.
- `NODE_ENV`: entorno de ejecución.
- `SESSION_SECRET`: secreto de sesión.
- `DB_PATH`: ruta de la base de datos SQLite.

## Estructura principal

- `server/server.js`: punto de entrada de la aplicación.
- `server/db.js`: inicialización de la base de datos y semilla.
- `server/routes/auth.js`: autenticación, registro y gestión de usuarios.
- `server/routes/inventario.js`: productos, compras, ventas y movimientos.
- `server/routes/bd.js`: consulta SQL segura y administración de tablas.
- `src/html`: páginas HTML de la tienda y paneles.
- `src/js`: JavaScript del frontend.
- `src/css`: estilos responsivos.
- `database/`: base de datos SQLite.
- `img/`: recursos gráficos, logo e imágenes de producto.

## Funcionalidades principales

- Catálogo público con búsqueda por nombre.
- Registro e inicio de sesión con sesiones.
- Compra de productos por parte del cliente con validación de stock.
- Panel administrativo para gestionar productos, compras y ventas.
- Control de acceso por roles (`admin` y `cliente`).
- Panel de base de datos con consola SQL de solo lectura.
- Eliminación lógica de productos para preservar historial.
- Operaciones transaccionales para compra y venta.

## Decisiones de diseño relevantes

- Se usa SQLite con `sqlite3` y se envuelven las consultas en Promises para simplificar el flujo de datos.
- El panel de base de datos requiere que el usuario haya accedido al panel administrativo en la misma sesión.
- El producto se elimina de forma lógica para no romper facturas históricas.
- Las validaciones de stock se ejecutan en el servidor, y el mensaje exacto de error es `Inventario insuficiente` en caso de fallo.
- El proyecto usa páginas HTML servidas por Express y JavaScript vanilla sin frameworks.

## Pruebas

Se prepararon pruebas unitarias e integración para validar la lógica principal del sistema y la API.

## Licencia

MIT
