import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateRateDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
