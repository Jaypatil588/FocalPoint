import { MongoMemoryServer } from 'mongodb-memory-server';
const server = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
console.log(server.getUri());
process.on('SIGTERM', async () => { await server.stop(); process.exit(0); });
setInterval(() => {}, 1000);
