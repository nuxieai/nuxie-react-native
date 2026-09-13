import { rm } from 'node:fs/promises';
for (const path of ['dist', 'coverage']) await rm(new URL(`../${path}`, import.meta.url), { recursive: true, force: true });
