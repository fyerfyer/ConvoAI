import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import z from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  // TODO：看看怎么不使用 any 来写，然后给这个 pipe 写个测试
  constructor(private readonly schema: z.ZodType<any, any>) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
  }
}
