import { SetMetadata } from '@nestjs/common';

//Require specific user roles
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
