// =============================================================================
// PRO BOXING LEAGUE: PLAYSTATION 2 EDITION
// ARQUITETO: CODE 177
// VERSÃO: 2.0 (Física de Intenção, Pseudo-3D, Netcode Otimizado)
// =============================================================================

(function() {
    let particles = [];
    let popups = [];

    // Configurações Globais
    const CONF = {
        GAME_DURATION: 120, // 2 minutos em segundos
        TARGET_SPAWN_RATE: 700, // ms entre alvos
        GRAVITY: 0.6,
        DRAG: 0.95,          // Resistência do ar (física)
        HIT_STOP_MS: 120,    // Tempo que o jogo "congela" no impacto (Game Feel)
        CAMERA_SMOOTH: 0.1,  // Suavização da câmera
        
        // Configuração de Detecção de Socos (Intenção)
        PUNCH: {
            MIN_VELOCITY: 12,    // Velocidade mínima para armar o soco
            MIN_ACCEL: 4,        // Aceleração necessária para "explodir" o soco
            MAX_EXTENSION: 0.9,  // % do braço esticado para contar como impacto máximo
            COOLDOWN: 15         // Frames entre socos
        },

        // Arquétipos de Lutadores (Estilo PlayStation 2)
        CHARS: {
            'balanced': { 
                name: 'RED PLUMBER', 
                color: '#e74c3c', hat: '#c0392b', skin: '#ffccaa', 
                mass: 1.0, power: 10, speed: 1.0, reach: 1.0, stamina_cost: 15 
            },
            'speed': { 
                name: 'GREEN GHOST', 
                color: '#2ecc71', hat: '#27ae60', skin: '#ffccaa', 
                mass: 0.8, power: 7, speed: 1.3, reach: 1.2, stamina_cost: 10 
            },
            'power': { 
                name: 'BAD GARLIC', 
                color: '#f1c40f', hat: '#f39c12', skin: '#eebefa', 
                mass: 1.5, power: 18, speed: 0.7, reach: 0.8, stamina_cost: 25 
            },
            'boss': { 
                name: 'KING TURTLE', 
                color: '#27ae60', hat: '#e67e22', skin: '#f1c40f', 
                mass: 2.0, power: 25, speed: 0.5, reach: 1.1, stamina_cost: 35 
            }
        }    };

    // --- UTILITÁRIOS MATEMÁTICOS ---
    const MathUtils = {
        lerp: (a, b, t) => a + (b - a) * t,
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
        clamp: (val, min, max) => Math.min(Math.max(val, min), max),
        // Produto escalar para saber alinhamento de vetores
        dot: (v1, v2) => v1.x * v2.x + v1.y * v2.y,
        // Projeção Pseudo-3D (Escala baseada no Y)
        getScale: (y, height) => 0.6 + (y / height) * 0.6
    };

    // --- ENGINE PRINCIPAL ---
    const Logic = {
        // Estado Global
        state: 'INTRO', // INTRO, SELECT, FIGHT, ROUND_OVER, RESULT
        mode: 'SOLO',
        
        // Variáveis de Jogo
        frame: 0,
        time: 90,
        hitStopTimer: 0, // Contador para congelar o jogo
        
        // Câmera Virtual
        camera: { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0 },
        
        // Dados do Jogador Local
        myCharKey: 'balanced',
        player: {
            hp: 100, maxHp: 100,
            stamina: 100, maxStamina: 100,
            guard: 100, // Escudo que regenera
            pose: null, // Pose atual suavizada
            rawPose: null, // Pose crua da câmera
            // Física de soco
            hands: { 
                l: { state: 'IDLE', vel: {x:0, y:0}, pos: {x:0, y:0} }, 
                r: { state: 'IDLE', vel: {x:0, y:0}, pos: {x:0, y:0} } 
            }
        },

        // Inimigo (AI, Saco ou Player Remoto)
        rival: {
            id: null,
            hp: 100,
            pose: null, // Pose recebida da rede
            charKey: 'balanced',
            lastHitId: 0
        },
        // Objeto Físico: Saco de Pancada (Pêndulo)
        bag: {
            x: 0, y: 0, 
            angle: 0, 
            angVel: 0, 
            len: 200,
            mass: 20
        },

        // Sistema de Partículas e Textos Flutuantes
        effects: [],

        // Multiplayer
        roomId: 'pro_arena_01',
        isOnline: false,
        dbRef: null,
        lastSync: 0,

        // =========================================================================
        // CICLO DE VIDA E INICIALIZAÇÃO
        // =========================================================================
        init: function() {
            this.resetGame();
            window.System.msg("PRO BOXING LEAGUE 2.0");
            // Sons pré-carregados (se disponíveis no sistema host)
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        },

        resetGame: function() {
            this.state = 'SELECT';
            this.player.hp = 100;
            this.player.stamina = 100;
            this.effects = [];
            this.hitStopTimer = 0;
            this.disconnect();
            
            // Inicializa posição das mãos para evitar vetor zero
            this.player.hands.l.pos = {x:0,y:0};
            this.player.hands.r.pos = {x:0,y:0};
        },

        disconnect: function() {
            if (this.dbRef && window.System.playerId) {
                try {
                    window.DB.ref(`rooms/${this.roomId}/players/${window.System.playerId}`).remove();
                    window.DB.ref(`rooms/${this.roomId}`).off();
                } catch(e) {}
            }
            this.isOnline = false;        },

        startGame: function(mode) {
            this.mode = mode;
            this.time = 99;
            this.player.hp = 100;
            this.rival.hp = 100;
            this.state = 'FIGHT';
            
            if (mode === 'VERSUS') {
                if (!window.DB) {
                    window.System.msg("OFFLINE - MODO TREINO ATIVADO");
                    this.mode = 'SOLO';
                } else {
                    this.isOnline = true;
                    this.connectNet();
                }
            } else {
                // Configura Saco de Pancada
                this.bag.x = 0; // Centro (relativo à câmera)
                this.bag.y = -100;
                this.bag.angle = 0;
                this.bag.angVel = 0;
            }
            window.Sfx.click(); // Som genérico de start
        },

        // =========================================================================
        // LÓGICA DE UPDATE (100% GAME LOOP)
        // =========================================================================
        update: function(ctx, w, h, rawPose) {
            this.frame++;

            // 1. INPUT HANDLING & SMOOTHING (Filtro passa-baixa)
            if (rawPose && rawPose.keypoints) {
                this.player.rawPose = rawPose;
                if (!this.player.pose) {
                    this.player.pose = JSON.parse(JSON.stringify(rawPose)); // Primeira cópia
                } else {
                    // Interpolação forte para suavizar o "jitter" da webcam
                    this.player.pose.keypoints.forEach((kp, i) => {
                        const raw = rawPose.keypoints[i];
                        if (raw.score > 0.3) {
                            kp.x = MathUtils.lerp(kp.x, raw.x, 0.4);
                            kp.y = MathUtils.lerp(kp.y, raw.y, 0.4);
                            kp.score = raw.score;
                        }
                    });
                }
            }
            // 2. STATE MACHINE
            if (this.state === 'SELECT') {
                this.updateSelect(w, h);
                this.drawSelect(ctx, w, h);
                return this.player.hp;
            }

            if (this.state === 'RESULT') {
                this.drawResult(ctx, w, h);
                return this.player.hp;
            }

            // 3. HIT STOP (Congelamento de impacto)
            if (this.hitStopTimer > 0) {
                this.hitStopTimer -= 16; // Assume ~60fps
                // Tremor de câmera durante hitstop
                this.camera.shakeX = (Math.random() - 0.5) * 15;
                this.camera.shakeY = (Math.random() - 0.5) * 15;
                this.drawGame(ctx, w, h); // Desenha frame congelado
                return this.player.hp;
            } else {
                // Decaimento do shake
                this.camera.shakeX *= 0.8;
                this.camera.shakeY *= 0.8;
            }

            // 4. FÍSICA E LÓGICA DE COMBATE
            this.updatePhysics(w, h);
            this.updateStamina();
            
            // Modo Específico
            if (this.mode === 'SOLO') this.updateBagPhysics();
            if (this.isOnline) this.updateNet();

            // 5. RENDERIZAÇÃO
            this.updateCamera(w, h);
            this.drawGame(ctx, w, h);

            // Checa fim de luta
            if ((this.player.hp <= 0 || this.rival.hp <= 0) && this.state === 'FIGHT') {
                this.state = 'RESULT';
                const win = this.player.hp > 0;
                window.System.msg(win ? "VITÓRIA!" : "K.O.");
                if (win) this.spawnConfetti(w/2, h/2);
            }

            return this.player.hp;
        },
        // --- SISTEMA DE FÍSICA DE SOCO (INTENÇÃO) ---
        updatePhysics: function(w, h) {
            if (!this.player.pose) return;

            const charStats = CONF.CHARS[this.player.myCharKey];
            const getKp = (name) => {
                const k = this.player.pose.keypoints.find(p => p.name === name);
                // Mapeia coordenadas normalizadas para espaço do jogo (-w/2 a w/2)
                return k ? { 
                    x: (1 - k.x/640) * w - w/2, // Inverte X (espelho) e centraliza
                    y: (k.y/480) * h - h/2 
                } : {x:0,y:0};
            };

            const nose = getKp('nose');
            const leftWr = getKp('left_wrist');
            const rightWr = getKp('right_wrist');
            const leftSh = getKp('left_shoulder');
            const rightSh = getKp('right_shoulder');

            // Atualiza estado de cada mão
            ['l', 'r'].forEach(side => {
                const handObj = this.player.hands[side];
                const currPos = side === 'l' ? leftWr : rightWr;
                const shoulder = side === 'l' ? leftSh : rightSh;
                
                // Calcula velocidade instantânea (Delta Pos)
                const dx = currPos.x - handObj.pos.x;
                const dy = currPos.y - handObj.pos.y;
                const dist = Math.hypot(dx, dy);
                const velocity = dist; // pixels por frame

                // Vetor ombro -> mão (Extensão)
                const armLen = MathUtils.dist(shoulder, currPos);
                const is