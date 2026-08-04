import { registerAs } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

// Conexión a Redis compartida por BullMQ y por el cliente ioredis suelto del
// módulo shopify-sync.
//
// Los proveedores gestionados (Railway, Upstash, Render) entregan una sola
// REDIS_URL en vez de host/puerto sueltos, y con esquema `rediss://` exigen TLS:
// sin él la conexión se cierra nada más abrirse y las colas quedan mudas. Si
// REDIS_URL está definida manda ella; si no, se cae a las variables sueltas que
// usa el entorno local.
function buildConnection(): RedisOptions {
  const url = process.env.REDIS_URL;

  if (url) {
    const parsed = new URL(url);
    const db = parsed.pathname.replace(/^\//, '');

    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      username: parsed.username
        ? decodeURIComponent(parsed.username)
        : undefined,
      password: parsed.password
        ? decodeURIComponent(parsed.password)
        : undefined,
      db: db ? parseInt(db, 10) : 0,
      // servername es necesario para que el certificado valide contra el host.
      ...(parsed.protocol === 'rediss:'
        ? { tls: { servername: parsed.hostname } }
        : {}),
    };
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  };
}

export default registerAs('redis', (): RedisOptions => buildConnection());
