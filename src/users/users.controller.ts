import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from './users.service';
import { StorageService } from '../storage/storage.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.findById(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user.sub, updateUserDto);
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Change current user password' })
  @ApiResponse({ status: 200, description: 'Password updated successfully' })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(
      user.sub,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }

  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload current user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Avatar uploaded successfully' })
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }

    const current = await this.usersService.findById(user.sub);
    const key = `users/${user.sub}/avatar/${uuidv4()}`;
    const url = await this.storageService.upload(
      key,
      file.buffer,
      file.mimetype,
    );
    const updated = await this.usersService.updateAvatar(user.sub, url, key);

    if (current.avatarStorageKey) {
      await this.storageService
        .delete(current.avatarStorageKey)
        .catch(() => {});
    }

    return updated;
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Remove current user avatar' })
  @ApiResponse({ status: 200, description: 'Avatar removed successfully' })
  async removeAvatar(@CurrentUser() user: JwtPayload) {
    const current = await this.usersService.findById(user.sub);
    const updated = await this.usersService.removeAvatar(user.sub);

    if (current.avatarStorageKey) {
      await this.storageService
        .delete(current.avatarStorageKey)
        .catch(() => {});
    }

    return updated;
  }
}
