import { ApiProperty } from '@nestjs/swagger';

export class SyncStatusResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() type: string;
  @ApiProperty() status: string;
  @ApiProperty() startedAt: Date;
  @ApiProperty({ required: false }) completedAt?: Date;
  @ApiProperty({ required: false }) productsChecked?: number;
  @ApiProperty({ required: false }) productsCreated?: number;
  @ApiProperty({ required: false }) productsUpdated?: number;
  @ApiProperty({ required: false }) productsDeactivated?: number;
  @ApiProperty({ required: false }) errors?: unknown;
  @ApiProperty({ required: false }) metadata?: unknown;
}

export class TriggerSyncResponseDto {
  @ApiProperty() syncId: string;
}

export class HealthStatusResponseDto {
  @ApiProperty({ enum: ['healthy', 'degraded', 'unhealthy'] }) status: string;
  @ApiProperty({ required: false }) lastSuccessfulSync: Date | null;
  @ApiProperty({ required: false }) hoursSinceLastSync: number | null;
  @ApiProperty() activeProductsDb: number;
  @ApiProperty() webhooksLast24h: number;
}
