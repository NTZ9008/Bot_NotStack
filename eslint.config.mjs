// ==========================================
// 🔍 ESLint (flat config) — ตรวจหาบั๊กที่ typecheck จับไม่ได้ ทั้ง backend / frontend / shared
//   pnpm lint
// ไม่ได้ใช้กฎเรื่องรูปแบบโค้ด (เว้นวรรค / เครื่องหมายคำพูด) — ส่วนนั้นเป็นหน้าที่ของ Prettier (.prettierrc.json)
// ==========================================
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/.turbo/**',
            '**/.wrangler/**',
            'apps/backend/src/generated/**',
            'apps/frontend/src/routeTree.gen.ts',
            // คอมโพเนนต์จาก shadcn CLI
            'apps/frontend/src/components/ui/**',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        rules: {
            // ตัวแปรที่ตั้งใจไม่ใช้ ขึ้นต้นด้วย _
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
        },
    },
    {
        files: ['apps/backend/**/*.ts', 'packages/shared/**/*.ts'],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['apps/frontend/**/*.{ts,tsx}'],
        languageOptions: { globals: globals.browser },
        plugins: { 'react-hooks': reactHooks },
        rules: reactHooks.configs.recommended.rules,
    },
    {
        files: ['**/*.{cjs,mjs}'],
        languageOptions: { globals: globals.node },
        rules: { '@typescript-eslint/no-require-imports': 'off' },
    },
);
