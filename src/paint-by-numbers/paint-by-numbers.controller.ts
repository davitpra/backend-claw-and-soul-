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
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import { PaintByNumbersService } from './paint-by-numbers.service';
import { CreatePaintByNumbersDto } from './dto/create-paint-by-numbers.dto';
import { UpdatePaintByNumbersFlagsDto } from './dto/update-paint-by-numbers-flags.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

interface JwtUser {
  sub: string;
  email: string;
  role: string;
}

interface PbnUploadedFiles {
  source?: Express.Multer.File[];
  svg?: Express.Multer.File[];
  preview?: Express.Multer.File[];
  palette?: Express.Multer.File[];
}

@ApiTags('paint-by-numbers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('paint-by-numbers')
export class PaintByNumbersController {
  constructor(private readonly pbnService: PaintByNumbersService) {}

  @Post()
  @ApiOperation({ summary: 'Save a rendered Paint-by-Numbers' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'PBN saved successfully' })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'source', maxCount: 1 },
      { name: 'svg', maxCount: 1 },
      { name: 'preview', maxCount: 1 },
      { name: 'palette', maxCount: 1 },
    ]),
  )
  create(
    @CurrentUser() user: JwtUser,
    @UploadedFiles() files: PbnUploadedFiles,
    @Body() dto: CreatePaintByNumbersDto,
  ) {
    return this.pbnService.create(
      user.sub,
      user.role,
      {
        source: files.source?.[0],
        svg: files.svg?.[0],
        preview: files.preview?.[0],
        palette: files.palette?.[0],
      },
      dto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List the current user Paint-by-Numbers' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.pbnService.findUserPbns(user.sub, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a Paint-by-Numbers by id' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.pbnService.findOneForUser(id, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update PBN flags (is_public)' })
  updateFlags(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdatePaintByNumbersFlagsDto,
  ) {
    return this.pbnService.updateFlags(id, user.sub, dto.isPublic);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a Paint-by-Numbers' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.pbnService.delete(id, user.sub);
  }
}
