import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PaintByNumbersService } from './paint-by-numbers.service';

@ApiTags('admin-paint-by-numbers')
@ApiBearerAuth()
@Controller('admin/paint-by-numbers')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminPaintByNumbersController {
  constructor(private readonly pbnService: PaintByNumbersService) {}

  @Get()
  @ApiOperation({ summary: 'List all Paint-by-Numbers (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'origin', required: false, enum: ['customer', 'admin'] })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('origin') origin?: string,
  ) {
    return this.pbnService.findAll(page, limit, origin);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get any Paint-by-Numbers by id (admin)' })
  findOne(@Param('id') id: string) {
    return this.pbnService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete any Paint-by-Numbers (admin)' })
  remove(@Param('id') id: string) {
    return this.pbnService.delete(id);
  }
}
