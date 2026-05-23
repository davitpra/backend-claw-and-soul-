import { PartialType } from '@nestjs/swagger';
import { CreateImageGenConfigDto } from './create-image-gen-config.dto';

export class UpdateImageGenConfigDto extends PartialType(
  CreateImageGenConfigDto,
) {}
