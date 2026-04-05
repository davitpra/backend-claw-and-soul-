import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CompatService } from './compat.service';
import { CreateCompatRuleDto } from './dto/create-compat-rule.dto';
import { UpdateCompatRuleDto } from './dto/update-compat-rule.dto';
import { BulkCreateCompatRulesDto } from './dto/bulk-create-compat-rules.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('admin-compat')
@ApiBearerAuth()
@Controller('admin/compat')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminCompatController {
  constructor(private readonly compatService: CompatService) {}

  @Get()
  @ApiOperation({ summary: 'List all compat rules with optional filters' })
  @ApiQuery({ name: 'style_id', required: false, type: String })
  @ApiQuery({ name: 'format_id', required: false, type: String })
  @ApiQuery({ name: 'product_id', required: false, type: String })
  findAll(
    @Query('style_id') styleId?: string,
    @Query('format_id') formatId?: string,
    @Query('product_id') productId?: string,
  ) {
    return this.compatService.findAll(styleId, formatId, productId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a compat rule' })
  create(@Body() dto: CreateCompatRuleDto) {
    return this.compatService.create(dto);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Bulk create compat rules (skips duplicates)' })
  bulkCreate(@Body() dto: BulkCreateCompatRulesDto) {
    return this.compatService.bulkCreate(dto);
  }

  @Patch(':compatId')
  @ApiOperation({ summary: 'Update a compat rule' })
  update(@Param('compatId') compatId: string, @Body() dto: UpdateCompatRuleDto) {
    return this.compatService.update(compatId, dto);
  }

  @Delete(':compatId')
  @ApiOperation({ summary: 'Delete a compat rule' })
  remove(@Param('compatId') compatId: string) {
    return this.compatService.remove(compatId);
  }
}
