//JWT configuration

import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET || 'your_access_secret_key_here',
  refreshSecret:
    process.env.JWT_REFRESH_SECRET || 'your_refresh_secret_key_here',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
}));
