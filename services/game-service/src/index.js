import path from 'path';
import fs from 'fs';
import yaml from 'yaml';
import { fileURLToPath } from 'url';
import { createGameServer, getNetworkInterfaces } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 설정 파일 로드
const configPath = path.join(__dirname, 'config', 'game-config.yaml');
const configFile = fs.readFileSync(configPath, 'utf8');
const config = yaml.parse(configFile);

const { server, gameManager } = createGameServer(config);

const PORT = config.server.port || 3001;
const HOST = process.env.HOST || (config.network?.allowExternalAccess ? '0.0.0.0' : (config.server.host || '127.0.0.1'));

server.listen(PORT, HOST, () => {
    const networkInterfaces = getNetworkInterfaces();

    console.log(`🚀 Game Server running on ${HOST}:${PORT}`);
    console.log(`📊 Server Status: http://localhost:${PORT}/api/status`);
    console.log(`🤖 NPC Config API: http://localhost:${PORT}/api/npc/config`);
    console.log(`🎮 Game Client: http://localhost:${PORT}`);

    if (config.network?.allowExternalAccess && networkInterfaces.length > 0) {
        console.log('🌐 External Access Enabled:');
        networkInterfaces.forEach(iface => {
            console.log(`   📡 ${iface.name}: http://${iface.address}:${PORT}`);
        });
    }
});

function shutdown(signal) {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    gameManager.stopGameLoop();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
