/// <reference types="vite/client" />

interface ImportMetaEnv {
    // origin ของ API ถ้าอยู่คนละ origin กับหน้าเว็บ (ว่าง = origin เดียวกัน)
    readonly VITE_API_URL?: string;
}
