import { CONSTANTS } from './kart_assets.js';

/**
 * INTELIGÊNCIA ARTIFICIAL (BOTS)
 * Controla os adversários na pista.
 */
export class Bot {
    constructor(config) {
        this.id = config.id;
        this.x = config.x || 0; // Posição lateral inicial
        this.z = config.z || 0; // Posição na pista
        this.color = config.color || '#bdc3c7';
        this.speed = config.speed || 10000;
        this.maxSpeed = config.speed || 11000;
        this.name = config.name || 'CPU';
        
        // Comportamento
        this.turnSpeed = 1.5;
        this.aggression = Math.random(); // 0 a 1
        this.lanePreference = (Math.random() * 2) - 1; // Posição favorita na pista
    }

    update(dt, trackLength, currentCurve) {
        // 1. Aceleração Constante
        this.speed += 100 * dt; 
        if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;

        // 2. Navegação (Segue a curva da pista)
        // Se a curva é para direita (positiva), o bot deve virar para direita para compensar a centrífuga
        const targetX = this.lanePreference - (currentCurve * 0.5); 
        
        // Suavização do movimento (Steering)
        if (this.x < targetX) this.x += this.turnSpeed * dt;
        if (this.x > targetX) this.x -= this.turnSpeed * dt;

        // 3. Centrífuga (Mesma física do player)
        this.x -= currentCurve * CONSTANTS.CENTRIFUGAL * (this.speed / CONSTANTS.MAX_SPEED) * dt;

        // 4. Limites da Pista
        if (this.x < -1.5) this.x = -1.5;
        if (this.x > 1.5) this.x = 1.5;

        // 5. Movimento Frontal
        this.z += this.speed * dt;
        
        // Loop da Pista
        if (this.z >= trackLength) this.z -= trackLength;
        if (this.z < 0) this.z += trackLength;
    }

    draw(ctx, width, height, trackSys, playerZ, playerX, cameraDepth) {
        // O Bot é desenhado pelo sistema de sprites da pista no kart_engine.js
        // Mas podemos ter um método auxiliar aqui se precisarmos de logica customizada
    }
}
