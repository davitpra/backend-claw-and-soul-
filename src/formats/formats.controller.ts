import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FormatsService } from './formats.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('formats')
@Controller('formats')
export class FormatsController {
  constructor(private readonly formatsService: FormatsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all active formats' })
  findAll() {
    return this.formatsService.findActive();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get format by ID' })
  findOne(@Param('id') id: string) {
    return this.formatsService.findOne(id);
  }
}
