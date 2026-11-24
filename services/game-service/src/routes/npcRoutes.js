import { Router } from 'express';

/**
 * NPC 설정 조회/동적 변경 전용 Express Router (SRP)
 * @param {{ getNpcStatus: () => object, updateNpcConfig: (patch: object) => object }} npcService
 */
export function createNpcRouter(npcService) {
    const router = Router();

    router.get('/config', (req, res) => {
        res.json({
            success: true,
            ...npcService.getNpcStatus()
        });
    });

    router.put('/config', (req, res) => {
        const result = npcService.updateNpcConfig(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: 'Invalid NPC configuration',
                details: result.errors
            });
        }
        return res.json(result);
    });

    return router;
}
