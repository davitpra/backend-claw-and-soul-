import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { GenerationsService } from './generations.service';
import { CreateImageGenerationDto } from './dto/create-image-generation.dto';
import { UpdateGenerationFlagsDto } from './dto/update-generation-flags.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('generations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('generations')
export class GenerationsController {
  constructor(private readonly generationsService: GenerationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create image generation' })
  @ApiResponse({ status: 201, description: 'Generation created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  create(
    @CurrentUser() user: any,
    @Body() createDto: CreateImageGenerationDto,
  ) {
    return this.generationsService.createImageGeneration(user.sub, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get user generations' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'processing', 'completed', 'failed'] })
  @ApiQuery({ name: 'pet_id', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Generations retrieved successfully' })
  findAll(
    @CurrentUser() user: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('pet_id') petId?: string,
  ) {
    return this.generationsService.findUserGenerations(user.sub, page, limit, status, petId);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get generation status (lightweight polling)' })
  @ApiResponse({ status: 200, description: 'Returns { status, progress? }' })
  @ApiResponse({ status: 404, description: 'Generation not found' })
  getStatus(@Param('id') id: string, @CurrentUser() user: any) {
    return this.generationsService.getGenerationStatus(id, user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get generation by ID' })
  @ApiResponse({ status: 200, description: 'Generation retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Generation not found' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.generationsService.findOne(id, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update generation flags (is_public, is_favorite)' })
  @ApiResponse({ status: 200, description: 'Generation updated successfully' })
  @ApiResponse({ status: 404, description: 'Generation not found' })
  updateFlags(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateDto: UpdateGenerationFlagsDto,
  ) {
    return this.generationsService.updateGenerationFlags(id, user.sub, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete generation' })
  @ApiResponse({ status: 200, description: 'Generation deleted successfully' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.generationsService.deleteGeneration(id, user.sub);
  }
}
