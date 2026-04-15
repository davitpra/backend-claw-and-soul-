import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  openaiKey: process.env.OPENAI_API_KEY || '',
  falKey: process.env.FAL_KEY || '',
}));
