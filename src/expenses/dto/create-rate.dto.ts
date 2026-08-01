import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/** Unidades que entiende `ExpensesService` al calcular el importe de un gasto. */
export const RATE_UNITS = ['per_image', 'per_megapixel', 'per_call'] as const;

export class CreateRateDto {
  @IsString()
  @IsNotEmpty()
  provider!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsIn(RATE_UNITS)
  unit!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
