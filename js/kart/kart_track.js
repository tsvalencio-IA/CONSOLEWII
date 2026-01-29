import { CONSTANTS, COLORS } from './kart_assets.js';

/**
 * SISTEMA DE PISTA
 * Gera a geometria da pista e gerencia segmentos.
 */
export class TrackSystem {
    constructor() {
        this.segments = [];
        this.trackLength = 0;
    }

    build(trackId) {
        this.segments = [];
        const length = 2000; // Número de segmentos
        
        for (let i = 0; i < length; i++) {
            const p1 = { world: { z: i * CONSTANTS.SEGMENT_LENGTH }, camera: {}, screen: {} };
            const p2 = { world: { z: (i + 1) * CONSTANTS.SEGMENT_LENGTH }, camera: {}, screen: {} };
            
            // Curvas Procedurais (Exemplo Simples)
            let curve = 0;
            let y = 0;

            if (i > 200 && i < 400) curve = 2; // Curva Direita
            if (i > 600 && i < 900) curve = -3; // Curva Esquerda Forte
            if (i > 1000 && i < 1200) y = Math.sin(i * 0.1) * 1000; // Colina

            this.segments.push({
                index: i,
                p1: p1,
                p2: p2,
                curve: curve,
                y: y,
                color: Math.floor(i / 3) % 2 ? 'dark' : 'light',
                sprites: [] // Objetos na pista
            });
        }

        this.trackLength = this.segments.length * CONSTANTS.SEGMENT_LENGTH;
        
        // Adiciona Linha de Chegada
        this.segments[10].sprites.push({ type: 'CHECKPOINT' });
    }

    findSegment(z) {
        return this.segments[Math.floor(z / CONSTANTS.SEGMENT_LENGTH) % this.segments.length];
    }

    // Projeção 3D para 2D
    project(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
        p.camera.x = (p.world.x || 0) - cameraX;
        p.camera.y = (p.world.y || 0) - cameraY;
        p.camera.z = (p.world.z || 0) - cameraZ;
        
        // Loop da pista
        if (p.camera.z < 0) p.camera.z += this.trackLength;

        p.screen.scale = cameraDepth / p.camera.z;
        p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width / 2));
        p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
        p.screen.w = Math.round((p.screen.scale * roadWidth * width / 2));
    }

    render(ctx, width, height, playerZ, playerX, cameraY) {
        const baseSegment = this.findSegment(playerZ);
        const basePercent = (playerZ % CONSTANTS.SEGMENT_LENGTH) / CONSTANTS.SEGMENT_LENGTH;
        const cameraDepth = 1 / Math.tan((CONSTANTS.FOV / 2) * Math.PI / 180);
        
        let dx = -(baseSegment.curve * basePercent);
        let x = 0;
        let maxY = height;

        // Renderiza segmentos de trás para frente (Painter's Algorithm invertido para otimização, mas aqui é frente->trás com clip)
        for (let n = 0; n < CONSTANTS.DRAW_DISTANCE; n++) {
            const segment = this.segments[(baseSegment.index + n) % this.segments.length];
            const looped = segment.index < baseSegment.index;
            const camZ = playerZ - (looped ? this.trackLength : 0);

            // Projeta pontos
            // playerX * roadWidth é a posição lateral da câmera
            this.project(segment.p1, (playerX * CONSTANTS.ROAD_WIDTH) - x, cameraY + segment.y, camZ, cameraDepth, width, height, CONSTANTS.ROAD_WIDTH);
            this.project(segment.p2, (playerX * CONSTANTS.ROAD_WIDTH) - x - dx, cameraY + segment.y, camZ, cameraDepth, width, height, CONSTANTS.ROAD_WIDTH);

            x += dx;
            dx += segment.curve;

            if (segment.p1.camera.z <= cameraDepth || segment.p2.screen.y >= maxY || segment.p2.screen.y >= segment.p1.screen.y) {
                continue;
            }

            this.drawSegment(ctx, width, height, segment);
            maxY = segment.p1.screen.y;
        }
    }

    drawSegment(ctx, width, height, seg) {
        const grass = seg.color === 'dark' ? COLORS.GRASS.dark : COLORS.GRASS.light;
        const rumble = seg.color === 'dark' ? COLORS.RUMBLE.dark : COLORS.RUMBLE.light;
        const road = seg.color === 'dark' ? COLORS.ROAD.dark : COLORS.ROAD.light;

        const x1 = seg.p1.screen.x, y1 = seg.p1.screen.y, w1 = seg.p1.screen.w;
        const x2 = seg.p2.screen.x, y2 = seg.p2.screen.y, w2 = seg.p2.screen.w;

        // Fundo (Grama)
        ctx.fillStyle = grass;
        ctx.fillRect(0, y2, width, y1 - y2);

        // Zebra (Rumble)
        ctx.fillStyle = rumble;
        ctx.beginPath();
        ctx.moveTo(x1 - w1 * 1.2, y1);
        ctx.lineTo(x2 - w2 * 1.2, y2);
        ctx.lineTo(x2 + w2 * 1.2, y2);
        ctx.lineTo(x1 + w1 * 1.2, y1);
        ctx.fill();

        // Pista
        ctx.fillStyle = road;
        ctx.beginPath();
        ctx.moveTo(x1 - w1, y1);
        ctx.lineTo(x2 - w2, y2);
        ctx.lineTo(x2 + w2, y2);
        ctx.lineTo(x1 + w1, y1);
        ctx.fill();
    }
}
