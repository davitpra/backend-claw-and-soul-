import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    description:
      'The account email, typed by the user. Guards against deleting an account by mistake.',
  })
  @IsEmail()
  confirmEmail: string;

  @ApiProperty({
    required: false,
    description:
      'Current password. Required unless the account signs in with Google (no password set).',
  })
  @IsOptional()
  @IsString()
  password?: string;
}
