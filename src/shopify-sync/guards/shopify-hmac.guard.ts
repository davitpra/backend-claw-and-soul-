import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class ShopifyHmacGuard implements CanActivate {
  private readonly logger = new Logger(ShopifyHmacGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const hmacHeader: string = request.headers['x-shopify-hmac-sha256'];
    const rawBody: Buffer = request.body;

    if (!hmacHeader || !Buffer.isBuffer(rawBody)) {
      this.logger.warn('Shopify webhook rejected: missing HMAC header or raw body');
      throw new UnauthorizedException('Missing HMAC header or raw body');
    }

    const secret = this.configService.get<string>('SHOPIFY_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('SHOPIFY_WEBHOOK_SECRET is not configured');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    const provided = Buffer.from(hmacHeader, 'base64');
    const expected = Buffer.from(computed, 'base64');

    if (
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(provided, expected)
    ) {
      this.logger.warn('Shopify webhook rejected: HMAC mismatch');
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    return true;
  }
}
