import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteUserDto {
  @ApiProperty({
    example: 'Solicitud de baja del titular',
    description:
      'Motivo de la baja. Queda en AuditLog: es la única traza de por qué se cerró la cuenta.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}
