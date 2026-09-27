// gifenc ไม่มีไฟล์ type มาให้ — ประกาศเฉพาะส่วนที่ใช้ทำ GIF แผนที่เรดาร์
declare module 'gifenc' {
    export type Palette = number[][];

    export interface GifEncoder {
        writeFrame(index: Uint8Array, width: number, height: number, options?: { palette?: Palette; delay?: number; transparent?: boolean }): void;
        finish(): void;
        bytes(): Uint8Array;
    }

    export function GIFEncoder(): GifEncoder;
    export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): Palette;
    export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array;
}
