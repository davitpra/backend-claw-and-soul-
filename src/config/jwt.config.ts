//JWT configuration

import { registerAs } from '@nestjs/config';
import type { JwtSignOptions } from '@nestjs/jwt';

// @nestjs/jwt 11 tipa expiresIn con el formato de `ms` ('15m', '7d'), que no se
// puede comprobar en una variable de entorno. Este es el único punto donde se
// asume esa forma; si el valor no la tiene, `ms` revienta al firmar el primer
// token.
export type ExpiresIn = JwtSignOptions['expiresIn'];

// En producción no hay secreto por defecto: firmar con el placeholder público
// del repo equivaldría a no tener autenticación, y un olvido al configurar el
// entorno pasaría desapercibido hasta que alguien lo explotara.
function requireSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is required in production`);
  }
  return devFallback;
}

export default registerAs('jwt', () => ({
  accessSecret: requireSecret(
    'JWT_ACCESS_SECRET',
    'your_access_secret_key_here',
  ),
  refreshSecret: requireSecret(
    'JWT_REFRESH_SECRET',
    'your_refresh_secret_key_here',
  ),
  accessExpiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as ExpiresIn,
  refreshExpiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as ExpiresIn,
}));
