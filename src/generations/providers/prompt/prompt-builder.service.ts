import { Injectable } from '@nestjs/common';

@Injectable()
export class PromptBuilderService {
  build(template: string, vars: Record<string, any>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      const value = vars[key];
      return value !== undefined && value !== null ? String(value) : '';
    });
  }
}
