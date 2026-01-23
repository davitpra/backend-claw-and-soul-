import { SetMetadata } from '@nestjs/common';

//Mark endpoints as public (no auth)
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
