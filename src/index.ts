import { env } from './config/env.js';
import { createApp } from './app.js';
import { db } from '../prisma/db.js';

const server = createApp().listen(env.PORT, () => {
    console.log(`Server is running at http://localhost:${env.PORT}`);
});

const shutdown = () => {
    server.close(async () => {
        await db.close();
        process.exit(0);
    });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
