// ==========================================
// globe.gl / three-globe import "three/webgpu" + "three/tsl" ไว้ใช้กับ heatmap layer และโหมด WebGPU ที่ต้องเปิดเอง
// ลูกโลกของเราใช้ WebGL และไม่มี heatmap — vite.config.ts จึงชี้สองโมดูลนั้นมาที่ไฟล์นี้แทน (ลด bundle ~1.2 MB)
// ==========================================
const unavailable = () => new Error('WebGPU build of three.js is not bundled (see vite.config.ts)');

export class WebGPURenderer {
    constructor() {
        throw unavailable();
    }
}

export class StorageInstancedBufferAttribute {
    constructor() {
        throw unavailable();
    }
}
