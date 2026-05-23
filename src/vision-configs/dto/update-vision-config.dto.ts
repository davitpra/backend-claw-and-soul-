import { PartialType } from '@nestjs/swagger';
import { CreateVisionConfigDto } from './create-vision-config.dto';

export class UpdateVisionConfigDto extends PartialType(CreateVisionConfigDto) {}
