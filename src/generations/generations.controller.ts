import {
  Controller,
  Get,
  Post,
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
import { CreateVideoGenerationDto } from './dto/create-video-generation.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('generations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('generations')
export class GenerationsController {
  constructor(private readonly generationsService: GenerationsService) {}

  @Post('image')
  @ApiOperation({ summary: 'Create image generation' })
  @ApiResponse({ status: 201, description: 'Generation created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Insufficient credits or invalid data',
  })
  createImage(
    @CurrentUser() user: any,
    @Body() createDto: CreateImageGenerationDto,
  ) {
    return this.generationsService.createImageGeneration(user.sub, createDto);
  }

  @Post('video')
  @ApiOperation({ summary: 'Create video generation' })
  @ApiResponse({ status: 201, description: 'Generation created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Insufficient credits or invalid data',
  })
  createVideo(
    @CurrentUser() user: any,
    @Body() createDto: CreateVideoGenerationDto,
  ) {
    return this.generationsService.createVideoGeneration(user.sub, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get user generations' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: ['image', 'video'] })
  @ApiResponse({
    status: 200,
    description: 'Generations retrieved successfully',
  })
  findAll(
    @CurrentUser() user: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
  ) {
    return this.generationsService.findUserGenerations(
      user.sub,
      page,
      limit,
      type,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get generation by ID' })
  @ApiResponse({
    status: 200,
    description: 'Generation retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Generation not found' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.generationsService.findOne(id, user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete generation' })
  @ApiResponse({ status: 200, description: 'Generation deleted successfully' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.generationsService.deleteGeneration(id, user.sub);
  }
}
