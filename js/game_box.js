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
                const isExtended = armLen > (100 * charStats.reach); // Valor base arbitrário calibrado

                // -- Lógica de Detecção de Intenção --
                
                // Se estava IDLE e acelerou muito rápido -> PUNCH
                if (handObj.state === 'IDLE') {
                    if (velocity > CONF.PUNCH.MIN_VELOCITY * charStats.speed && this.player.stamina > 5) {
                        handObj.state = 'PUNCHING';
                        this.player.stamina -= charStats.stamina_cost;
                        // Toca som de "woosh"
                        window.Sfx.play(800, 'sine', 0.1, 0.1);
                    }
                } 
                else if (handObj.state === 'PUNCHING') {
                    // Verifica colisão
                    this.checkCollision(side, currPos, velocity);
                    
                    // Se a velocidade caiu ou braço esticou totalmente, volta
                    if (velocity < 2 || isExtended) {
                        handObj.state = 'RETRACT';
                    }
                }
                else if (handObj.state === 'RETRACT') {
                    // Cooldown simples
                    handObj.state = 'IDLE';
                }

                // Atualiza histórico
                handObj.pos = currPos;
                handObj.vel = {x: dx, y: dy};
            });
        },

        checkCollision: function(side, handPos, velocity) {
            let hit = false;
            let target = null;
            let damage = 0;

            const charStats = CONF.CHARS[this.player.myCharKey];
            const dmgBase = charStats.power * (velocity / 10); // Dano baseado na velocidade do impacto

            if (this.mode === 'SOLO') {
                // Colisão com Saco de Pancada (Círculo vs Ponto simplificado)
                // O saco está em (0, height_offset) no mundo, ajustado pelo pêndulo
                const bagWorldX = this.bag.x + Math.sin(this.bag.angle) * this.bag.len;
                const bagWorldY = this.bag.y + Math.cos(this.bag.angle) * this.bag.len;

                // Distância da mão para o "corpo" do saco                if (MathUtils.dist(handPos, {x: bagWorldX, y: bagWorldY}) < 60) {
                    hit = true;
                    // Físico do saco: Adiciona velocidade angular baseada na direção do soco
                    const force = (handPos.x < bagWorldX ? 1 : -1) * (velocity * 0.02) * charStats.mass;
                    this.bag.angVel += force;
                    damage = dmgBase;
                }
            } 
            else if (this.mode === 'VERSUS' && this.rival.pose) {
                // Colisão com Rival (precisa transformar as coordenadas do rival)
                // O rival é renderizado na posição dele. Vamos assumir hitbox na cabeça.
                // Como é P2P, usamos a posição visual do rival para detecção local.
                
                // Rival Head (espelhada ou não, dependendo do lado)
                // Simplificação: Rival está centrado em 0,0 com um Z diferente, mas aqui é 2D.
                // Usamos a pose dele.
                const rNose = this.rival.pose.keypoints.find(k => k.name === 'nose');
                if (rNose) {
                     // Converte pose do rival (que vem 0-640) para coord de jogo
                     // Nota: A pose do rival já vem "pronta" se ele enviou dados processados, 
                     // mas se for raw, precisamos converter. Vamos assumir coordenadas de tela.
                     const rX = (1 - rNose.x/640) * window.innerWidth - window.innerWidth/2;
                     const rY = (rNose.y/480) * window.innerHeight - window.innerHeight/2;
                     
                     if (MathUtils.dist(handPos, {x: rX, y: rY}) < 80) {
                        hit = true;
                        damage = dmgBase;
                        // Verifica bloqueio do rival (mãos perto do rosto)
                        // Isso seria calculado no cliente DELE, mas aqui fazemos uma predição visual
                        // Para simplificar: Dano total.
                     }
                }
            }

            if (hit) {
                // GAME FEEL: CONGELA, TREME, PARTICULAS
                this.hitStopTimer = CONF.HIT_STOP_MS;
                this.camera.zoom = 1.05; // Zoom in leve
                this.spawnParticles(handPos.x, handPos.y, 10, '#FFFF00');
                this.spawnPopText(Math.floor(damage), handPos.x, handPos.y - 50);
                window.Sfx.hit(); 
                
                // Consome estado de soco para não dar hit kill num frame
                this.player.hands[side].state = 'RETRACT';

                // Aplica dano lógico
                if (this.mode === 'VERSUS') {
                    this.sendHit(damage);
                    // Feedback visual imediato
                    this.rival.hp -= damage;                } else {
                    // Score no modo treino
                    this.rival.hp -= damage; // Só visual
                }
            }
        },

        updateBagPhysics: function() {
            // Simulação de Pêndulo
            // Aceleração Angular = (-g / len) * sin(theta)
            const accel = (-CONF.GRAVITY / (this.bag.len/10)) * Math.sin(this.bag.angle);
            this.bag.angVel += accel;
            this.bag.angVel *= CONF.DRAG; // Atrito do ar
            this.bag.angle += this.bag.angVel;
        },

        updateStamina: function() {
            if (this.player.stamina < this.player.maxStamina) {
                this.player.stamina += 0.3; // Regeneração
            }
        },

        // --- RENDERIZAÇÃO (VISUAL STYLE) ---
        updateCamera: function(w, h) {
            // Câmera segue levemente a cabeça do jogador e a do rival
            let targetX = 0;
            let targetY = 0;
            
            // Se tiver pose, foca no rosto
            const nose = this.player.pose?.keypoints.find(k => k.name === 'nose');
            if (nose) {
                const px = (1 - nose.x/640) * w - w/2;
                targetX = px * 0.2; // Segue 20%
            }

            // Suavização (Lerp)
            this.camera.x = MathUtils.lerp(this.camera.x, targetX + this.camera.shakeX, CONF.CAMERA_SMOOTH);
            this.camera.y = MathUtils.lerp(this.camera.y, targetY + this.camera.shakeY, CONF.CAMERA_SMOOTH);
            
            // Retorna zoom ao normal
            this.camera.zoom = MathUtils.lerp(this.camera.zoom, 1.0, 0.1);
        },

        drawGame: function(ctx, w, h) {
            // Limpa e aplica câmera
            ctx.save();
            ctx.fillStyle = '#1a1a2e'; // Fundo Arcade Dark
            ctx.fillRect(0,0,w,h);
            
            ctx.translate(w/2, h/2);            ctx.scale(this.camera.zoom, this.camera.zoom);
            ctx.translate(-this.camera.x, -this.camera.y);

            // 1. CHÃO (Grid de Perspectiva)
            this.drawFloor(ctx, w, h);

            // 2. OBJETOS DE FUNDO (Saco ou Rival)
            if (this.mode === 'SOLO') {
                this.drawBag(ctx);
            } else if (this.mode === 'VERSUS') {
                this.drawRival(ctx);
            }

            // 3. JOGADOR (Frente)
            this.drawPlayer(ctx, this.player.pose, this.player.myCharKey, true);

            // 4. EFEITOS (Partículas, Textos)
            this.drawEffects(ctx);

            ctx.restore();

            // 5. HUD (Fixo na tela)
            this.drawHUD(ctx, w, h);
        },

        drawFloor: function(ctx, w, h) {
            // Simula profundidade com linhas
            ctx.strokeStyle = '#303a5e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            // Horizonte falso
            const floorY = 100; 
            for (let i = -500; i <= 500; i+=100) {
                // Linhas verticais convergindo
                ctx.moveTo(i, floorY);
                ctx.lineTo(i * 3, h);
            }
            // Linhas horizontais
            for (let i = 0; i < 5; i++) {
                const y = floorY + (i*80);
                ctx.moveTo(-w, y);
                ctx.lineTo(w, y);
            }
            ctx.stroke();

            // Sombra do ringue
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.ellipse(0, 200, 300, 100, 0, 0, Math.PI*2);
            ctx.fill();
        },
        drawPlayer: function(ctx, pose, charKey, isSelf) {
            if (!pose) return;
            const c = CONF.CHARS[charKey];
            
            // Helper de coordenadas
            const getPos = (name) => {
                const k = pose.keypoints.find(p => p.name === name);
                if (!k) return {x:0, y:0};
                // Se for isSelf, já transformamos no update. 
                // Se for Rival, precisamos garantir que está no sistema de coord correto.
                if (isSelf) {
                    return { 
                        x: (1 - k.x/640) * ctx.canvas.width - ctx.canvas.width/2, 
                        y: (k.y/480) * ctx.canvas.height - ctx.canvas.height/2 
                    };
                } else {
                    // Rival vem da rede, assume-se normalizado ou raw.
                    // Para simplificar a demo, usamos a lógica espelhada se for raw.
                    return { 
                        x: (k.x/640) * ctx.canvas.width - ctx.canvas.width/2, 
                        y: (k.y/480) * ctx.canvas.height - ctx.canvas.height/2 
                    };
                }
            };

            const head = getPos('nose');
            const lSh = getPos('left_shoulder');
            const rSh = getPos('right_shoulder');
            const lWr = getPos('left_wrist');
            const rWr = getPos('right_wrist');

            // --- DESENHO ESTILIZADO (Estilo Rayman/Mario - Membros flutuantes com volume) ---
            
            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(head.x, 300, 60, 20, 0, 0, Math.PI*2);
            ctx.fill();

            // Função para desenhar Luva
            const drawGlove = (pos, color) => {
                // Efeito 3D: Escala baseada no Y (quanto mais baixo na tela, mais perto da camera)
                const scale = MathUtils.getScale(pos.y, 480);
                const size = 30 * scale * (isSelf ? 1.2 : 1); // Luvas do jogador maiores

                // Rastro (Motion Blur simples)
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, size, 0, Math.PI*2);                ctx.fill();
                
                // Brilho
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.beginPath();
                ctx.arc(pos.x - size*0.3, pos.y - size*0.3, size*0.4, 0, Math.PI*2);
                ctx.fill();

                // Contorno
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.stroke();
            };

            // Desenha Corpo (Abstrato - Camiseta)
            ctx.strokeStyle = c.color;
            ctx.lineWidth = 80;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(lSh.x, lSh.y + 20);
            ctx.lineTo(rSh.x, rSh.y + 20);
            ctx.stroke();

            // Macacão (Detalhe)
            ctx.strokeStyle = '#2c3e50'; // Jeans
            ctx.lineWidth = 60;
            ctx.beginPath();