import { CONSTANTS } from './kart_assets.js';

/**
 * JOGADOR (Física e Controle)
 */
export class Player {
    constructor(charId) {
        this.x = 0; // Posição lateral (-1 a 1)
        this.z = 0; // Distância percorrida
        this.speed = 0;
        this.steer = 0; // Direção atual (-1 esquerda, 1 direita)
        
        // Stats
        this.maxSpeed = CONSTANTS.MAX_SPEED;
        this.accel = CONSTANTS.ACCEL;
        this.turnSpeed = 2.0;
        
        // Input States
        this.throttle = false;
        this.brake = false;
    }

    update(dt, pose, trackLength, currentCurve) {
        // 1. INPUT INTERPRETATION (Body Control)
        if (pose && pose.keypoints) {
            this.handlePoseInput(pose);
        } else {
            // Fallback Keyboard (Setas)
            // (Assumindo que eventos de teclado são capturados globalmente ou passados via engine)
            // Aqui implementamos uma leitura simples se não houver pose
        }

        // 2. FÍSICA
        // Aceleração
        if (this.throttle) {
            this.speed += this.accel * dt;
        } else if (this.brake) {
            this.speed += CONSTANTS.BREAKING * dt;
        } else {
            this.speed += CONSTANTS.DECEL * dt;
        }

        // Limites de Velocidade
        this.speed = Math.max(0, Math.min(this.speed, this.maxSpeed));

        // Direção e Força Centrifuga
        if (this.speed > 0) {
            const turnFactor = (this.speed / this.maxSpeed);
            
            // Aplica direção do jogador
            this.x += this.steer * this.turnSpeed * turnFactor * dt;
            
            // Aplica curva da pista (Centrifuga)
            // Se a pista curva para direita (curve > 0), o carro é jogado para esquerda (x diminui)
            this.x -= currentCurve * CONSTANTS.CENTRIFUGAL * turnFactor * dt;
        }

        // Offroad (Colisão lateral)
        if ((this.x < -1 || this.x > 1) && this.speed > CONSTANTS.OFFROAD_LIMIT) {
            this.speed += CONSTANTS.OFFROAD_DECEL * dt;
        }

        // Avanço
        this.z += this.speed * dt;
        if (this.z >= trackLength) this.z -= trackLength;
        if (this.z < 0) this.z += trackLength;
    }

    handlePoseInput(pose) {
        const kp = pose.keypoints;
        const leftShoulder = kp.find(k => k.name === 'left_shoulder');
        const rightShoulder = kp.find(k => k.name === 'right_shoulder');
        const leftWrist = kp.find(k => k.name === 'left_wrist');
        const rightWrist = kp.find(k => k.name === 'right_wrist');
        const nose = kp.find(k => k.name === 'nose');

        // Confiança mínima
        if (!leftShoulder || !rightShoulder || leftShoulder.score < 0.3 || rightShoulder.score < 0.3) return;

        // DIREÇÃO: Inclinação dos ombros
        // Diferença Y entre ombros. Se RightY > LeftY, ombro direito está mais baixo -> Curva Direita
        const dy = rightShoulder.y - leftShoulder.y;
        this.steer = dy * 5.0; // Sensibilidade
        // Clamp
        if (this.steer > 1) this.steer = 1;
        if (this.steer < -1) this.steer = -1;
        if (Math.abs(this.steer) < 0.1) this.steer = 0; // Deadzone

        // ACELERAÇÃO: Nariz à frente dos ombros (Z estimado pelo tamanho ou Y relativo não funciona bem em 2D)
        // Alternativa robusta: Inclinação do tronco ou Mãos para frente vs Mãos no peito
        // Vamos usar: Mãos abaixo dos ombros = Acelera. Mãos acima da cabeça = Freia.
        
        if (leftWrist && rightWrist) {
            const shouldersY = (leftShoulder.y + rightShoulder.y) / 2;
            const wristsY = (leftWrist.y + rightWrist.y) / 2;

            if (wristsY < shouldersY - 0.1) {
                // Mãos levantadas (acima dos ombros) -> Freio/Ré
                this.brake = true;
                this.throttle = false;
            } else {
                // Mãos baixas (volante virtual) -> Acelera
                this.brake = false;
                this.throttle = true;
            }
        } else {
            // Se não vê as mãos, assume aceleração constante (Cruise Control)
            this.throttle = true;
        }
    }

    draw(ctx, width, height, color) {
        // Renderiza o Kart (Pseudo-3D Simples)
        const bounce = (this.speed / this.maxSpeed) * Math.sin(Date.now() / 50) * 5;
        const x = width / 2;
        const y = height - 100 + bounce;
        const kartScale = 0.6;

        ctx.save();
        ctx.translate(x, y);
        
        // Inclinação visual nas curvas
        ctx.rotate(this.steer * 0.5);

        // Corpo
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-50 * kartScale, 0);
        ctx.lineTo(50 * kartScale, 0);
        ctx.lineTo(40 * kartScale, -40 * kartScale);
        ctx.lineTo(-40 * kartScale, -40 * kartScale);
        ctx.fill();

        // Rodas
        ctx.fillStyle = '#222';
        ctx.fillRect(-60 * kartScale, -10 * kartScale, 20 * kartScale, 40 * kartScale);
        ctx.fillRect(40 * kartScale, -10 * kartScale, 20 * kartScale, 40 * kartScale);

        // Capacete (Cabeça)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, -50 * kartScale, 20 * kartScale, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
