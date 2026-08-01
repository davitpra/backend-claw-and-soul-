import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ADMIN_SETTABLE_STATUSES,
  type AdminSettableStatus,
} from '../../users/account-status.service';

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: ADMIN_SETTABLE_STATUSES,
    description:
      'Nuevo estado de la cuenta. La baja lógica va por DELETE /admin/users/:id.',
  })
  @IsIn(ADMIN_SETTABLE_STATUSES)
  status: AdminSettableStatus;

  @ApiProperty({
    required: false,
    example: 'Uso abusivo del generador',
    description: 'Obligatorio al suspender (status = banned).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
