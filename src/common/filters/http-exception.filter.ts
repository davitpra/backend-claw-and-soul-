import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

//Standardized HTTP error responses
//Captura y formatea errores consistentemente

@Catch(HttpException) // Catch all HttpExceptions
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp(); // Convierte el argumento host generico a un contexto HTTP especifico
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const error =
      typeof exceptionResponse === 'string'
        ? { message: exceptionResponse }
        : exceptionResponse;

    // Solo los 5xx son errores del servidor. Los 4xx (token vencido, ruta
    // inexistente, favicon, validación) son rutinarios: los logueamos como
    // warn sin stack trace para no ensuciar los logs.
    if (status >= 500) {
      this.logger.error(
        `HTTP ${status} Error: ${request.method} ${request.url}`,
        exception.stack,
      );
    } else {
      this.logger.warn(`HTTP ${status}: ${request.method} ${request.url}`);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      ...error,
    });
  }
}
