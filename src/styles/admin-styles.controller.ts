import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { StylesService } from './styles.service';
import { CreateStyleDto } from './dto/create-style.dto';
import { UpdateStyleDto } from './dto/update-style.dto';
import { UpdateStyleImageDto } from './dto/update-style-image.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

interface JwtUser {
  sub: string;
  email: string;
  role: string;
}

@ApiTags('admin-styles')
@ApiBearerAuth()
@Controller('admin/styles')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminStylesController {
  constructor(private readonly stylesService: StylesService) {}

  @Get()
  @ApiOperation({ summary: 'List all styles including inactive (admin)' })
  @ApiResponse({ status: 200, description: 'Styles retrieved' })
  findAll() {
    return this.stylesService.findAllForAdmin();
  }

  @Get(':styleId')
  @ApiOperation({
    summary: 'Get a single style with all fields and images (admin)',
  })
  @ApiResponse({ status: 200, description: 'Style retrieved' })
  @ApiResponse({ status: 404, description: 'Style not found' })
  findOne(@Param('styleId') styleId: string) {
    return this.stylesService.findOneForAdmin(styleId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new style' })
  @ApiResponse({ status: 201, description: 'Style created successfully' })
  create(@Body() dto: CreateStyleDto) {
    return this.stylesService.create(dto);
  }

  @Patch(':styleId')
  @ApiOperation({ summary: 'Update a style' })
  @ApiResponse({ status: 200, description: 'Style updated successfully' })
  @ApiResponse({ status: 404, description: 'Style not found' })
  update(@Param('styleId') styleId: string, @Body() dto: UpdateStyleDto) {
    return this.stylesService.update(styleId, dto);
  }

  @Delete(':styleId')
  @ApiOperation({ summary: 'Soft delete a style (sets isActive = false)' })
  @ApiResponse({ status: 200, description: 'Style deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Style not found' })
  softDelete(@Param('styleId') styleId: string) {
    return this.stylesService.softDelete(styleId);
  }

  @Post(':styleId/images')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        alt_image: { type: 'string' },
        order_index: { type: 'integer' },
      },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload an image to the style catalog' })
  @ApiQuery({ name: 'alt_image', required: false, type: String })
  @ApiQuery({ name: 'order_index', required: false, type: Number })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 404, description: 'Style not found' })
  addImage(
    @Param('styleId') styleId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('alt_image') altImage?: string,
    @Query('order_index', new DefaultValuePipe(0), ParseIntPipe)
    orderIndex?: number,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }

    return this.stylesService.addImage(styleId, file, altImage, orderIndex);
  }

  @Patch(':styleId/images/:imgId')
  @ApiOperation({ summary: 'Update a style image (set primary / reorder)' })
  @ApiResponse({ status: 200, description: 'Image updated successfully' })
  @ApiResponse({ status: 404, description: 'Style image not found' })
  updateImage(
    @Param('styleId') styleId: string,
    @Param('imgId') imgId: string,
    @Body() dto: UpdateStyleImageDto,
  ) {
    return this.stylesService.updateImage(styleId, imgId, dto);
  }

  @Delete(':styleId/images/:imgId')
  @ApiOperation({ summary: 'Delete an image from the style catalog' })
  @ApiResponse({ status: 200, description: 'Image deleted successfully' })
  @ApiResponse({ status: 404, description: 'Style image not found' })
  removeImage(
    @Param('styleId') styleId: string,
    @Param('imgId') imgId: string,
  ) {
    return this.stylesService.removeImage(styleId, imgId);
  }

  @Post(':styleId/test-generation')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        petName: { type: 'string' },
        petSpecies: { type: 'string' },
        petBreed: { type: 'string' },
        aspectRatio: { type: 'string', example: '1:1' },
        userSelections: { type: 'string', description: 'JSON-encoded Record<string, string|number>' },
      },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Run a test AI generation for a style (admin)' })
  @ApiResponse({ status: 201, description: 'Test generation enqueued' })
  @ApiResponse({ status: 400, description: 'Missing file or configs' })
  @ApiResponse({ status: 404, description: 'Style not found' })
  runTestGeneration(
    @Param('styleId') styleId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
    @Body('petName') petName?: string,
    @Body('petSpecies') petSpecies?: string,
    @Body('petBreed') petBreed?: string,
    @Body('aspectRatio') aspectRatio?: string,
    @Body('userSelections') userSelectionsJson?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }

    let userSelections: Record<string, string | number> | undefined;
    if (userSelectionsJson) {
      try {
        const parsed = JSON.parse(userSelectionsJson);
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
          throw new Error();
        }
        userSelections = parsed as Record<string, string | number>;
      } catch {
        throw new BadRequestException('userSelections must be a valid JSON object');
      }
    }

    return this.stylesService.runAdminTestGeneration(
      styleId,
      user.sub,
      file,
      {
        petName: petName ?? 'Test Pet',
        petSpecies: petSpecies ?? 'dog',
        petBreed: petBreed ?? '',
      },
      aspectRatio || undefined,
      userSelections,
    );
  }
}
