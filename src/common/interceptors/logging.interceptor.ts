import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

//Request/response logging interceptor
// crea un registro de cada solicitud entrante y su respuesta correspondiente,
// incluyendo el método HTTP, la URL, el código de estado de la respuesta y el tiempo que tomó procesar la solicitud.

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request: Request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const now = Date.now();

    this.logger.log(`→ ${method} ${url}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const response: Response = context.switchToHttp().getResponse();
          const delay = Date.now() - now;
          this.logger.log(
            `← ${method} ${url} ${response.statusCode} - ${delay}ms`,
          );
        },
        error: (error: { status?: number }) => {
          const delay = Date.now() - now;
          this.logger.error(
            `← ${method} ${url} ${error.status || 500} - ${delay}ms`,
          );
        },
      }),
    );
  }
}
