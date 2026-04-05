import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { CreateCompatRuleDto } from './create-compat-rule.dto';

export class BulkCreateCompatRulesDto {
  @ApiProperty({ type: [CreateCompatRuleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCompatRuleDto)
  rules: CreateCompatRuleDto[];
}
