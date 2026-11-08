// Deletes the local development database and uploaded files; demo data is re-seeded on next start.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
fs.rmSync(path.join(root, 'data'), { recursive: true, force: true });
console.log('Local database and uploads removed. Start the server to re-seed demo data.');
