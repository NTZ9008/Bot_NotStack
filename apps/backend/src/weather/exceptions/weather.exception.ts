import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../common/exceptions/api.exception';

// ==========================================
// error ของรายงานสภาพอากาศ — ข้อความภาษาไทยส่งกลับให้หน้าเว็บได้เลย
// retryable = ส่งตามเวลาไม่สำเร็จแล้วลองใหม่ได้ (API ล่ม / เน็ตหลุด / บอทยังไม่ออนไลน์)
//             false = ลองใหม่ก็ไม่หาย (ห้องผิด / ไม่มีสิทธิ์ / API key ผิด)
// ==========================================
export class WeatherException extends ApiException {
    constructor(
        message: string,
        readonly retryable: boolean,
        status: HttpStatus = HttpStatus.BAD_REQUEST,
    ) {
        super(status, message);
    }
}

// OpenWeatherMap ตอบผิดปกติ / ติดต่อไม่ได้ (502)
export const weatherApiError = (message: string, retryable = true) => new WeatherException(message, retryable, HttpStatus.BAD_GATEWAY);
