// =============================================================================
// SUPER BOXING STADIUM: CHAMPIONSHIP EDITION (GOLD MASTER V9 - CAMERA FIX)
// ARQUITETO: SENIOR DEV - DYNAMIC RESOLUTION, IK & NETCODE
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
        VELOCITY_THRESH: 5,   // Sensibilidade para detectar intenção de soco
        BLOCK_DIST: 140,      // Distância para considerar defesa
        SMOOTHING: 0.8,       // Suavização do movimento
        MIN_CONFIDENCE: 0.2,  // Filtro de ruído da câmera
        REACH_SCALE: 2.5      // Multiplicador visual de profundidade
    };

    // --- MATH UTILS ---
    const Utils = {
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
        lerp: (a, b, t) => a + (b - a) * t,
        lerpPoint: (p1, p2, t) => ({ x: Utils.lerp(p1.x, p2.x, t), y: Utils.lerp(p1.y, p2.y, t) }),
        
        // CORREÇÃO CRÍTICA DA CÂMERA: Adaptação à resolução real do vídeo
        toScreen: (kp, w, h) => {
            const vid = window.System ? window.System.video : null;
            // Se o vídeo não estiver pronto, usa 640x480 como fallback seguro
            const vw = (vid && vid.videoWidth > 0) ? vid.videoWidth : 640;
            const vh = (vid && vid.videoHeight > 0) ? vid.videoHeight : 480;
            
            return { 
                x: (1 - kp.x / vw) * w, // Espelhado horizontalmente
                y: (kp.y / vh) * h 
            };
        },
        
        // Verifica toque em botão (UI)
        isInside: (x, y, btn) => {
            const pad = 30; // Hitbox generosa para mobile
            return x >= btn.x - pad && x <= btn.x + btn.w + pad && 
                   y >= btn.y - pad && y <= btn.y + btn.h + pad;
        },

        // SOLVER DE CINEMÁTICA INVERSA (IK)
        solveIK: (shoulder, target, lenUpper, lenFore) => {
            const dist = Utils.dist(shoulder, target);
            const totalLen = lenUpper + lenFore;
            
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

            const angShoulder = Math.atan2(target.y - shoulder.y, target.x - shoulder.x);
            const cosAngle = (dist * dist + lenUpper * lenUpper - lenFore * lenFore) / (2 * dist * lenUpper);
            const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
            const sideFactor = (target.x < shoulder.x) ? 1 : -1; 
            
            // Estimativa estável para o cotovelo
            return {
                elbow: { 
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

        // Estado da Partida
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

        // --- OPONENTE (P2 - IA ou NETWORK) ---
        p2: { 
            hp: 100, maxHp: 100, id: null, isRemote: false, charId: 0,
            head: {x:0, y:0},
            visual: {
                armL: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 },
                armR: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 }
            },
            guard: false,
            ai: { timer: 0, state: 'IDLE' }
        },

        particles: [],
        msgs: [],

        // =================================================================
        // CICLO DE VIDA E INPUT
        // =================================================================

        init: function() {
            this.state = 'MODE_SELECT';
            this.cleanup();
            if(window.System.msg) window.System.msg("BOXE SIMULATOR V9");
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
            window.Sfx.click();
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
                
                // Inicializa IA no centro
                this.p2.head = {x: w/2, y: h/3};
                this.p2.visual.armL = { s:{x:w/2-60, y:h/3+100}, e:{x:w/2-80, y:h/3+150}, w:{x:w/2-50, y:h/3+80}, z:0 };
                this.p2.visual.armR = { s:{x:w/2+60, y:h/3+100}, e:{x:w/2+80, y:h/3+150}, w:{x:w/2+50, y:h/3+80}, z:0 };

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
                charId: this.selChar, hp: 100, 
                lastSeen: firebase.database.ServerValue.TIMESTAMP 
            });
            myRef.onDisconnect().remove();

            // Ouve a sala
            this.dbRef.child('players').on('value', snap => {
                const players = snap.val();
                if (!players) return;

                // Acha o ID do oponente
                const opId = Object.keys(players).find(id => id !== window.System.playerId);

                if (opId) {
                    const p2Data = players[opId];
                    if (this.state === 'LOBBY') {
                        // Encontrou! Começa a luta imediatamente
                        this.p2.id = opId;
                        this.p2.charId = p2Data.charId || 0;
                        this.p2.hp = 100;
                        this.p2.isRemote = true;
                        this.state = 'FIGHT';
                        window.System.msg("VS " + CHARACTERS[this.p2.charId].name);
                    }
                    if (this.state === 'FIGHT') {
                        // Sync
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

            // 1. INPUT TRACKING (Essencial)
            this.processSkeleton(w, h, pose);

            // 2. BACKGROUND (Menus)
            if (this.state !== 'FIGHT') {
                const g = ctx.createLinearGradient(0,0,0,h);
                g.addColorStop(0, '#1a1a2e'); g.addColorStop(1, '#16213e');
                ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
            }

            // 3. MÁQUINA DE ESTADOS
            if (this.state === 'MODE_SELECT') { this.uiMode(ctx, w, h); return; }
            if (this.state === 'CHAR_SELECT') { this.uiChar(ctx, w, h); return; }
            if (this.state === 'ARENA_SELECT') { this.uiArena(ctx, w, h); return; }
            if (this.state === 'CALIBRATE') { this.uiCalib(ctx, w, h, pose); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiOver(ctx, w, h); return; }

            // === LUTA ===
            this.drawArena(ctx, w, h);

            if (this.isOnline) this.syncNetwork();
            else this.updateAI(w, h);

            // Desenha personagens
            this.drawCharacter(ctx, this.p2, false, w, h); // Rival (Fundo)
            this.drawCharacter(ctx, this.p1, true, w, h);  // Jogador (Frente)

            // Lógica
            if (this.timer > 0) this.timer--; else this.endGame();
            if (this.p1.hp <= 0 || this.p2.hp <= 0) this.endGame();

            this.drawHUD(ctx, w, h);
            this.updateParticles(ctx);
            this.drawMsgs(ctx);

            return Math.floor(this.p1.score);
        },

        // =================================================================
        // FÍSICA E ESQUELETO (RAW INPUT 1:1)
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
            const ls = getP(5, {x:w*0.3, y:h*0.8});
            const rs = getP(6, {x:w*0.7, y:h*0.8});
            const le = getP(7, null); // Se null, calculamos via IK
            const re = getP(8, null);
            const lw = getP(9, this.p1.raw.lw);
            const rw = getP(10, this.p1.raw.rw);

            // CALIBRAÇÃO (Visualização e Medição)
            if (this.p1.calib.active) {
                // Desenha pontos para feedback visual
                this.p1.head = nose; 
                // Se detectou pulsos, mede
                if (k[9] && k[10]) {
                    const span = Utils.dist(lw, rw);
                    if (span > this.p1.calib.maxReach) this.p1.calib.maxReach = span / 2;
                    if (span > 100) this.p1.calib.progress = Math.min(100, this.p1.calib.progress + 2);
                }
                return;
            }

            // SUAVIZAÇÃO DOS DADOS BRUTOS
            this.p1.head = Utils.lerpPoint(this.p1.head, nose, smooth);
            this.p1.raw.ls = Utils.lerpPoint(this.p1.raw.ls, ls, smooth);
            this.p1.raw.rs = Utils.lerpPoint(this.p1.raw.rs, rs, smooth);
            // Punhos mais rápidos
            this.p1.raw.lw = Utils.lerpPoint(this.p1.raw.lw, lw, 0.5); 
            this.p1.raw.rw = Utils.lerpPoint(this.p1.raw.rw, rw, 0.5);

            // PROCESSA BRAÇOS (VISUAL + FÍSICA)
            // Lado Esquerdo
            this.processArm('armL', this.p1.raw.ls, le, this.p1.raw.lw, 'left', w, h);
            // Lado Direito
            this.processArm('armR', this.p1.raw.rs, re, this.p1.raw.rw, 'right', w, h);

            // GUARDA
            const dL = Utils.dist(this.p1.visual.armL.w, this.p1.head);
            const dR = Utils.dist(this.p1.visual.armR.w, this.p1.head);
            const guardDist = this.p1.calib.maxReach * 0.7; 
            this.p1.guard = (dL < guardDist && dR < guardDist);

            if(this.p1.stamina < 100) this.p1.stamina += 0.3;
        },

        processArm: function(armKey, sRaw, eRaw, wRaw, side, screenW, screenH) {
            const visual = this.p1.visual[armKey];
            
            // 1. OMBRO VIRTUAL (Base fixa embaixo da tela para POV)
            const baseX = (side === 'left') ? screenW * 0.1 : screenW * 0.9;
            // Move X levemente com a cabeça para dar parallax
            visual.s.x = Utils.lerp(baseX, screenW/2, (this.p1.head.x / screenW - 0.5) * 0.5);
            visual.s.y = screenH + 80; // Fora da tela

            // 2. PUNHO (Segue 1:1 o raw)
            // Velocidade (Delta)
            const speed = Utils.dist(visual.w, wRaw);
            visual.w.x = wRaw.x;
            visual.w.y = wRaw.y;

            // 3. COTOVELO (Híbrido)
            if (eRaw) {
                // Se câmera viu, usa real (suavizado)
                visual.e = Utils.lerpPoint(visual.e, eRaw, CONF.SMOOTHING);
            } else {
                // Se não, usa IK para "dobrar" o braço naturalmente
                const ik = Utils.solveIK(visual.s, visual.w, this.p1.calib.upperLen, this.p1.calib.foreLen).elbow;
                visual.e = Utils.lerpPoint(visual.e, ik, 0.1);
            }

            // 4. Z-DEPTH (Extensão)
            // Distância visual na tela entre ombro real e punho real
            const dist2D = Utils.dist(sRaw, wRaw);
            const extRatio = Math.min(1.5, dist2D / this.p1.calib.maxReach);
            
            // Mapeia para Z (Soco = mão longe do ombro)
            const targetZ = Math.max(0, (extRatio - 0.4) * 250);
            visual.z = Utils.lerp(visual.z, targetZ, 0.3);

            // 5. COLISÃO
            // Se velocidade alta E mão esticada
            if (speed > CONF.VELOCITY_THRESH && visual.z > 60 && this.p1.stamina > 5) {
                // Soco!
                this.checkHit(visual.w, speed);
            }
        },

        checkHit: function(handPos, speed) {
            const rX = this.p2.head.x;
            const rY = this.p2.head.y;
            
            if (Utils.dist(handPos, {x:rX, y:rY}) < 120) {
                if (this.p2.guard) {
                    this.spawnMsg(rX, rY, "BLOCKED", "#aaa");
                    window.Sfx.play(150, 'square', 0.1);
                } else {
                    const dmg = Math.floor(5 + speed * 0.3);
                    this.p2.hp -= dmg;
                    this.p1.score += dmg * 10;
                    this.p1.stamina -= 8;
                    this.spawnParticles(rX, rY, '#f00');
                    this.spawnMsg(rX, rY, dmg, "#ff0");
                    window.Sfx.hit();
                    window.Gfx.shakeScreen(10);
                    if (this.isOnline) this.dbRef.child('players/'+this.p2.id).update({hp: this.p2.hp});
                }
            }
        },

        // --- IA SIMPLES ---
        updateAI: function(w, h) {
            const cpu = this.p2;
            const t = this.frame * 0.05;
            
            cpu.head.x = Utils.lerp(cpu.head.x, w/2 + Math.sin(t)*120, 0.05);
            cpu.head.y = h/3 + Math.cos(t*0.5)*20;
            
            const baseY = cpu.head.y + 80;
            cpu.visual.armL.s = {x: cpu.head.x-60, y: baseY};
            cpu.visual.armR.s = {x: cpu.head.x+60, y: baseY};

            // Ataque
            if (cpu.ai.timer-- <= 0) {
                const r = Math.random();
                if (r < 0.03) { // Soco
                    const side = Math.random()>0.5 ? 'armL' : 'armR';
                    cpu.visual[side].z = 150; // Estica
                    cpu.visual[side].w = {x: w/2, y: h/2+100}; // Mira
                    cpu.ai.timer = 50;
                    
                    if (!this.p1.guard) {
                        this.p1.hp -= 5;
                        window.Gfx.shakeScreen(5);
                        this.spawnMsg(w/2, h/2, "OUCH", "#f00");
                    } else window.Sfx.play(100, 'sine', 0.1);

                } else if (r < 0.05) { // Guarda
                    cpu.guard = !cpu.guard;
                    cpu.ai.timer = 60;
                } else { // Idle
                    cpu.visual.armL.z = 0;
                    cpu.visual.armR.z = 0;
                }
            }

            // Animação Mãos Idle
            ['armL', 'armR'].forEach((k, i) => {
                const arm = cpu.visual[k];
                if (arm.z < 10) {
                    arm.w.x = Utils.lerp(arm.w.x, cpu.head.x + (i===0?-50:50), 0.1);
                    arm.w.y = Utils.lerp(arm.w.y, baseY + (cpu.guard?-40:40), 0.1);
                } else {
                    arm.z -= 5; // Retrai soco
                }
                // IK Cotovelo IA
                const ik = Utils.solveIK(arm.s, arm.w, 60, 60);
                arm.e = ik.elbow;
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

        endGame: function() { this.state = 'GAMEOVER'; },

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

            if (!isSelf) { // RIVAL
                const cx = p.head.x; const cy = p.head.y;
                const bg = ctx.createLinearGradient(cx-40,cy,cx+40,cy+200); 
                bg.addColorStop(0, char.color); bg.addColorStop(1, '#000');
                ctx.fillStyle=bg; ctx.beginPath(); ctx.moveTo(cx-50,cy+60); ctx.lineTo(cx+50,cy+60); ctx.lineTo(cx+30,cy+250); ctx.lineTo(cx-30,cy+250); ctx.fill();
                
                // Desenha Braços (Trás)
                this.drawArm(ctx, arms.armL, char.skin, 18, 0.8);
                this.drawArm(ctx, arms.armR, char.skin, 18, 0.8);

                ctx.fillStyle=char.skin; ctx.beginPath(); ctx.arc(cx,cy,45,0,7); ctx.fill();
                ctx.fillStyle=char.hat; ctx.beginPath(); ctx.arc(cx,cy-15,47,Math.PI,0); ctx.fill(); ctx.fillRect(cx-50,cy-15,100,15);
                ctx.fillStyle='#000'; ctx.font="20px Arial"; ctx.textAlign='center'; ctx.fillText(char.name[0], cx, cy-28);
                
                // Luvas
                this.drawGlove(ctx, arms.armL.w, char.color, 0.8 + arms.armL.z/300);
                this.drawGlove(ctx, arms.armR.w, char.color, 0.8 + arms.armR.z/300);

            } else { // PLAYER
                // Braços (POV)
                this.drawArm(ctx, arms.armL, char.skin, 40, 1.0);
                this.drawArm(ctx, arms.armR, char.skin, 40, 1.0);
                
                // Luvas (Maiores)
                this.drawGlove(ctx, arms.armL.w, char.color, 1.2 + arms.armL.z/300);
                this.drawGlove(ctx, arms.armR.w, char.color, 1.2 + arms.armR.z/300);
            }

            if(p.guard && isSelf) { ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.fillRect(0,0,w,h); }
        },

        drawArm: function(ctx, arm, color, width, s) {
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            // Contorno
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = width+4;
            ctx.beginPath(); ctx.moveTo(arm.s.x, arm.s.y); ctx.lineTo(arm.e.x, arm.e.y); ctx.lineTo(arm.w.x, arm.w.y); ctx.stroke();
            // Pele
            ctx.strokeStyle = color; ctx.lineWidth = width;
            ctx.beginPath(); ctx.moveTo(arm.s.x, arm.s.y); ctx.lineTo(arm.e.x, arm.e.y); ctx.lineTo(arm.w.x, arm.w.y); ctx.stroke();
        },

        drawGlove: function(ctx, pos, color, s) {
            ctx.save(); ctx.translate(pos.x, pos.y); ctx.scale(s, s);
            const g = ctx.createRadialGradient(-10,-10,5,0,0,35); g.addColorStop(0,'#fff'); g.addColorStop(1,color);
            ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,35,0,7); ctx.fill();
            ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=3; ctx.stroke();
            ctx.restore();
        },

        // --- UI ---
        drawBtn: function(ctx, id, txt, x, y, w, h, active) {
            this.uiButtons[id] = {x,y,w,h};
            ctx.shadowBlur=10; ctx.shadowColor='rgba(0,0,0,0.5)';
            ctx.fillStyle = active ? '#e67e22' : '#34495e';
            ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x,y,w,h,20); else ctx.rect(x,y,w,h); ctx.fill();
            ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.stroke();
            ctx.shadowBlur=0; ctx.fillStyle='#fff'; 
            ctx.font=`bold ${h*0.4}px 'Russo One'`; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(txt, x+w/2, y+h/2);
        },

        uiMode: function(ctx,w,h) {
            const v=Math.min(w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.1}px 'Russo One'`;
            ctx.fillText("SUPER BOXING", w/2, h*0.2);
            this.drawBtn(ctx, 'off', "OFFLINE", w/2-v*0.35, h*0.4, v*0.7, v*0.15);
            this.drawBtn(ctx, 'on', "ONLINE", w/2-v*0.35, h*0.6, v*0.7, v*0.15);
        },

        uiChar: function(ctx,w,h) {
            const v=Math.min(w,h); const c=CHARACTERS[this.selChar];
            ctx.fillStyle=c.color; ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText("ESCOLHA", w/2, h*0.15);
            ctx.beginPath(); ctx.arc(w/2, h*0.4, v*0.25, 0, 7); ctx.fillStyle=c.hat; ctx.fill();
            ctx.fillStyle='#fff'; ctx.fillText(c.name, w/2, h*0.7);
            const bw=v*0.35, bh=v*0.12;
            this.drawBtn(ctx, 'next', "TROCAR", w/2-bw-10, h*0.8, bw, bh);
            this.drawBtn(ctx, 'ok', "OK", w/2+10, h*0.8, bw, bh, true);
        },

        uiArena: function(ctx,w,h) {
            const v=Math.min(w,h); const a=ARENAS[this.selArena];
            const g = ctx.createLinearGradient(0,0,0,h); g.addColorStop(0, a.bgTop); g.addColorStop(1, a.bgBot);
            ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText("ARENA", w/2, h*0.2);
            ctx.font=`bold ${v*0.1}px 'Russo One'`; ctx.fillText(a.name, w/2, h*0.5);
            const bw=v*0.35, bh=v*0.12;
            this.drawBtn(ctx, 'next', "MUDAR", w/2-bw-10, h*0.8, bw, bh);
            this.drawBtn(ctx, 'ok', "CALIBRAR", w/2+10, h*0.8, bw, bh, true);
        },

        uiCalib: function(ctx,w,h,pose) {
            ctx.fillStyle='#111'; ctx.fillRect(0,0,w,h);
            const v=Math.min(w,h);
            ctx.fillStyle='#0ff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.06}px 'Russo One'`;
            ctx.fillText("CALIBRAÇÃO", w/2, h*0.15);
            ctx.fillStyle='#fff'; ctx.font=`${v*0.04}px sans-serif`;
            ctx.fillText("FAÇA A POSE DE 'T'", w/2, h*0.25);
            
            // Feedback Visual de Rastreamento (CRÍTICO)
            if(pose && pose.keypoints) {
                const k = pose.keypoints;
                const drawP = (i,c) => {
                    if(k[i] && k[i].score > CONF.MIN_CONFIDENCE) {
                        const p = Utils.toScreen(k[i], w, h);
                        ctx.fillStyle=c; ctx.beginPath(); ctx.arc(p.x,p.y,15,0,7); ctx.fill();
                    }
                };
                drawP(5,'#0f0'); drawP(6,'#0f0'); drawP(9,'#0ff'); drawP(10,'#0ff');
                
                const l=k[9], r=k[10];
                if(l && r && l.score > 0.2 && r.score > 0.2) {
                     const span = Math.abs(l.x - r.x);
                     if (span > 50) this.p1.calib.progress = Math.min(100, this.p1.calib.progress+2);
                }
            }

            const pct = this.p1.calib.progress / 100; 
            ctx.fillStyle='#333'; ctx.fillRect(w*0.2, h*0.7, w*0.6, 30);
            ctx.fillStyle='#0f0'; ctx.fillRect(w*0.2, h*0.7, w*0.6*pct, 30);

            if(this.p1.calib.progress > 20) {
                this.drawBtn(ctx, 'done', "JOGAR AGORA!", w/2-v*0.3, h*0.7, v*0.6, v*0.15, true);
            }
        },

        uiLobby: function(ctx,w,h) {
            const v=Math.min(w,h);
            ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText("BUSCANDO...", w/2, h/2);
        },

        uiOver: function(ctx,w,h) {
            ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.fillRect(0,0,w,h);
            const v=Math.min(w,h);
            const win = this.p1.hp > 0;
            ctx.fillStyle=win?'#f1c40f':'#e74c3c';
            ctx.textAlign='center'; ctx.font=`bold ${v*0.15}px 'Russo One'`;
            ctx.fillText(win?"VITÓRIA!":"DERROTA", w/2, h*0.4);
            ctx.fillStyle='#fff'; ctx.font=`bold ${v*0.05}px sans-serif`;
            ctx.fillText("SCORE: "+this.p1.score, w/2, h*0.55);
            this.drawBtn(ctx, 'menu', "MENU", w/2-v*0.25, h*0.7, v*0.5, v*0.15, true);
        },

        drawHUD: function(ctx, w, h) {
            const bw = w*0.35;
            ctx.fillStyle='#333'; ctx.fillRect(20,20,bw,30);
            ctx.fillStyle='#e74c3c'; ctx.fillRect(20,20,bw*(this.p1.hp/100),30);
            ctx.fillStyle='#fff'; ctx.textAlign='left'; ctx.font='20px Arial'; ctx.fillText("P1", 25,42);
            
            ctx.fillStyle='#333'; ctx.fillRect(w-20-bw,20,bw,30);
            ctx.fillStyle='#3498db'; ctx.fillRect(w-20-bw,20,bw*(this.p2.hp/100),30);
            
            ctx.textAlign='center'; ctx.fillText(Math.ceil(this.timer/60), w/2, 40);
        },

        spawnParticles: function(x,y,c) { for(let i=0;i<5;i++) this.particles.push({x,y,c,l:1}); },
        updateParticles: function(ctx) { this.particles.forEach(p=>{ p.l-=0.05; ctx.globalAlpha=p.l; ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,7); ctx.fill(); }); ctx.globalAlpha=1; },
        spawnMsg: function(x,y,t,c) { this.msgs.push({x,y,t,c,l:40}); },
        drawMsgs: function(ctx) { this.msgs.forEach(m=>{ m.y--; m.l--; ctx.fillStyle=m.c; ctx.font="30px 'Russo One'"; ctx.fillText(m.t,m.x,m.y); }); this.msgs=this.msgs.filter(m=>m.l>0); },
        endGame: function() { this.state='GAMEOVER'; }
    };

    if(window.System) window.System.registerGame('box_pro', 'Super Boxing', '🥊', Game, { camOpacity: 0.2 });

})();