# Despliegue del backend (Railway)

El backend **no puede ir en serverless**. Los workers de BullMQ y los cuatro
`@Cron` (sync de Shopify cada 6 h, órdenes cada 10 min, limpieza de tokens a las
3 AM, ciclo de vida de cuentas a las 4 AM) corren dentro del mismo proceso que la
API, así que necesita un contenedor siempre encendido.

## Reparto de dominios

| Host | Sirve | Alojado en |
| --- | --- | --- |
| `clawandsoul.com` | storefront Next.js — **canónico**, `www` redirige aquí | Vercel |
| `api.clawandsoul.com` | esta API | Railway |
| `shop.clawandsoul.com` | Shopify — **dominio principal**, aquí vive el checkout | Shopify |
| `staging.clawandsoul.com` | preview del frontend, atado a una rama | Vercel |

Todo cuelga del mismo dominio raíz a propósito: es lo que permite que la cookie
de sesión (`httpOnly`, `sameSite=lax`, `COOKIE_DOMAIN=.clawandsoul.com`) viaje
entre el frontend y la API, y que el cliente no salte a un dominio ajeno al
pagar.

Cuál de los dos hosts del storefront es el canónico **no es indiferente**:
`FRONTEND_URL` se compara contra la cabecera `Origin` por igualdad exacta, y
`clawandsoul.com` y `www.clawandsoul.com` son orígenes distintos. Si en Vercel
se marca `www` como principal (es el default que propone al añadir el dominio) y
aquí sigue el apex, el navegador acaba en `www` y **todas** las llamadas a la
API mueren con un error de CORS. El mismo desajuste rompe el login de Google,
que valida el origen de la página contra los *Authorized JavaScript origins*.
Síntoma: el apex responde `308` hacia `www`, y un `curl -H "Origin: …"` contra
la API devuelve la cabecera `access-control-allow-origin` para un host y no para
el otro.

El checkout de Shopify **no se puede alojar en dominio propio**: siempre lo
sirve Shopify en el dominio principal de la tienda. Por eso Shopify vive en el
subdominio `shop.` y no en la raíz. El código no depende de ese dominio: el
frontend usa `cart.checkoutUrl` tal cual lo devuelve `cartCreate`, y
`SHOPIFY_STORE_DOMAIN` sigue apuntando al `.myshopify.com` (el endpoint de la
Storefront API es independiente del dominio principal).

DNS en Namecheap (*Advanced DNS*; el campo Host lleva solo el subdominio, sin
`.clawandsoul.com`):

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | el IP que muestre Vercel para el proyecto |
| CNAME | `www` | el `*.vercel-dns-0XX.com` del proyecto |
| CNAME | `staging` | el mismo `*.vercel-dns-0XX.com` (opcional, ver más abajo) |
| CNAME | `shop` | `shops.myshopify.com` |
| CNAME | `api` | `xxxx.up.railway.app` |
| TXT | el que indique Railway | valor de verificación de Railway |

Los dos registros de Railway (CNAME **y** TXT) son obligatorios: sin el TXT no
verifica el dominio y `api.clawandsoul.com` devuelve 404 aunque el CNAME esté
bien. Vercel asigna valores por proyecto, así que hay que copiarlos del
dashboard en vez de usar los `76.76.21.21` / `cname.vercel-dns.com` de los
tutoriales antiguos.

Orden para migrar sin caída (la tienda arranca con la raíz apuntando a Shopify):

1. Shopify → *Settings → Domains* → conectar `shop.clawandsoul.com`.
2. Namecheap → CNAME `shop` → `shops.myshopify.com`.
3. Shopify verifica → **Set as primary**.
4. Desplegar el frontend en Vercel y apuntar `@` + `www` allí (aquí se borra el
   A de Shopify, `23.227.38.65`).
5. Shopify → *Domains* → quitar `clawandsoul.com` y `www.clawandsoul.com`.
6. Subir al Online Store un tema mínimo que redirija todo a `clawandsoul.com`
   salvo las rutas de checkout, para que los enlaces de vuelta del checkout
   ("continue shopping", el logo) no lleven a una tienda Shopify paralela.
7. Quitar la contraseña de la tienda. **No se puede lanzar con ella puesta**:
   con la tienda protegida, los enlaces de checkout de la Storefront API
   redirigen a la página de password y no se puede pagar.

Efecto secundario a asumir: Shopify tratará `shop.` como dominio principal para
todo — enlaces de los emails de confirmación de pedido, sitemap y URLs que
generen las apps.

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
FRONTEND_URL=https://clawandsoul.com     # sin barra final; admite lista con comas
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

### Entorno de staging (y por qué los previews de Vercel no valen)

`FRONTEND_URL` acepta varios orígenes separados por comas:

```bash
FRONTEND_URL=https://clawandsoul.com,https://staging.clawandsoul.com
```

Los preview deployments de Vercel **no se pueden autorizar** por mucho que se
listen: cada deploy sale en un `*.vercel.app` distinto e irrepetible, y aunque
se abriera el CORS a todos ellos la sesión seguiría sin funcionar. `vercel.app`
es otro sitio a ojos del navegador, así que la cookie `sameSite=lax` que emite
`auth.controller.ts` se descarta al recibirla y no se manda en las siguientes
peticiones. El fallo es silencioso: el catálogo y las fichas de producto cargan
(esos datos vienen de Shopify), el `POST /auth/login` devuelve 200, y el usuario
sigue sin sesión.

La salida es no depender de las URLs efímeras: en Vercel → *Settings → Domains*
se añade `staging.clawandsoul.com` atado a una rama concreta (disponible en
todos los planes). Al colgar del dominio raíz, la cookie funciona sin tocar
`sameSite` y aquí solo hay que sumar un origen fijo. Con plan Pro se puede ir más
lejos y poner un wildcard `*.preview.clawandsoul.com` como *preview suffix*, que
da un entorno por PR con las mismas garantías.

Lo que **no** hay que hacer es abrir `*.vercel.app` con `COOKIE_SAMESITE=none`:
eso manda la cookie de sesión en peticiones cross-site desde cualquier web,
tirando la protección CSRF que hoy sale gratis, sobre un dominio público donde
cualquiera despliega. Además las cookies de terceros están en retirada en los
navegadores.

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
