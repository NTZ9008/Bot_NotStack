import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { isZodDto } from '../dto/create-zod-dto';
import { badRequest } from '../exceptions/api.exception';

// ตรวจ @Body() / @Query() ที่มีชนิดเป็น DTO จาก createZodDto — ตอบ 400 พร้อมข้อความของปัญหาแรกที่เจอ
// ค่าอื่น (เช่น @Param('id') string) ผ่านไปตามเดิม
@Injectable()
export class ZodValidationPipe implements PipeTransform {
    transform(value: unknown, metadata: ArgumentMetadata): unknown {
        if (metadata.type === 'custom' || !isZodDto(metadata.metatype)) return value;
        const result = metadata.metatype.schema.safeParse(value ?? {});
        if (!result.success) throw badRequest(result.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
        return result.data;
    }
}
