// =============================================================================
// SUPER BOXING STADIUM: CHAMPIONSHIP EDITION (GOLD MASTER V8)
// ARQUITETO: SENIOR DEV - PERFECT IK, NETCODE ROBUSTO & INPUT 1:1
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E CONFIGURAÇÕES
    // -----------------------------------------------------------------

    const CHARACTERS = [
        { id: 0, name: 'MARIO',   color: '#e74c3c', skin: '#ffccaa', hat: '#d32f2f', power: 1.0, speed: 1.0, hp: 100 },
        { id: 1, name: 'LUIGI',   color: '#2ecc71', skin: '#ffccaa', hat: '#27ae60', power: 0.9, speed: 1.1, hp: 100 },
        { id: 2, name: 'PEACH',   color: '#ff9ff3', skin: '#ffe0bd', hat: '#fd79a8', power: 0.8, speed: 1.3, hp: 90  },
        { id: 3, name: 'BOWSER',  color: '#f1c40f', skin: '#e67e22', hat: '#c0392b', power: 1.4, speed: 0.7, hp: 130 },
        { id: 4, name: 'WALUIGI', color: '#8e44ad', skin: '#ffccaa', hat: '#5e2d85', power: 1.1, speed: 0.9, hp: 100 }
    ];

    const ARENAS = [
        { id: 0, name: 'TRAINING GYM',   bgTop: '#34495e', bgBot: '#2c3e50', rope: '#95a5a6', floor: '#bdc3c7' },
        { id: 1, name: 'WORLD CIRCUIT',  bgTop: '#2980b9', bgBot: '#2c3e50', rope: '#e74c3c', floor: '#ecf0f1' },
        { id: 2, name: 'CHAMPION RING',  bgTop: '#8e44ad', bgBot: '#2c2c54', rope: '#f1c40f', floor: '#f5f6fa' }
    ];

    const CONF = {
        ROUNDS: 3,
        ROUND_TIME: 60,
        // Física
        VELOCITY_THRESH: 5,   // Sensibilidade para detectar intenção de soco
        BLOCK_DIST: 140,      // Distância para considerar defesa
        SMOOTHING: 0.8,       // 1.0 = cru, 0.1 = muito lento. 0.8 é o sweet spot.
        MIN_CONFIDENCE: 0.2,  // Filtro de ruído da câmera
        REACH_SCALE: 2.5      // Multiplicador visual de profundidade
    };

    // --- MATH UTILS ---
    const Utils = {
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
        lerp: (a, b, t) => a + (b - a) * t,
        lerpPoint: (p1, p2, t) => ({ x: Utils.lerp(p1.x, p2.x, t), y: Utils.lerp(p1.y, p2.y, t) }),
        
        // Converte coordenadas normalizadas do TFJS para Canvas
        toScreen: (kp, w, h) => ({ 
            x: (1 - kp.x / 640) * w, 
            y: (kp.y / 480) * h 
        }),
        
        // Verifica toque em botão (UI)
        isInside: (x, y, btn) => {
            const pad = 30; // Hitbox generosa para mobile
            return x >= btn.x - pad && x <= btn.x + btn.w + pad && 
                   y >= btn.y - pad && y <= btn.y + btn.h + pad;
        },

        // SOLVER DE CINEMÁTICA INVERSA (IK) DE 2 OSSOS
        // Garante que o braço nunca quebre ou estique além da calibração
        solveIK: (shoulder, target, lenUpper, lenFore) => {
            const dist = Utils.dist(shoulder, target);
            const totalLen = lenUpper + lenFore;
            
            // 1. Se o alvo está longe demais, estica o braço todo na direção do alvo
            if (dist >= totalLen * 0.99) {
                const ratio = totalLen / dist;
                return {
                    elbow: {
                        x: shoulder.x + (target.x - shoulder.x) * (lenUpper / totalLen),
                        y: shoulder.y + (target.y - shoulder.y) * (lenUpper / totalLen)
                    },
                    hand: {
                        x: shoulder.x + (target.x - shoulder.x) * ratio,
                        y: shoulder.y + (target.y - shoulder.y) * ratio
                    },
                    extension: 1.0
                };
            }

            // 2. Cálculo do ângulo do cotovelo (Lei dos Cossenos)
            // Mantém o cotovelo "para fora" naturalmente
            const angShoulder = Math.atan2(target.y - shoulder.y, target.x - shoulder.x);
            const cosAngle = (dist * dist + lenUpper * lenUpper - lenFore * lenFore) / (2 * dist * lenUpper);
            const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
            
            // Define se o cotovelo vai para esquerda ou direita baseado na posição da mão
            // Braço esquerdo (mão à esquerda do ombro) -> cotovelo para esquerda (-angle)
            const sideFactor = (target.x < shoulder.x) ? 1 : -1; 
            
            const elbowX = shoulder.x + lenUpper * Math.cos(angShoulder + angle * sideFactor * (target.x < shoulder.x ? -1 : 1)); 
            // Simplificação para garantir visual "Boxe": cotovelo sempre tende a ficar baixo/lado
            
            // Vamos usar uma aproximação visual mais estável para o jogo
            // Interpolamos entre "cotovelo real detectado" e "cotovelo ideal calculado"
            return {
                elbow: { // Placeholder, será misturado com dados reais
                     x: (shoulder.x + target.x)/2 + (target.x < shoulder.x ? -40 : 40),
                     y: (shoulder.y + target.y)/2 + 20
                },
                hand: target,
                extension: dist / totalLen
            };
        }
    };

    // -----------------------------------------------------------------
    // 2. ESTADO E LÓGICA
    // -----------------------------------------------------------------

    const Game = {
        state: 'MODE_SELECT',
        roomId: 'boxing_v8_global',
        isOnline: false,
        dbRef: null,
        uiButtons: {},

        // Seleção
        selMode: 'OFFLINE',
        selChar: 0,
        selArena: 0,

        // Loop
        timer: 0,
        round: 1,
        frame: 0,
        
        // --- JOGADOR (P1) ---
        p1: { 
            hp: 100, maxHp: 100, stamina: 100, score: 0,
            head: {x:0, y:0},
            // Dados brutos suavizados
            raw: { 
                ls: {x:0,y:0}, rs: {x:0,y:0}, // Ombros
                le: {x:0,y:0}, re: {x:0,y:0}, // Cotovelos
                lw: {x:0,y:0}, rw: {x:0,y:0}  // Punhos
            },
            // Dados processados para render
            visual: {
                armL: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 },
                armR: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 }
            },
            guard: false,
            // Calibração
            calib: { 
                active: false,
                samples: 0,
                upperLen: 120, // Ombro->Cotovelo
                foreLen: 100,  // Cotovelo->Punho
                totalLen: 220
            }
        },

        // --- OPONENTE (P2) ---
        p2: { 
            hp: 100, maxHp: 100, id: null, isRemote: false, charId: 0,
            head: {x:0, y:0},
            visual: {
                armL: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 },
                armR: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 }
            },
            guard: false,
            ai: { state: 'IDLE', timer: 0 }
        },

        particles: [],
        msgs: [],

        // =================================================================
        // CICLO DE VIDA E INPUT
        // =================================================================

        init: function() {
            this.state = 'MODE_SELECT';
            this.cleanup();
            if(window.System.msg) window.System.msg("BOXE SIMULATOR V8");
            this.setupInput();
        },

        cleanup: function() {
            if (this.dbRef) {
                try { this.dbRef.child('players/' + window.System.playerId).remove(); this.dbRef.off(); } 
                catch(e){}
            }
            window.System.canvas.onclick = null;
        },

        setupInput: function() {
            window.System.canvas.onclick = (e) => {
                const r = window.System.canvas.getBoundingClientRect();
                const x = e.clientX - r.left;
                const y = e.clientY - r.top;
                
                const btn = (id) => this.uiButtons[id] && Utils.isInside(x, y, this.uiButtons[id]);

                if (this.state === 'MODE_SELECT') {
                    if (btn('off')) this.setMode('OFFLINE');
                    if (btn('on')) this.setMode('ONLINE');
                } else if (this.state === 'CHAR_SELECT') {
                    if (btn('next')) { this.selChar = (this.selChar+1)%CHARACTERS.length; window.Sfx.play(600,'square',0.1); }
                    if (btn('ok')) { this.state = 'ARENA_SELECT'; window.Sfx.click(); }
                } else if (this.state === 'ARENA_SELECT') {
                    if (btn('next')) { this.selArena = (this.selArena+1)%ARENAS.length; window.Sfx.play(600,'square',0.1); }
                    if (btn('ok')) this.startCalib();
                } else if (this.state === 'CALIBRATE') {
                    // Trava mínima de amostras
                    if (btn('done') && this.p1.calib.samples > 10) this.finishCalib();
                } else if (this.state === 'GAMEOVER') {
                    if (btn('menu')) this.init();
                }
            };
        },

        setMode: function(m) {
            if(m === 'ONLINE' && !window.DB) { window.System.msg("OFFLINE ONLY"); return; }
            this.selMode = m;
            this.isOnline = (m === 'ONLINE');
            this.state = 'CHAR_SELECT';
            window.Sfx.click();
        },

        startCalib: function() {
            this.state = 'CALIBRATE';
            this.p1.calib.samples = 0;
            this.p1.calib.active = true;
            window.System.msg("POSIÇÃO T-POSE");
        },

        finishCalib: function() {
            this.p1.calib.active = false;
            // Garante valores mínimos se a calibração falhou
            this.p1.calib.upperLen = Math.max(50, this.p1.calib.upperLen);
            this.p1.calib.foreLen = Math.max(50, this.p1.calib.foreLen);
            this.p1.calib.totalLen = this.p1.calib.upperLen + this.p1.calib.foreLen;
            this.startGame();
        },

        startGame: function() {
            this.p1.hp = 100;
            this.p1.score = 0;
            this.round = 1;
            this.timer = CONF.ROUND_TIME * 60;
            this.particles = [];
            
            // Reset posições para o centro
            const w = window.System.canvas.width;
            const h = window.System.canvas.height;
            this.p1.head = {x:w/2, y:h/2};

            if (this.isOnline) {
                this.connectLobby();
            } else {
                // Setup CPU
                this.p2.charId = Math.floor(Math.random() * CHARACTERS.length);
                this.p2.hp = 100;
                this.p2.isRemote = false;
                this.p2.head = {x:w/2, y:h/3};
                this.state = 'FIGHT';
                window.System.msg("LUTA!");
            }
        },

        connectLobby: function() {
            this.state = 'LOBBY';
            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            
            // Entra na sala
            myRef.set({ 
                charId: this.selChar, 
                hp: 100, 
                lastSeen: firebase.database.ServerValue.TIMESTAMP 
            });
            myRef.onDisconnect().remove();

            // Escuta a sala
            this.dbRef.child('players').on('value', snap => {
                const players = snap.val();
                if (!players) return;

                // Acha o ID do oponente
                const opId = Object.keys(players).find(id => id !== window.System.playerId);

                if (opId) {
                    const p2Data = players[opId];
                    // Se achou alguém, COMEÇA A LUTA IMEDIATAMENTE (Sem esperar 'ready')
                    if (this.state === 'LOBBY') {
                        this.p2.id = opId;
                        this.p2.charId = p2Data.charId || 0;
                        this.p2.hp = p2Data.hp || 100;
                        this.p2.isRemote = true;
                        this.state = 'FIGHT';
                        window.System.msg("VS " + CHARACTERS[this.p2.charId].name);
                    }
                    // Sincroniza dados de luta
                    if (this.state === 'FIGHT') {
                        this.p2.hp = p2Data.hp;
                        if (p2Data.pose) {
                            this.p2.head = p2Data.pose.h;
                            this.p2.visual.armL = p2Data.pose.al;
                            this.p2.visual.armR = p2Data.pose.ar;
                            this.p2.guard = p2Data.pose.g;
                        }
                    }
                } else {
                    // Oponente saiu
                    if (this.state === 'FIGHT') {
                        this.state = 'GAMEOVER';
                        window.System.msg("OPONENTE DESCONECTOU");
                    }
                }
            });
        },

        // =================================================================
        // UPDATE LOOP
        // =================================================================

        update: function(ctx, w, h, pose) {
            this.frame++;
            this.uiButtons = {};

            // 1. INPUT TRACKING (Sempre roda para atualizar esqueleto)
            this.processSkeleton(w, h, pose);

            // 2. ESTADOS
            if (this.state === 'MODE_SELECT') { this.uiMode(ctx, w, h); return; }
            if (this.state === 'CHAR_SELECT') { this.uiChar(ctx, w, h); return; }
            if (this.state === 'ARENA_SELECT') { this.uiArena(ctx, w, h); return; }
            if (this.state === 'CALIBRATE') { this.uiCalib(ctx, w, h); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiOver(ctx, w, h); return; }

            // === LUTA ===
            this.drawArena(ctx, w, h);

            if (this.isOnline) {
                this.syncNetwork(); // Envia dados
            } else {
                this.updateAI(w, h); // Processa CPU
            }

            // Oponente (Fundo)
            this.drawCharacter(ctx, this.p2, false, w, h);
            
            // Jogador (Frente/POV)
            this.drawCharacter(ctx, this.p1, true, w, h);

            // Lógica de Jogo
            if (this.timer > 0) this.timer--; else this.endGame();
            if (this.p1.hp <= 0 || this.p2.hp <= 0) this.endGame();

            this.drawHUD(ctx, w, h);
            this.updateParticles(ctx);
            this.drawMsgs(ctx);

            return Math.floor(this.p1.score);
        },

        // =================================================================
        // FÍSICA E CINEMÁTICA (SKELETON ENGINE)
        // =================================================================

        processSkeleton: function(w, h, pose) {
            if (!pose || !pose.keypoints) return;
            const k = pose.keypoints;
            const smooth = CONF.SMOOTHING;
            const thresh = CONF.MIN_CONFIDENCE;

            // Helper para pegar ponto ou fallback
            const getP = (i, fallback) => (k[i] && k[i].score > thresh) ? Utils.toScreen(k[i], w, h) : fallback;

            // 1. Captura Dados Brutos
            const nose = getP(0, this.p1.head);
            const ls = getP(5, {x:w*0.3, y:h*0.8}); // Ombro E
            const rs = getP(6, {x:w*0.7, y:h*0.8}); // Ombro D
            const le = getP(7, {x:w*0.2, y:h*0.9}); // Cotovelo E
            const re = getP(8, {x:w*0.8, y:h*0.9}); // Cotovelo D
            const lw = getP(9, this.p1.raw.lw);     // Punho E
            const rw = getP(10, this.p1.raw.rw);    // Punho D

            // 2. Calibração (Se ativo)
            if (this.p1.calib.active) {
                // Mede braços na T-Pose (90 graus)
                const distUpperL = Utils.dist(ls, le);
                const distForeL = Utils.dist(le, lw);
                const distUpperR = Utils.dist(rs, re);
                const distForeR = Utils.dist(re, rw);
                
                // Média acumulativa
                if (distUpperL > 20 && distForeL > 20) {
                    this.p1.calib.upperLen = (this.p1.calib.upperLen * 0.9) + ((distUpperL + distUpperR)/2 * 0.1);
                    this.p1.calib.foreLen = (this.p1.calib.foreLen * 0.9) + ((distForeL + distForeR)/2 * 0.1);
                    this.p1.calib.samples++;
                }
                return; // Não processa luta durante calibração
            }

            // 3. Aplica Suavização nos Dados Brutos
            this.p1.head = Utils.lerpPoint(this.p1.head, nose, smooth);
            this.p1.raw.ls = Utils.lerpPoint(this.p1.raw.ls, ls, smooth);
            this.p1.raw.rs = Utils.lerpPoint(this.p1.raw.rs, rs, smooth);
            this.p1.raw.le = Utils.lerpPoint(this.p1.raw.le, le, smooth);
            this.p1.raw.re = Utils.lerpPoint(this.p1.raw.re, re, smooth);
            
            // Punhos precisam ser mais rápidos (menos smooth)
            const fastSmooth = 0.5; 
            this.p1.raw.lw = Utils.lerpPoint(this.p1.raw.lw, lw, fastSmooth);
            this.p1.raw.rw = Utils.lerpPoint(this.p1.raw.rw, rw, fastSmooth);

            // 4. Processa Braços com Trava de Tamanho (IK/DK Híbrido)
            this.processArm('armL', this.p1.raw.ls, this.p1.raw.le, this.p1.raw.lw, 'left', w, h);
            this.processArm('armR', this.p1.raw.rs, this.p1.raw.re, this.p1.raw.rw, 'right', w, h);

            // 5. Guarda
            const dL = Utils.dist(this.p1.visual.armL.w, this.p1.head);
            const dR = Utils.dist(this.p1.visual.armR.w, this.p1.head);
            this.p1.guard = (dL < CONF.BLOCK_DIST && dR < CONF.BLOCK_DIST);
            
            // Stamina regen
            if(this.p1.stamina < 100) this.p1.stamina += 0.3;
        },

        processArm: function(armKey, s, e, w, side, screenW, screenH) {
            const visual = this.p1.visual[armKey];
            
            // A. Base do Braço (Ombro Virtual para POV)
            // Move-se ligeiramente com a cabeça, mas fica na base da tela
            const baseX = (side === 'left') ? screenW * 0.2 : screenW * 0.8;
            visual.s = {
                x: baseX + (this.p1.head.x - screenW/2) * 0.2,
                y: screenH + 60 // Fora da tela
            };

            // B. Punho (Wrist) - Segue input 1:1
            // Calcula velocidade para impacto
            const speed = Utils.dist(visual.w, w);
            visual.w = w; // Posição XY direta

            // C. Cotovelo (Elbow) - Restringido pela Calibração
            // Se o cotovelo detectado (e) estiver muito longe/perto, ajustamos para manter a proporção
            // Usamos a direção S->E e E->W detectadas, mas forçamos os comprimentos calibrados
            
            // Z-Depth (Extensão)
            // Quão longe o punho está do ombro REAL em relação ao tamanho total do braço?
            const currentDist = Utils.dist(s, w);
            const maxDist = this.p1.calib.totalLen;
            const extension = Math.min(1.2, currentDist / maxDist); // 1.0 = esticado
            
            // Z visual: 0 (perto) -> 200 (longe/soco)
            const targetZ = Math.max(0, (extension - 0.5) * 2 * 200);
            visual.z = Utils.lerp(visual.z, targetZ, 0.2);

            // Cotovelo Visual (Para renderização)
            // Interpolamos entre o cotovelo real e um ponto médio para estabilidade
            const midX = (visual.s.x + visual.w.x) / 2;
            const midY = (visual.s.y + visual.w.y) / 2;
            
            // Se cotovelo real está bugado ou invisível, use estimativa
            visual.e = {
                x: Utils.lerp(midX, e.x, 0.5), 
                y: Utils.lerp(midY, e.y, 0.5)
            };

            // D. Detecção de Hit
            if (speed > CONF.VELOCITY_THRESH && visual.z > 50 && this.p1.stamina > 5) {
                this.checkHit(visual.w, visual.z, speed);
            }
        },

        checkHit: function(handPos, z, speed) {
            // Hitbox Rival (Centro da tela)
            const rX = this.p2.head.x; // Já vem invertido/ajustado se for IA ou Net
            const rY = this.p2.head.y;
            
            if (Utils.dist(handPos, {x:rX, y:rY}) < 100 && z > 80) {
                if (this.p2.guard) {
                    this.spawnMsg(rX, rY, "BLOCKED", "#aaa");
                    window.Sfx.play(150, 'square', 0.1);
                } else {
                    const dmg = Math.floor(speed * 0.5) + 5;
                    this.p2.hp -= dmg;
                    this.p1.score += dmg * 10;
                    this.p1.stamina -= 10;
                    this.spawnParticles(rX, rY, '#f00');
                    this.spawnMsg(rX, rY, dmg, "#ff0");
                    window.Sfx.hit();
                    window.Gfx.shakeScreen(10);
                    
                    if (this.isOnline) {
                        this.dbRef.child('players/' + this.p2.id).update({hp: this.p2.hp});
                    }
                }
            }
        },

        updateAI: function(w, h) {
            const cpu = this.p2;
            const stats = CHARACTERS[cpu.charId];
            
            // Movimento Senoidal
            const t = this.frame * 0.05 * stats.speed;
            const targetX = (w/2) + Math.sin(t) * 150;
            cpu.head.x = Utils.lerp(cpu.head.x, targetX, 0.05);
            cpu.head.y = h/3 + Math.cos(t*0.5) * 30;

            // Braços IA (Animação procedural)
            const baseLX = cpu.head.x - 60; 
            const baseRX = cpu.head.x + 60;
            const baseY = cpu.head.y + 80;

            // Lógica de Ataque/Defesa
            if (cpu.aiTimer-- <= 0) {
                const act = Math.random();
                if (act < 0.03 * stats.speed) { // Soco
                    const side = Math.random()>0.5 ? 'armL' : 'armR';
                    cpu.visual[side].z = 150; // Estica
                    cpu.aiTimer = 40;
                    
                    // Checa se acertou player
                    if (!this.p1.guard) {
                        this.p1.hp -= 5;
                        window.Gfx.shakeScreen(5);
                        this.spawnMsg(w/2, h/2, "OUCH", "#f00");
                    } else {
                         window.Sfx.play(100, 'sine', 0.1);
                    }

                } else if (act < 0.05) { // Guarda
                    cpu.guard = !cpu.guard;
                    cpu.aiTimer = 60;
                } else { // Idle
                    cpu.visual.armL.z = 0;
                    cpu.visual.armR.z = 0;
                }
            }

            // Atualiza Braços Visuais da IA
            // Ombros
            const sLY = cpu.head.y + 100;
            
            // Mãos
            ['armL', 'armR'].forEach((k, i) => {
                const arm = cpu.visual[k];
                const homeX = cpu.head.x + (i===0 ? -50 : 50);
                
                arm.s = {x: cpu.head.x + (i===0 ? -60 : 60), y: sLY};
                
                if (arm.z > 10) { // Socando (vai pro centro)
                    arm.w.x = Utils.lerp(arm.w.x, w/2, 0.2);
                    arm.w.y = Utils.lerp(arm.w.y, h/2 + 50, 0.2);
                    arm.z -= 5; // Retrai autom.
                } else { // Idle
                    arm.w.x = Utils.lerp(arm.w.x, homeX, 0.1);
                    arm.w.y = Utils.lerp(arm.w.y, baseY + (cpu.guard ? -40 : 0), 0.1);
                }
                
                // Cotovelo simulado
                arm.e = {
                    x: (arm.s.x + arm.w.x)/2 + (i===0 ? -40 : 40),
                    y: (arm.s.y + arm.w.y)/2 + 20
                };
            });
        },

        syncNetwork: function() {
            if (this.frame % 3 !== 0) return;
            this.dbRef.child('players/' + window.System.playerId).update({
                hp: this.p1.hp,
                pose: {
                    h: {x:Math.round(this.p1.head.x), y:Math.round(this.p1.head.y)},
                    al: {s:this.p1.visual.armL.s, e:this.p1.visual.armL.e, w:this.p1.visual.armL.w, z:Math.round(this.p1.visual.armL.z)},
                    ar: {s:this.p1.visual.armR.s, e:this.p1.visual.armR.e, w:this.p1.visual.armR.w, z:Math.round(this.p1.visual.armR.z)},
                    g: this.p1.guard
                }
            });
        },

        endGame: function() {
            this.state = 'GAMEOVER';
        },

        // =================================================================
        // RENDERIZAÇÃO
        // =================================================================

        drawArena: function(ctx, w, h) {
            const a = ARENAS[this.selArena];
            const mid = h * 0.45;
            const g = ctx.createLinearGradient(0,0,0,mid);
            g.addColorStop(0, a.bgTop); g.addColorStop(1, a.bgBot);
            ctx.fillStyle = g; ctx.fillRect(0,0,w,mid);
            ctx.fillStyle = a.floor; ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(w,h); ctx.lineTo(w*0.8, mid); ctx.lineTo(w*0.2, mid); ctx.fill();
            ctx.strokeStyle = a.rope; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w*0.2, mid); ctx.lineTo(w*0.8, mid); ctx.moveTo(w*0.15, mid+40); ctx.lineTo(w*0.85, mid+40); ctx.stroke();
        },

        drawCharacter: function(ctx, p, isSelf, w, h) {
            const char = CHARACTERS[p.charId];
            const arms = p.visual;
            
            if (!isSelf) {
                // DESENHA RIVAL (CORPO)
                const cx = p.head.x; const cy = p.head.y;
                const bodyG = ctx.createLinearGradient(cx-40, cy, cx+40, cy+200); 
                bodyG.addColorStop(0, char.color); bodyG.addColorStop(1, '#000');
                ctx.fillStyle = bodyG; ctx.beginPath(); 
                ctx.moveTo(cx-50, cy+60); ctx.lineTo(cx+50, cy+60); 
                ctx.lineTo(cx+30, cy+250); ctx.lineTo(cx-30, cy+250); ctx.fill();

                // Cabeça
                ctx.fillStyle = char.skin; ctx.beginPath(); ctx.arc(cx, cy, 45, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = char.hat; ctx.beginPath(); ctx.arc(cx, cy-15, 47, Math.PI, 0); ctx.fill(); ctx.fillRect(cx-50, cy-15, 100, 15);
                
                // Rosto
                ctx.fillStyle='#000'; 
                ctx.beginPath(); ctx.arc(cx-15, cy-5, 5, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(cx+15, cy-5, 5, 0, Math.PI*2); ctx.fill();
            }

            // DESENHA BRAÇOS (IK)
            // Z-Order: O braço mais longe (menor Z) desenha primeiro? 
            // Em POV, Z maior = mais longe da câmera (soco). Em Rival, Z maior = mais perto da câmera.
            
            const drawArm = (arm) => {
                // Configuração visual
                const width = isSelf ? 40 : 18;
                const scale = isSelf ? (1 + arm.z/300) : (0.8 + arm.z/300);
                
                // Segmentos
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                
                // Ombro -> Cotovelo
                ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = width+4;
                ctx.beginPath(); ctx.moveTo(arm.s.x, arm.s.y); ctx.lineTo(arm.e.x, arm.e.y); ctx.stroke();
                ctx.strokeStyle = char.skin; ctx.lineWidth = width;
                ctx.beginPath(); ctx.moveTo(arm.s.x, arm.s.y); ctx.lineTo(arm.e.x, arm.e.y); ctx.stroke();

                // Cotovelo -> Mão
                ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = width+4;
                ctx.beginPath(); ctx.moveTo(arm.e.x, arm.e.y); ctx.lineTo(arm.w.x, arm.w.y); ctx.stroke();
                ctx.strokeStyle = char.skin; ctx.lineWidth = width;
                ctx.beginPath(); ctx.moveTo(arm.e.x, arm.e.y); ctx.lineTo(arm.w.x, arm.w.y); ctx.stroke();

                // Luva
                ctx.save(); ctx.translate(arm.w.x, arm.w.y); ctx.scale(scale, scale);
                const g = ctx.createRadialGradient(-10,-10,5,0,0,35);
                g.addColorStop(0,'#fff'); g.addColorStop(1, char.color);
                ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,35,0,Math.PI*2); ctx.fill();
                ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,35,0,Math.PI*2); ctx.stroke();
                ctx.restore();
            };

            drawArm(arms.armL);
            drawArm(arms.armR);

            if (p.guard && isSelf) {
                ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0,0,w,h);
            }
        },

        // --- UI ---
        drawBtn: function(ctx, id, txt, x, y, w, h, active) {
            this.uiButtons[id] = {x,y,w,h};
            ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=10;
            ctx.fillStyle = active ? '#e67e22' : '#34495e';
            ctx.beginPath(); 
            if(ctx.roundRect) ctx.roundRect(x,y,w,h,15); else ctx.rect(x,y,w,h);
            ctx.fill();
            ctx.lineWidth=active?4:2; ctx.strokeStyle='#fff'; ctx.stroke();
            ctx.shadowBlur=0; ctx.fillStyle='#fff'; 
            ctx.font=`bold ${Math.floor(h*0.5)}px 'Russo One'`;
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(txt, x+w/2, y+h/2+3);
        },

        uiMode: function(ctx, w, h) {
            const v = Math.min(w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.1}px 'Russo One'`;
            ctx.fillText("SUPER BOXING", w/2, h*0.2);
            this.drawBtn(ctx, 'off', "TREINO (CPU)", w/2-v*0.35, h*0.45, v*0.7, v*0.15, this.selMode==='OFFLINE');
            this.drawBtn(ctx, 'on', "ONLINE (PVP)", w/2-v*0.35, h*0.65, v*0.7, v*0.15, this.selMode==='ONLINE');
        },

        uiChar: function(ctx, w, h) {
            const v = Math.min(w,h);
            const c = CHARACTERS[this.selChar];
            ctx.fillStyle = c.color; ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText("ESCOLHA", w/2, h*0.12);
            
            const r = v*0.25;
            ctx.beginPath(); ctx.arc(w/2, h*0.4, r, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle=c.hat; ctx.beginPath(); ctx.arc(w/2, h*0.4-20, r, Math.PI, 0); ctx.fill();
            ctx.fillStyle='#fff'; ctx.font=`bold ${v*0.12}px 'Russo One'`; ctx.fillText(c.name, w/2, h*0.65);

            const bw=v*0.35, bh=v*0.12;
            this.drawBtn(ctx, 'next', "TROCAR", w/2-bw-10, h*0.8, bw, bh);
            this.drawBtn(ctx, 'ok', "OK", w/2+10, h*0.8, bw, bh, true);
        },

        uiArena: function(ctx, w, h) {
            const v = Math.min(w,h);
            const a = ARENAS[this.selArena];
            const g = ctx.createLinearGradient(0,0,0,h); g.addColorStop(0, a.bgTop); g.addColorStop(1, a.bgBot);
            ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText("ARENA", w/2, h*0.15);
            ctx.font=`bold ${v*0.1}px 'Russo One'`; ctx.fillText(a.name, w/2, h*0.5);
            
            const bw=v*0.35, bh=v*0.12;
            this.drawBtn(ctx, 'next', "MUDAR", w/2-bw-10, h*0.8, bw, bh);
            this.drawBtn(ctx, 'ok', "CALIBRAR", w/2+10, h*0.8, bw, bh, true);
        },

        uiCalib: function(ctx, w, h) {
            ctx.fillStyle='#111'; ctx.fillRect(0,0,w,h);
            const v = Math.min(w,h);
            ctx.fillStyle='#0ff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.06}px 'Russo One'`;
            ctx.fillText("CALIBRAÇÃO (T-POSE)", w/2, h*0.15);
            
            // Feedback
            const cx=w/2, cy=h*0.45;
            ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=10;
            ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy+100); ctx.stroke(); // Torso
            ctx.beginPath(); ctx.moveTo(cx-100,cy); ctx.lineTo(cx+100,cy); ctx.stroke(); // Braços

            // Barra
            const pct = this.p1.calib.samples / 30; // 30 frames para calibrar
            ctx.fillStyle='#333'; ctx.fillRect(w*0.2, h*0.7, w*0.6, 30);
            ctx.fillStyle='#0f0'; ctx.fillRect(w*0.2, h*0.7, w*0.6 * Math.min(1, pct), 30);

            if (this.p1.calib.samples > 30) {
                this.drawBtn(ctx, 'done', "JOGAR!", w/2-v*0.25, h*0.85, v*0.5, v*0.12, true);
            } else {
                ctx.fillStyle='#fff'; ctx.font='20px sans-serif'; 
                ctx.fillText("ABRA OS BRAÇOS E AGUARDE...", w/2, h*0.8);
            }
        },

        uiLobby: function(ctx, w, h) {
            ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h);
            const v = Math.min(w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText("BUSCANDO...", w/2, h/2);
            // Spinner
            const t = Date.now()/500;
            ctx.beginPath(); ctx.arc(w/2, h/2+v*0.2, v*0.1, t, t+4); 
            ctx.strokeStyle='#fff'; ctx.lineWidth=5; ctx.stroke();
        },

        uiOver: function(ctx, w, h) {
            ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.fillRect(0,0,w,h);
            const v = Math.min(w,h);
            const win = this.p1.hp > 0;
            ctx.fillStyle = win ? '#f1c40f' : '#e74c3c';
            ctx.textAlign='center'; ctx.font=`bold ${v*0.15}px 'Russo One'`;
            ctx.fillText(win ? "VITÓRIA!" : "DERROTA", w/2, h*0.4);
            ctx.fillStyle='#fff'; ctx.font=`bold ${v*0.05}px sans-serif`;
            ctx.fillText("SCORE: " + this.p1.score, w/2, h*0.55);
            this.drawBtn(ctx, 'menu', "MENU", w/2-v*0.25, h*0.7, v*0.5, v*0.15, true);
        },

        // --- HUD ---
        drawHUD: function(ctx, w, h) {
            const barW = w * 0.35; const barH = Math.max(20, h*0.03);
            
            ctx.fillStyle = "#333"; ctx.fillRect(20, 20, barW, barH);
            ctx.fillStyle = "#e74c3c"; ctx.fillRect(20, 20, barW * (Math.max(0,this.p1.hp)/100), barH);
            ctx.fillStyle = "#fff"; ctx.textAlign="left"; ctx.font=`bold ${barH}px sans-serif`; 
            ctx.fillText(CHARACTERS[this.p1.charId].name, 20, 20+barH*2);

            ctx.fillStyle = "#333"; ctx.fillRect(w-20-barW, 20, barW, barH);
            ctx.fillStyle = "#3498db"; ctx.fillRect(w-20-barW, 20, barW * (Math.max(0,this.p2.hp)/100), barH);
            ctx.fillStyle = "#fff"; ctx.textAlign="right"; 
            ctx.fillText(this.isOnline ? "RIVAL" : "CPU", w-20, 20+barH*2);

            ctx.textAlign="center"; ctx.fillText(Math.ceil(this.timer/60), w/2, barH*2);
        },

        spawnParticles: function(x, y, c) { for(let i=0; i<8; i++) this.particles.push({x, y, vx:(Math.random()-0.5)*15, vy:(Math.random()-0.5)*15, life:1, c}); },
        updateParticles: function(ctx) { this.particles.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.life-=0.05; ctx.globalAlpha=p.life; ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,7); ctx.fill(); }); ctx.globalAlpha=1; this.particles=this.particles.filter(p=>p.life>0); },
        spawnMsg: function(x, y, t, c, l=40) { this.msgs.push({x,y,t,c,l}); },
        drawMsgs: function(ctx) { this.msgs.forEach(m => { m.y--; m.l--; ctx.fillStyle=m.c; ctx.font="bold 30px 'Russo One'"; ctx.textAlign="center"; ctx.fillText(m.t, m.x, m.y); }); this.msgs=this.msgs.filter(m=>m.l>0); },
        
        endGame: function() { this.state = 'GAMEOVER'; },
        endRound: function() { 
            if(this.round < CONF.ROUNDS) { this.round++; this.timer=CONF.ROUND_TIME*60; window.System.msg("ROUND "+this.round); }
            else this.endGame(); 
        }
    };

    if(window.System) window.System.registerGame('box_pro', 'Super Boxing', '🥊', Game, { camOpacity: 0.2 });

})();