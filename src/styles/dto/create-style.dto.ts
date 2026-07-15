import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsIn,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class CreateStyleDto {
  @ApiProperty({ example: 'watercolor_classic' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Watercolor Classic' })
  @IsString()
  @MaxLength(150)
  displayName: string;

  @ApiProperty({ example: 'watercolor' })
  @IsString()
  @MaxLength(100)
  category: string;

  @ApiProperty({
    example: 'medium',
    enum: ['easy', 'medium', 'challenging'],
    required: false,
    description: 'Perceived painting difficulty of the style',
  })
  @IsOptional()
  @IsIn(['easy', 'medium', 'challenging'])
  difficulty?: 'easy' | 'medium' | 'challenging';

  @ApiProperty({ example: 'default', required: false })
  @IsOptional()
  @IsString()
  strategyKey?: string;

  @ApiProperty({
    description:
      'Prompt completo enviado al VLM. Placeholders: {{petName}}, {{petSpecies}}, {{petBreed}}, {{maxPets}} y cualquier key definida en templateVars.',
    required: false,
  })
  @IsOptional()
  @IsString()
  promptTemplate?: string;

  @ApiProperty({ example: { colorCount: 5 }, required: false })
  @IsOptional()
  @IsObject()
  templateVars?: Record<string, any>;

  @ApiProperty({
    example: {
      background: {
        type: 'select',
        label: 'Fondo',
        options: [{ value: 'white', label: 'Blanco' }],
        default: 'white',
        required: true,
      },
    },
    description:
      'User-selectable variables. Each key maps to a control definition (select, slider, or color).',
    required: false,
  })
  @IsOptional()
  @IsObject()
  templateVarOptions?: Record<string, any>;

  @ApiProperty({
    example: { input: { nrOfClusters: 12 }, render: { fillOpacity: 0.3 } },
    description:
      'Default PBN studio config for this style ({ input, render }). Seeds the public PBN studio when arriving from a generation of this style.',
    required: false,
  })
  @IsOptional()
  @IsObject()
  pbnConfig?: Record<string, any>;

  @ApiProperty({
    example: 'uuid-of-vision-config',
    description: 'ID of the VisionConfig to use for this style',
    required: false,
  })
  @IsOptional()
  @IsString()
  visionConfigId?: string;

  @ApiProperty({
    example: 'uuid-of-image-gen-config',
    description: 'ID of the ImageGenConfig to use for this style',
    required: false,
  })
  @IsOptional()
  @IsString()
  imageGenConfigId?: string;

  @ApiProperty({
    required: false,
    description: 'Reference image URL for style-transfer strategies',
  })
  @IsOptional()
  @IsString()
  styleReferenceUrl?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
