import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PodProvider } from './pod-provider.interface';
import { POD_PROVIDERS } from './pod-provider.tokens';

@Injectable()
export class PodProviderRegistry {
  private readonly map = new Map<string, PodProvider>();

  constructor(@Inject(POD_PROVIDERS) providers: PodProvider[]) {
    for (const p of providers) this.map.set(p.name, p);
  }

  get(name: string): PodProvider {
    const p = this.map.get(name);
    if (!p) {
      throw new ServiceUnavailableException(
        `POD provider desconocido: "${name}". Disponibles: ${this.list().join(', ')}`,
      );
    }
    return p;
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  list(): string[] {
    return [...this.map.keys()];
  }
}
