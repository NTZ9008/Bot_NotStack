// โหลดไฟล์ .ts ของหน้าเว็บ/shared ตรงๆ ในเทสต์ Node (transpile อย่างเดียว ไม่เช็ค type)
const fs = require('node:fs');
const ts = require('../apps/backend/node_modules/typescript');
// helper import ของ TS ประกาศที่นี่ที่เดียว (noEmitHelpers) — ถ้าแปะลงทุกไฟล์ branch ของ helper ที่เทสต์วิ่งไม่ถึงจะปนใน coverage ของไฟล์ .ts
globalThis.__importDefault = (mod) => (mod?.__esModule ? mod : { default: mod });
globalThis.__importStar = (mod) => (mod?.__esModule ? mod : { ...mod, default: mod });

require.extensions['.ts'] = (module, filename) => {
    const { outputText, sourceMapText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, noEmitHelpers: true, sourceMap: true },
        fileName: filename,
    });
    // source map ให้ coverage (lcov → SonarCloud) ชี้บรรทัดของไฟล์ .ts ไม่ใช่บรรทัดของ JS ที่ transpile แล้ว
    // บรรทัดแรกของ JS ("use strict" ฯลฯ) ไม่มี mapping → Node นับ comment/import หัวไฟล์ .ts เป็นบรรทัดที่ไม่ถูกรัน ; ผูกไว้กับบรรทัด 1 ของ .ts
    const map = JSON.parse(sourceMapText);
    map.mappings = `AAAA${map.mappings.startsWith(';') ? '' : ','}${map.mappings}`;
    const js = outputText.replace(/\/\/# sourceMappingURL=.*$/, '');
    module._compile(`${js}//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}\n`, filename);
};
