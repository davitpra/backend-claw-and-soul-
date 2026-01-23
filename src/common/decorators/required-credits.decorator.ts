import { SetMetadata } from '@nestjs/common';

//Specify credit requirements

export const REQUIRED_CREDITS_KEY = 'requiredCredits';
export const RequiredCredits = (credits: number) =>
  SetMetadata(REQUIRED_CREDITS_KEY, credits);
