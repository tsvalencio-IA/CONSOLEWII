import { CONSTANTS, COLORS, CHARACTERS } from './kart_assets.js';
import { State } from '../../core/state.js';

/**
 * ENGINE PRINCIPAL DO KART
 * Orquestra todos os subsistemas: Render, Física, IA e Input.
 */
export class KartEngine {
    constructor(modules) {
        this.Track = new modules.trackSys();
        this.Player = new modules.playerClass();
        this.Multiplayer = new modules.multiplayer();
        this.BotClass = modules.botClass;
        
        this.bots = [];
        this.state = 'RACE'; // RACE, FINISH
        this.charIdx = 0; // Personagem selecionado (default 0)
    }

    init() {
        console.log("🏁 [ENGINE] Iniciando Corrida...");
        
        // 1. Construir Pista
        this.Track.build(0);

        // 2. Configurar Player
        const char = CHARACTERS[this.charIdx];
        this.Player.maxSpeed = CONSTANTS.MAX_SPEED * char.speed;
        this.Player.turnSpeed = 2.0 * char.turn;
        
        // 3. Inicializar Multiplayer
        this.Multiplayer.init();

        // 4. Criar Bots (Se offline ou para preencher)
        this.bots.push(new this.BotClass({ id: 'cpu1', z: 200, x: -0.5, color: '#f1c40f', speed: 10500 }));
        this.bots.push(new this.BotClass({ id: 'cpu2', z: 400, x: 0.5, color: '#9b59b6', speed: 10800 }));

        console.log("🟢 [ENGINE] Luz Verde!");
    }

    update(dt, pose) {
        if (this.state !== 'RACE') return;

        // 1. Descobrir segmento atual do player para física
        const playerSeg = this.Track.findSegment(this.Player.z);

        // 2. Update Player
        this.Player.update(dt, pose, this.Track.trackLength, playerSeg.curve);

        // 3. Update Bots
        this.bots.forEach(bot => {
            const botSeg = this.Track.findSegment(bot.z);
            bot.update(dt, this.Track.trackLength, botSeg.curve);
        });

        // 4. Update Multiplayer
        this.Multiplayer.broadcast(this.Player, CHARACTERS[this.charIdx]);
        this.Multiplayer.updateRemotes(dt, this.Track.trackLength);
    }

    draw(ctx, w, h) {
        // Limpa tela
        ctx.fillStyle = COLORS.SKY[0];
        ctx.fillRect(0, 0, w, h);

        // Renderiza Pista
        // A câmera segue o player
        // Camera Y = Altura fixa + salto simulado
        const cameraY = CONSTANTS.CAMERA_HEIGHT + (this.Player.y || 0);
        
        // Renderiza geometria da pista
        this.Track.render(ctx, w, h, this.Player.z, this.Player.x, cameraY);

        // Renderiza Sprites (Oponentes e Objetos)
        // Precisamos desenhar de trás para frente para oclusão correta
        // Simplificação: Desenhamos bots e remote players depois da pista
        this.drawOpponents(ctx, w, h);

        // Renderiza Player (Sempre por último, na frente da câmera)
        this.Player.draw(ctx, w, h, CHARACTERS[this.charIdx].color);

        // HUD
        this.drawHUD(ctx, w, h);
    }

    drawOpponents(ctx, w, h) {
        const allOpponents = [
            ...this.bots, 
            ...Object.values(this.Multiplayer.remotePlayers)
        ];

        // Filtra apenas quem está visível (na frente do player)
        // E ordena por Z (do mais longe para o mais perto)
        allOpponents.sort((a, b) => {
            // Lógica simples de Z-buffer para loop
            let zA = a.z; 
            let zB = b.z;
            if (zA < this.Player.z) zA += this.Track.trackLength;
            if (zB < this.Player.z) zB += this.Track.trackLength;
            return zB - zA; // Desenha de longe pra perto
        });

        allOpponents.forEach(op => {
            // Projeta a posição 3D do oponente para 2D
            // Usa lógica similar à da pista
            // Z Relativo à câmera
            let relZ = op.z - this.Player.z;
            if (relZ < 0) relZ += this.Track.trackLength;

            if (relZ > 0 && relZ < CONSTANTS.DRAW_DISTANCE * CONSTANTS.SEGMENT_LENGTH) {
                const cameraDepth = 1 / Math.tan((CONSTANTS.FOV / 2) * Math.PI / 180);
                const scale = cameraDepth / relZ;
                
                const screenX = w/2 + (scale * ((op.x - this.Player.x) * CONSTANTS.ROAD_WIDTH) * w/2);
                const screenY = h/2 + (scale * CONSTANTS.CAMERA_HEIGHT * h/2) * 0.2; // Offset visual simples
                
                const size = w * scale * 1000; // Tamanho base

                // Desenha Kart Oponente (Quadrado simples por enquanto)
                ctx.fillStyle = op.color || '#555';
                ctx.fillRect(screenX - size/2, screenY, size, size * 0.6);
                
                // Nome
                if(size > 20) {
                   ctx.fillStyle = '#fff';
                   ctx.font = `${Math.floor(size/2)}px Arial`;
                   ctx.textAlign = 'center';
                   ctx.fillText(op.name || 'CPU', screenX, screenY - 5);
                }
            }
        });
    }

    drawHUD(ctx, w, h) {
        ctx.fillStyle = 'white';
        ctx.font = "bold 40px 'Russo One'";
        ctx.textAlign = 'left';
        
        const kmh = Math.floor(this.Player.speed / 100);
        ctx.fillText(kmh + " KM/H", 20, 50);

        ctx.font = "20px 'Chakra Petch'";
        ctx.fillText(this.Multiplayer.active ? "ONLINE" : "OFFLINE", 20, 80);
        
        // Debug Pose
        if (State.settings.showDebugCamera) {
            ctx.fillText("Pose Tracking ON", 20, 110);
        }
    }

    resize() {
        // Ajustes se necessário
    }

    cleanup() {
        this.Multiplayer.cleanup();
    }
}
