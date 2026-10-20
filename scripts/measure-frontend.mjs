// Run after a production frontend build. Counts only HTML-referenced JS/CSS, not route chunks/fonts/images.
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
const root = path.resolve(process.argv[2] ?? 'apps/frontend/dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const paths = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g)].map((match) => match[1]))];
const resources = paths.map((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { file, bytes: bytes.length, gzip: gzipSync(bytes).length };
});
console.log(
    JSON.stringify(
        { resources, count: resources.length, bytes: resources.reduce((n, r) => n + r.bytes, 0), gzip: resources.reduce((n, r) => n + r.gzip, 0) },
        null,
        2,
    ),
);
