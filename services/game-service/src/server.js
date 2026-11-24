import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { EventEmitter } from 'events';
import os from 'os';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

import GameManager from './services/GameManager.js';
import { createNpcRouter } from './routes/npcRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getNetworkInterfaces() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
        for (const netInterface of interfaces[name]) {
            if (netInterface.family === 'IPv4' && !netInterface.internal) {
                addresses.push({
                    name: name,
                    address: netInterface.address
                });
            }
        }
    }

    return addresses;
}

/**
 * Express + Socket.IO + GameManager 서버 인스턴스 팩토리
 * 프로덕션 기동(index.js)과 통합 테스트에서 공통으로 사용한다.
 */
export function createGameServer(config, options = {}) {
    const app = express();
    const server = createServer(app);

    const socketConfig = {
        cors: {
            origin: config.network?.cors?.enabled ? config.network.cors.origins : false,
            methods: ['GET', 'POST'],
            credentials: true
        }
    };

    const io = new SocketIOServer(server, socketConfig);

    // CORS 미들웨어 설정
    if (config.network?.cors?.enabled) {
        app.use((req, res, next) => {
            const allowedOrigins = config.network.cors.origins;
            const origin = req.headers.origin;

            if (allowedOrigins === '*' || (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin))) {
                res.header('Access-Control-Allow-Origin', allowedOrigins === '*' ? '*' : origin);
            }

            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            res.header('Access-Control-Allow-Credentials', 'true');

            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });
    }

    app.use(express.static(path.join(__dirname, '../../../client')));
    app.use(express.json());

    const gameEventEmitter = new EventEmitter();
    const gameManager = new GameManager(config, gameEventEmitter, options);

    // 게임 이벤트 브로드캐스트
    const broadcastEvents = [
        'gameStarted',
        'gameEnded',
        'bulletCreated',
        'bulletDestroyed',
        'muzzleFlash',
        'missileLaunched',
        'projectilesRemoved',
        'effectsRemoved',
        'vehicleDestroyed',
        'vehicleRespawned',
        'billboardDestroyed',
        'giftBoxDestroyed',
        'playerNotification',
        'gameStateUpdate'
    ];
    for (const eventName of broadcastEvents) {
        gameEventEmitter.on(eventName, (data) => {
            if (data === undefined) {
                io.emit(eventName);
            } else {
                io.emit(eventName, data);
            }
        });
    }

    // Socket.IO JWT 인증 미들웨어
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return next(new Error('Authentication token required'));
        }

        try {
            const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
            const possibleSecrets = [
                JWT_SECRET,
                'your-super-secret-jwt-key-change-in-production',
                'your-secret-key-change-in-production',
                'your-secret-key-change-this',
                'your-secret-key-here-change-in-production'
            ];

            let decoded = null;
            for (const secret of possibleSecrets) {
                try {
                    decoded = jwt.verify(token, secret);
                    break;
                } catch {
                    // try next fallback secret
                }
            }

            if (!decoded) {
                throw new Error('Token verification failed with all possible secrets');
            }

            socket.userId = decoded.userId;
            socket.username = decoded.username;
            next();
        } catch (error) {
            return next(new Error('Invalid authentication token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.id} (User: ${socket.username})`);

        socket.on('joinGame', (data = {}) => {
            const playerName = socket.username || `Player_${socket.id.substring(0, 6)}`;
            const vehicleType = data.vehicleType || 'fighter';
            const result = gameManager.addPlayer(socket.id, playerName, vehicleType);

            if (result.success) {
                socket.emit('joinSuccess', {
                    player: result.player,
                    vehicle: result.vehicle,
                    weapons: result.weapons,
                    gameState: gameManager.getGameState(),
                    config: {
                        world: config.world,
                        vehicles: config.vehicles,
                        weapons: config.weapons,
                        camera: config.camera,
                        client: config.client,
                        effects: config.effects,
                        physics: config.physics
                    }
                });
            } else {
                socket.emit('joinFailed', { reason: result.reason });
            }
        });

        socket.on('playerInput', (inputs) => {
            gameManager.handlePlayerInput(socket.id, inputs);
        });

        socket.on('leaveGame', () => {
            console.log(`Client left game: ${socket.id} (User: ${socket.username})`);
            const removed = gameManager.removePlayer(socket.id, {
                reason: 'leave',
                userId: socket.userId,
                username: socket.username
            });
            socket.emit('leaveSuccess', { success: true, removed });
        });

        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id} (User: ${socket.username})`);
            gameManager.removePlayer(socket.id, {
                reason: 'disconnect',
                userId: socket.userId,
                username: socket.username
            });
        });
    });

    // REST API: 서버 상태 (유저/NPC 구분 통계 포함)
    app.get('/api/status', (req, res) => {
        const gameState = gameManager.getGameState();
        const networkInterfaces = getNetworkInterfaces();
        const npcStatus = gameManager.getNpcStatus();

        res.json({
            status: 'running',
            gameState: gameState.gameState,
            players: gameState.players.length,
            humanPlayers: npcStatus.counts.human,
            npcPlayers: npcStatus.counts.npc,
            maxPlayers: config.game.maxPlayers,
            uptime: process.uptime(),
            network: {
                externalAccess: config.network?.allowExternalAccess || false,
                interfaces: networkInterfaces,
                publicUrl: config.network?.publicUrl || null
            },
            weaponSystem: gameState.effects,
            npc: npcStatus,
            config: config
        });
    });

    // REST API: NPC 설정 및 동적 변경 라우터 (SRP)
    app.use('/api/npc', createNpcRouter(gameManager));

    // REST API: 네트워크 정보
    app.get('/api/network', (req, res) => {
        const networkInterfaces = getNetworkInterfaces();
        const externalAccess = config.network?.allowExternalAccess || false;
        const port = config.server.port || 3001;
        const accessUrls = networkInterfaces.map(iface => `http://${iface.address}:${port}`);

        res.json({
            externalAccess: externalAccess,
            host: externalAccess ? '0.0.0.0' : 'localhost',
            port: port,
            interfaces: networkInterfaces,
            accessUrls: accessUrls,
            publicUrl: config.network?.publicUrl || null
        });
    });

    // REST API: 클라이언트 설정
    app.get('/api/config', (req, res) => {
        res.json({
            world: config.world,
            vehicles: config.vehicles,
            weapons: config.weapons,
            camera: config.camera,
            client: config.client,
            effects: config.effects,
            physics: config.physics
        });
    });

    return { app, server, io, gameManager, gameEventEmitter };
}
