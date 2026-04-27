import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  falKey: process.env.FAL_KEY || '',
  openRouterDefaultModel:
    process.env.OPENROUTER_DEFAULT_MODEL || 'google/gemini-2.5-flash',
}));
