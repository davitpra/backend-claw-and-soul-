import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StyleCompatService } from './style-compat.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('styles')
@Controller('styles')
export class StyleCompatController {
  constructor(private readonly styleCompatService: StyleCompatService) {}

  @Public()
  @Get(':styleId/compat')
  @ApiOperation({ summary: 'Get compatible formats and products for a style' })
  findCompatibleOptions(@Param('styleId') styleId: string) {
    return this.styleCompatService.findCompatibleOptions(styleId);
  }
}
