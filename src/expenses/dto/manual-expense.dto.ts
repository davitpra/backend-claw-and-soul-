import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ManualExpenseDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  note?: string;
}
