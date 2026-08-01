import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { RATE_UNITS } from './create-rate.dto';

export class UpdateRateDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  // Restringido: una unidad con typo haría que el cálculo por megapíxeles
  // cayera silenciosamente a tarifa plana.
  @IsOptional()
  @IsIn(RATE_UNITS)
  unit?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
