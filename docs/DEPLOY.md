# Despliegue del backend (Railway)

El backend **no puede ir en serverless**. Los workers de BullMQ y los cuatro
`@Cron` (sync de Shopify cada 6 h, órdenes cada 10 min, limpieza de tokens a las
3 AM, ciclo de vida de cuentas a las 4 AM) corren dentro del mismo proceso que la
API, así que necesita un contenedor siempre encendido.

Dominios asumidos aquí: frontend en `clawandsoul.com`, API en
`api.clawandsoul.com`. Compartir dominio raíz es lo que permite que la cookie de
sesión (`httpOnly`, `sameSite=lax`) viaje entre ambos.

## 1. Servicios en Railway

Crea un proyecto y dentro tres servicios:

1. **Postgres** (plantilla oficial) → expone `DATABASE_URL`.
2. **Redis** (plantilla oficial) → expone `REDIS_URL` (`rediss://`, con TLS).
3. **Backend**: *Deploy from GitHub repo* → `davitpra/backend-claw-and-soul-`,
   rama `master`.

El servicio del backend lee `railway.json`, que ya fija:

- build: `npm run build`
- pre-deploy: `npm run migrate:deploy` (aplica migraciones antes de cambiar de
  versión; si falla, el deploy se aborta y sigue vivo el release anterior)
- start: `npm run start:prod`
- healthcheck: `GET /api/health`
- `numReplicas: 1` — **no lo subas**: con dos réplicas los crons se ejecutan
  duplicados.

Memoria: pide al menos **1 GB**. `geoip-lite` carga su base entera en RAM
(~100 MB) la primera vez que se resuelve una IP, y `sharp` suma su propio pico.

## 2. Variables de entorno

En el servicio backend, referencia las de los otros dos servicios con la sintaxis
de Railway y añade el resto:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

NODE_ENV=production
PORT=3001                      # Railway lo inyecta; déjalo si quieres fijarlo
FRONTEND_URL=https://clawandsoul.com     # sin barra final
APP_PUBLIC_URL=https://api.clawandsoul.com

COOKIE_DOMAIN=.clawandsoul.com
COOKIE_SAMESITE=lax

JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<otro distinto>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

GOOGLE_CLIENT_ID=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
FAL_KEY=...
MOCK_AI=false                  # ¡crítico! con true devuelve la foto sin generar

WEBHOOK_SECRET=<openssl rand -base64 32>
SHOPIFY_ADMIN_API_URL=https://clawandsoul.myshopify.com/admin/api/2024-01
SHOPIFY_ADMIN_API_TOKEN=shpat_...
SHOPIFY_WEBHOOK_SECRET=whsec_...

ACCOUNT_LIFECYCLE_ENABLED=true
INACTIVITY_MONTHS=24
```

`REDIS_HOST/PORT/PASSWORD` ya no hacen falta: si `REDIS_URL` está definida manda
ella, y el esquema `rediss://` activa TLS automáticamente
(`src/config/redis.config.ts`).

Swagger queda apagado en producción. Para abrirlo puntualmente:
`SWAGGER_ENABLED=true` (recuerda quitarlo — `/api/docs` no pide credenciales).

## 3. Dominio

En *Settings → Networking* del servicio backend, añade el custom domain
`api.clawandsoul.com` y crea el CNAME que te indique Railway.

## 4. Después del primer deploy

1. **Seed** (solo la primera vez), desde la CLI de Railway:
   `railway run npm run seed`
2. **Shopify**: los webhooks se registran solos al arrancar contra
   `APP_PUBLIC_URL`; comprueba en los logs que dicen *registered* y no
   *already registered* apuntando a ngrok/localhost. Si quedan sueltos de
   desarrollo, bórralos en el admin de Shopify.
3. **Google OAuth**: añade `https://clawandsoul.com` a *Authorized JavaScript
   origins* en Google Cloud Console.
4. **Frontend**: apunta su base URL de API a `https://api.clawandsoul.com`.

## 5. Comprobaciones

```bash
curl https://api.clawandsoul.com/api/health          # 200 {"status":"ok"}
curl -i https://api.clawandsoul.com/api/docs         # 404 en producción
```

Y en el navegador: login → recargar la página. Si la sesión se pierde al
recargar, el problema es la cookie: revisa `COOKIE_DOMAIN` y que el frontend
haga las peticiones con `credentials: 'include'`.

## Problemas conocidos del build

- **`npm ci` falla con ERESOLVE**: pasaba porque `@nestjs/config`, `jwt`,
  `passport` y `swagger` seguían en la línea de NestJS 10 con el core en 11. En
  local se instalaban igual por el lockfile; `npm ci` revalida los peers y aborta.
  Resuelto subiéndolos a config 4 / jwt 11 / passport 11 / swagger 11.
- **`nest: not found` o `prisma: not found` en el build**: Railway inyecta las
  variables del servicio también en el build, así que `NODE_ENV=production` hace
  que npm omita las devDependencies. El `.npmrc` del repo (`include=dev`) lo
  neutraliza; no lo borres.
- **`npm ci` falla con EUSAGE y "Missing: react … from lock file"**: el CLI de
  prisma depende de `@prisma/studio-core`, que declara `react`, `react-dom` y
  `@types/react` como peers no opcionales; npm los instala solos. Un
  `legacy-peer-deps=true` en el `~/.npmrc` de quien desarrolle los omite del
  lockfile y el deploy revienta. El `.npmrc` del repo fuerza
  `legacy-peer-deps=false` para que el lock salga siempre igual. Si vuelve a
  aparecer, regenera el lock con `npm install` y commítealo.
- **La app no arranca por `JWT_ACCESS_SECRET is required in production`**: es
  intencional. Sin la variable, los tokens se firmarían con el placeholder
  público del repo y cualquiera podría fabricar sesiones.

## Notas de mantenimiento

- **Migraciones**: se aplican en el pre-deploy. Una migración destructiva se
  ejecuta *antes* de que arranque el código nuevo, así que las migraciones que
  borran o renombran columnas deben ir en dos deploys (primero código
  compatible, después el borrado).
- **Rollback**: Railway revierte el contenedor, pero **no** las migraciones. Si
  necesitas volver atrás, escribe la migración inversa.
- **Logs de crons**: el sync de órdenes cada 10 min es el más ruidoso; sirve de
  latido para confirmar que las colas conectan con Redis.
