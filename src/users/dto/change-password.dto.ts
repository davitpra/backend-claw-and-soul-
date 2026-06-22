import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentSecret123' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'newSecret123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  newPassword: string;
}
