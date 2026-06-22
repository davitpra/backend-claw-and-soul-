import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token (JWT) obtained from Google Identity Services',
  })
  @IsString()
  idToken: string;
}
