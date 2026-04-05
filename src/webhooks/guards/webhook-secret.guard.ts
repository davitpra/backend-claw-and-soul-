import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WebhookSecretGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedSecret = request.headers['x-webhook-secret'];
    const expectedSecret = this.configService.get<string>('WEBHOOK_SECRET');

    if (!expectedSecret) {
      throw new InternalServerErrorException('Webhook secret not configured');
    }

    if (!providedSecret || providedSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    return true;
  }
}
