import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FormatsService } from './formats.service';
import { CreateFormatDto } from './dto/create-format.dto';
import { UpdateFormatDto } from './dto/update-format.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('admin-formats')
@ApiBearerAuth()
@Controller('admin/formats')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminFormatsController {
  constructor(private readonly formatsService: FormatsService) {}

  @Get()
  @ApiOperation({ summary: 'List all formats (including inactive)' })
  @ApiResponse({ status: 200, description: 'Formats retrieved successfully' })
  findAll() {
    return this.formatsService.findAll();
  }

  @Get(':formatId')
  @ApiOperation({ summary: 'Get a format by ID' })
  @ApiResponse({ status: 200, description: 'Format retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Format not found' })
  findOne(@Param('formatId') formatId: string) {
    return this.formatsService.findOne(formatId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new format' })
  @ApiResponse({ status: 201, description: 'Format created successfully' })
  create(@Body() dto: CreateFormatDto) {
    return this.formatsService.create(dto);
  }

  @Patch(':formatId')
  @ApiOperation({ summary: 'Update a format' })
  @ApiResponse({ status: 200, description: 'Format updated successfully' })
  @ApiResponse({ status: 404, description: 'Format not found' })
  update(@Param('formatId') formatId: string, @Body() dto: UpdateFormatDto) {
    return this.formatsService.update(formatId, dto);
  }

  @Delete(':formatId')
  @ApiOperation({ summary: 'Soft delete a format (sets isActive = false)' })
  @ApiResponse({ status: 200, description: 'Format deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Format not found' })
  softDelete(@Param('formatId') formatId: string) {
    return this.formatsService.softDelete(formatId);
  }
}
