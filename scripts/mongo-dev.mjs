import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const dbPath = resolve('.runtime/mongo');
await mkdir(dbPath, { recursive: true });
const server = await MongoMemoryReplSet.create({
  binary: { version: '7.0.14' },
  instanceOpts: [{ port: 27028, dbPath }],
  replSet: { name: 'focalpoint', count: 1, storageEngine: 'wiredTiger' },
});
console.log(`MongoDB replica set ready: ${server.getUri()}`);
async function stop() { await server.stop(); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1000);
