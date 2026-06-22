import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { DeviceInfo } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private extractDeviceInfo(req: Request): DeviceInfo {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    // httpOnly cookies prevent XSS attacks
    // secure: true requires HTTPS (enable in production)
    // sameSite: 'strict' prevents CSRF attacks

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction, // Only send over HTTPS in production
      sameSite: 'lax', // 'strict' would block OAuth flows
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(
    @Body() registerDto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(
      registerDto,
      this.extractDeviceInfo(req),
    );

    // Set tokens in httpOnly cookies
    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    // Return user data only (no tokens in response body)
    return { user: result.user };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user' })
  @ApiResponse({ status: 200, description: 'Current user retrieved' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  getCurrentUser(@CurrentUser() user: JwtPayload) {
    // JWT strategy already validates the token from httpOnly cookie
    // The user object comes from the JWT payload
    return { user };
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get active sessions for current user' })
  @ApiResponse({ status: 200, description: 'Active sessions retrieved' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async getActiveSessions(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const currentToken = req.cookies?.refreshToken as string | undefined;
    return this.authService.getActiveSessions(user.sub, currentToken);
  }

  @Post('sessions/revoke/:tokenId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async revokeSession(
    @CurrentUser() user: JwtPayload,
    @Param('tokenId') tokenId: string,
  ) {
    return this.authService.revokeSession(user.sub, tokenId);
  }

  @Post('sessions/revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all sessions except current' })
  @ApiResponse({ status: 200, description: 'All other sessions revoked' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async revokeAllOtherSessions(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const currentToken = req.cookies?.refreshToken as string | undefined;
    return this.authService.revokeAllOtherSessions(user.sub, currentToken);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'User successfully logged in' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(
      loginDto,
      this.extractDeviceInfo(req),
    );

    // Set tokens in httpOnly cookies
    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    // Return user data only (no tokens in response body)
    return { user: result.user };
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login or register with a Google ID token' })
  @ApiResponse({ status: 200, description: 'User successfully logged in' })
  @ApiResponse({ status: 401, description: 'Invalid Google token' })
  async googleLogin(
    @Body() googleLoginDto: GoogleLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithGoogle(
      googleLoginDto.idToken,
      this.extractDeviceInfo(req),
    );

    // Set tokens in httpOnly cookies
    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    // Return user data only (no tokens in response body)
    return { user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token successfully refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Read refresh token from httpOnly cookie
    const refreshToken = req.cookies?.refreshToken as string | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const result = await this.authService.refreshToken(refreshToken);

    // Set new tokens in httpOnly cookies
    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    return { message: 'Token refreshed successfully' };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'User successfully logged out' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Read refresh token from httpOnly cookie
    const refreshToken = req.cookies?.refreshToken as string | undefined;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // Clear auth cookies
    this.clearAuthCookies(res);

    return { message: 'Logged out successfully' };
  }
}
