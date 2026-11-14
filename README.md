# Level Three Barbería · Plataforma de reservas

Web de clientes + panel de administrador + servidor + base de datos, todo en un solo proyecto.
**No necesita instalar paquetes** (cero dependencias): solo Node.js 22.13 o superior.

## Qué incluye

| Parte | Dónde | Qué hace |
|---|---|---|
| Web de clientes | `/` | Reservar (servicio, extras, barbero, día y hora), precios, cortes, promos, local, reseñas, mis citas |
| Panel admin | `/admin` | Dashboard, reservas, servicios y precios, horarios, fotos de cortes, contenido de portada, video principal, galería del ambiente, reseñas y exportar CSV |
| Servidor / API | `server.js` | Reglas de reservas, login del admin, subida de fotos |
| Base de datos | `data/barberia.db` | SQLite, se crea sola la primera vez |

## Iniciar (3 pasos)

1. Instala Node.js 22.13+ desde https://nodejs.org (versión LTS o superior). Comprueba con `node -v`.
2. Copia `.env.example` como `.env` y configura las variables de entorno necesarias. El panel está configurado sin contraseña.
3. En la carpeta del proyecto ejecuta:

```bash
npm start
```

Abre http://localhost:3000 (clientes) y http://localhost:3000/admin (administrador).
Para probar que todo funciona: `npm test` (crea una base temporal y revisa 23 casos).

## Primeros pasos en el panel (`/admin`)

1. **Horarios:** hora de apertura/cierre, minutos por cita, días cerrados, tu WhatsApp (con 57), dirección e Instagram.
2. **Servicios:** pon los nombres reales de tus barberos y ajusta precios y extras.
3. **Cortes:** sube fotos desde cámara o galería, cambia sus títulos y elimina las que ya no quieras mostrar.
4. **Contenido:** edita los textos de portada, publica un video MP4/WEBM y agrega fotos o videos del ambiente. Los cambios guardados se reflejan en la página pública al recargar.

El WhatsApp del negocio hace aparecer el botón "Avisar por WhatsApp" al confirmar la reserva del cliente. El cliente debe registrarse o iniciar sesión antes de reservar; cada cita se guarda en su cuenta.

## Base de datos

SQLite en `data/barberia.db`. Tablas: `services`, `extras`, `barbers`, `bookings`, `blocks`, `reviews`, `gallery`, `settings`.
Un índice único impide que dos clientes tomen la misma hora con el mismo barbero, aunque reserven al mismo tiempo.
Las fotos y videos se guardan en `data/uploads/`. Las cargas de video admiten MP4/WEBM de hasta 15 MB; las imágenes hasta 4 MB. Los videos servidos desde `/uploads/` admiten solicitudes HTTP Range para permitir reproducción progresiva y búsqueda dentro del video.

**Copia de seguridad:** copia la carpeta `data/` completa (con el servidor apagado, o usando `sqlite3 data/barberia.db ".backup copia.db"`). Desde el panel puedes exportar las reservas en CSV. La pestaña Contenido permite previsualizar los textos principales antes de guardarlos.

## API (por si quieres conectar otra app)

Públicas: `GET /api/config` · `GET /api/availability?date=AAAA-MM-DD` · `POST /api/bookings` · `POST /api/bookings/cancel` · `GET|POST /api/reviews` · `GET /api/gallery`
Admin (modo sin contraseña: las rutas administrativas son públicas): `summary`, `bookings` (GET/PATCH), `export`, `catalog`, `settings`, `blocks`, `gallery`, `reviews`.

## Publicar en internet

El servidor necesita **disco persistente** para `data/` (si no, pierdes reservas al reiniciar).

- **VPS (recomendado, ej. DigitalOcean/Hetzner):** instala Node 22, copia el proyecto, `npm start` con `pm2` o `systemd`, y pon Nginx/Caddy con HTTPS delante. Usa `COOKIE_SECURE=1` y `TRUST_PROXY=1`.
- **Render:** servicio *Web Service* de pago (los gratuitos no admiten disco), Build Command `npm install` (o vacío), Start Command `npm start`, un **Disk** montado en `/var/data` y estas variables:
  `TZ=America/Bogota`, `TRUST_PROXY=1`, `COOKIE_SECURE=1`, `DB_PATH=/var/data/barberia.db`, `UPLOADS_DIR=/var/data/uploads`.
- **Railway / Fly.io:** igual, con un volumen persistente y las mismas variables apuntando a ese volumen.
- **Docker:** `docker build -t level-three .` y `docker run -p 3000:3000 -v $(pwd)/data:/app/data --env-file .env level-three`.

GitHub Pages **no sirve** para esto (solo aloja páginas estáticas, no ejecuta el servidor).

## Seguridad (ya incluida)

Clave de admin por variable de entorno, cookie `HttpOnly` firmada que vence a las 12 h, límite de intentos de login, límite de reservas/reseñas por IP, precios calculados siempre en el servidor, validación de imágenes, protección contra rutas maliciosas y cabeceras de seguridad. Publica siempre con **HTTPS**.

## Estructura

```
server.js        API, login, archivos estáticos
db.js            tablas y datos iniciales
test.js          pruebas automáticas (npm test)
public/index.html + js/app.js     web de clientes
public/admin.html + js/admin.js   panel de administrador
public/css/styles.css             diseño (colores en :root)
```


## Edición visual premium (noviembre 2026)

Se añadió `public/css/premium.css` como capa visual adicional. Mantiene los estilos y la lógica de reservas existentes, ampliando el diseño para escritorio y móvil, con portada cinematográfica, tipografía moderna, detalles dorados, tarjetas con profundidad y animaciones respetando `prefers-reduced-motion`.

Para mostrar el video de portada, coloca un archivo MP4 propio en `public/media/portada-barberia.mp4`. La página utiliza ese archivo como fondo de video si está disponible.


⚠️ **Seguridad:** el panel `/admin` y todas sus funciones quedan sin contraseña. Cualquier persona que conozca la dirección puede modificar servicios, contenido, horarios y reservas. Úsalo solo en un entorno privado o de pruebas; no lo publiques así en Internet.


## Cuenta del cliente (actualización)

- En la sección **Mis citas**, el cliente puede crear una cuenta con nombre, celular y contraseña (mínimo 8 caracteres), o iniciar sesión.
- Las contraseñas se almacenan con `scrypt`; la sesión del cliente usa una cookie `HttpOnly` firmada y dura 30 días.
- El registro o inicio de sesión es obligatorio antes de reservar. Las reservas se asocian siempre al perfil autenticado; al crear una cuenta, las reservas anteriores con el mismo número se asocian al perfil.
- Los barberos iniciales son Kevin, Marlon y Andrés.
- El historial muestra los estados de reserva; cuando el barbero marca **Hecha** desde el administrador, el cliente verá **Corte realizado** en su historial y contará para el programa de fidelidad.
- El cliente puede consultar las promociones vigentes publicadas en la configuración de la barbería.
- El botón de WhatsApp abre un mensaje de comprobante ya preparado para que el usuario lo envíe. Desde el administrador también se puede abrir un mensaje para avisar que el corte fue realizado.

**Aviso de mensajería:** WhatsApp y SMS no se envían automáticamente con esta versión. El navegador abre WhatsApp con el texto preparado; el usuario debe tocar Enviar. Para envíos automáticos de empresa a cliente se debe configurar WhatsApp Business Cloud API (Meta) o un proveedor SMS, con sus credenciales y plantillas aprobadas. El registro por celular todavía no verifica la titularidad del número mediante código OTP; antes de usarlo en producción conviene añadir esa verificación para proteger el acceso al historial.
