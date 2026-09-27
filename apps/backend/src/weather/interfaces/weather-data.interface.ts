// ข้อมูลอากาศของพิกัดเดียว (อากาศตอนนี้ + พยากรณ์ 48 ชม. + ฝุ่น) — แปลงจาก OpenWeatherMap แล้ว
export interface WeatherCurrent {
    dt: number;
    temp: number;
    feelsLike: number;
    humidity: number;
    pressure: number;
    windSpeed: number;
    windDeg: number | null;
    clouds: number | null;
    visibility: number | null;
    condition: string;
    icon: string;
    sunrise: number | null;
    sunset: number | null;
}

export interface WeatherForecastSlot {
    dt: number;
    temp: number;
    // โอกาสฝนตก 0-1
    pop: number;
    // ปริมาณฝนใน 3 ชม. (มม.)
    rain: number;
    icon: string;
    condition: string;
}

export interface WeatherData {
    fetchedAt: number;
    // วินาทีที่ต่างจาก UTC ของสถานที่นั้น (ไทย = 25200) — ใช้แสดงเวลาท้องถิ่นของสถานที่
    timezone: number;
    cityId: number | null;
    cityName: string;
    current: WeatherCurrent;
    forecast: WeatherForecastSlot[];
    air: { pm25: number | null; pm10: number | null } | null;
}

// รูปที่แนบไปกับรายงาน — key = รหัสของภาพเรดาร์ใน cache (หน้าเว็บโหลดผ่าน URL แยก)
export interface ReportFile {
    name: string;
    contentType: string;
    buffer: Buffer;
    key?: string;
}
