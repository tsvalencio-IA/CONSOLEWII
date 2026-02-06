// =============================================================================
// SUPER BOXING STADIUM: SIMULATOR EDITION (V200)
// ARQUITETO: SENIOR DEV - FULL SKELETON TRACKING & PRECISION TRAINING
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS, CONFIGURAÇÕES E ESTILOS
    // -----------------------------------------------------------------

    const CHARACTERS = [
        { id: 0, name: 'MARIO',   color: '#e74c3c', skin: '#ffccaa', hat: '#d32f2f', power: 1.0, speed: 1.0 },
        { id: 1, name: 'LUIGI',   color: '#2ecc71', skin: '#ffccaa', hat: '#27ae60', power: 0.9, speed: 1.1 },
        { id: 2, name: 'PEACH',   color: '#ff9ff3', skin: '#ffe0bd', hat: '#fd79a8', power: 0.8, speed: 1.3 },
        { id: 3, name: 'BOWSER',  color: '#f1c40f', skin: '#e67e22', hat: '#c0392b', power: 1.4, speed: 0.7 },
        { id: 4, name: 'WALUIGI', color: '#8e44ad', skin: '#ffccaa', hat: '#5e2d85', power: 1.1, speed: 0.9 }
    ];

    const ARENAS = [
        { id: 0, name: 'TRAINING GYM',   bgTop: '#34495e', bgBot: '#2c3e50', rope: '#95a5a6', floor: '#bdc3c7' },
        { id: 1, name: 'WORLD CIRCUIT',  bgTop: '#2980b9', bgBot: '#2c3e50', rope: '#e74c3c', floor: '#ecf0f1' },
        { id: 2, name: 'CHAMPION RING',  bgTop: '#8e44ad', bgBot: '#2c2c54', rope: '#f1c40f', floor: '#f5f6fa' }
    ];

    const CONF = {
        ROUNDS: 3,
        ROUND_TIME: 60,
        SMOOTHING: 0.75,      // Equilíbrio entre fidelidade e estabilidade
        VELOCITY_FACTOR: 1.5, // Multiplicador para calcular impacto
        TARGET_SIZE: 60,      // Tamanho dos alvos no modo treino
        CALIB_SAMPLES: 30     // Quadros necessários para calibrar
    };

    // --- UTILS ---
    const Utils = {
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
        lerp: (a, b, t) => a + (b - a) * t,
        lerpPoint: (p1, p2, t) => ({ x: Utils.lerp(p1.x, p2.x, t), y: Utils.lerp(p1.y, p2.y, t) }),
        
        // Mapeamento de Coordenadas (Webcam 640x480 -> Canvas WxH)
        toScreen: (kp, w, h) => ({ 
            x: (1 - kp.x / 640) * w, // Espelhado Horizontalmente
            y: (kp.y / 480) * h 
        }),
        
        isInside: (x, y, btn) => {
            const pad = 20;
            return x >= btn.x - pad && x <= btn.x + btn.w + pad && 
                   y >= btn.y - pad && y <= btn.y + btn.h + pad;
        }
    };

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO
    // -----------------------------------------------------------------

    const Game = {
        state: 'MODE_SELECT', // MODE_SELECT, CHAR_SELECT, ARENA_SELECT, CALIBRATE, LOBBY, FIGHT, GAMEOVER
        roomId: 'boxing_global_v2',
        isOnline: false,
        dbRef: null,
        uiButtons: {},

        // Seleções
        selMode: 'OFFLINE',
        selChar: 0,
        selArena: 0,

        // Estado da Partida
        timer: 0,
        round: 1,
        frame: 0,
        
        // --- JOGADOR LOCAL (P1) ---
        p1: { 
            hp: 100, maxHp: 100, score: 0, stamina: 100,
            head: {x:0, y:0},
            // Estrutura Completa do Braço (Ombro -> Cotovelo -> Punho)
            armL: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0, state:'IDLE', vel:0 },
            armR: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0, state:'IDLE', vel:0 },
            guard: false,
            // Dados de Calibração
            calib: { active: false, samples: 0, armLength: 150, zFactor: 1.0 }
        },

        // --- OPONENTE (P2) - IA ou ONLINE ---
        p2: { 
            hp: 100, maxHp: 100, id: null, isRemote: false, charId: 0,
            head: {x:0, y:0},
            armL: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 },
            armR: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 },
            guard: false,
            ai: { timer: 0, state: 'IDLE' }
        },

        // Objetivos (Modo Offline)
        targets: [], 
        particles: [],
        msgs: [],

        // =================================================================
        // CICLO DE VIDA
        // =================================================================

        init: function() {
            this.state = 'MODE_SELECT';
            this.cleanup();
            if(window.System.msg) window.System.msg("SUPER BOXING SIM");
            this.setupInput();
        },

        cleanup: function() {
            if (this.dbRef) try { this.dbRef.child('players/' + window.System.playerId).remove(); this.dbRef.off(); } catch(e){}
            window.System.canvas.onclick = null;
        },

        setupInput: function() {
            window.System.canvas.onclick = (e) => {
                const r = window.System.canvas.getBoundingClientRect();
                const x = e.clientX - r.left;
                const y = e.clientY - r.top;
                
                const btn = (id) => this.uiButtons[id] && Utils.isInside(x, y, this.uiButtons[id]);

                if (this.state === 'MODE_SELECT') {
                    if (btn('btnOff')) this.setMode('OFFLINE');
                    else if (btn('btnOn')) this.setMode('ONLINE');
                } else if (this.state === 'CHAR_SELECT') {
                    if (btn('btnNext')) { this.selChar = (this.selChar+1)%CHARACTERS.length; window.Sfx.play(600,'square',0.1); }
                    else if (btn('btnOk')) { this.state = 'ARENA_SELECT'; window.Sfx.click(); }
                } else if (this.state === 'ARENA_SELECT') {
                    if (btn('btnNext')) { this.selArena = (this.selArena+1)%ARENAS.length; window.Sfx.play(600,'square',0.1); }
                    else if (btn('btnOk')) this.startCalib();
                } else if (this.state === 'CALIBRATE') {
                    if (btn('btnDone') && this.p1.calib.samples >= CONF.CALIB_SAMPLES) this.finishCalib();
                } else if (this.state === 'GAMEOVER') {
                    if (btn('btnMenu')) this.init();
                }
            };
        },

        setMode: function(m) {
            if (m === 'ONLINE' && !window.DB) { window.System.msg("OFFLINE ONLY"); return; }
            this.selMode = m;
            this.isOnline = (m === 'ONLINE');
            this.state = 'CHAR_SELECT';
            window.Sfx.click();
        },

        startCalib: function() {
            this.state = 'CALIBRATE';
            this.p1.calib.samples = 0;
            this.p1.calib.active = true;
            window.System.msg("CALIBRANDO...");
        },

        finishCalib: function() {
            this.p1.calib.active = false;
            this.startGame();
        },

        startGame: function() {
            this.p1.score = 0;
            this.p1.hp = 100;
            this.round = 1;
            this.timer = CONF.ROUND_TIME * 60;
            this.targets = []; // Limpa alvos do modo offline

            if (this.isOnline) {
                this.connectLobby();
            } else {
                this.state = 'FIGHT';
                this.p2.hp = 0; // No offline não tem oponente vivo, são alvos
                window.System.msg("TARGET PRACTICE");
            }
        },

        connectLobby: function() {
            this.state = 'LOBBY';
            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            myRef.set({ charId: this.selChar, hp: 100, ready: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
            myRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', snap => {
                const players = snap.val();
                if (!players) return;
                const opId = Object.keys(players).find(id => id !== window.System.playerId);
                if (opId) {
                    if (this.state === 'LOBBY') {
                        this.p2.id = opId;
                        this.p2.isRemote = true;
                        this.p2.charId = players[opId].charId || 0;
                        this.state = 'FIGHT';
                        window.System.msg("LUTA!");
                    }
                    // Sync Loop
                    if (this.state === 'FIGHT' && players[opId].pose) {
                        const p = players[opId].pose;
                        this.p2.head = p.h;
                        this.p2.armL = p.al;
                        this.p2.armR = p.ar;
                        this.p2.guard = p.g;
                        this.p2.hp = players[opId].hp;
                    }
                } else if (this.state === 'FIGHT') {
                    this.state = 'GAMEOVER'; window.System.msg("OPONENTE SAIU");
                }
            });
        },

        // =================================================================
        // UPDATE LOOP
        // =================================================================

        update: function(ctx, w, h, pose) {
            this.frame++;
            this.uiButtons = {};

            // Renderizar Background Base
            const bgGrad = ctx.createLinearGradient(0,0,0,h);
            bgGrad.addColorStop(0, '#111'); bgGrad.addColorStop(1, '#223');
            ctx.fillStyle = bgGrad; ctx.fillRect(0,0,w,h);

            // Máquina de Estados UI
            if (this.state === 'MODE_SELECT') { this.uiMode(ctx, w, h); return; }
            if (this.state === 'CHAR_SELECT') { this.uiChar(ctx, w, h); return; }
            if (this.state === 'ARENA_SELECT') { this.uiArena(ctx, w, h); return; }
            if (this.state === 'CALIBRATE') { this.uiCalib(ctx, w, h, pose); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiOver(ctx, w, h); return; }

            // === GAMEPLAY ===
            this.processSkeleton(w, h, pose); // Core Physics

            if (this.isOnline) {
                this.syncNetwork();
                this.drawArena(ctx, w, h);
                this.drawRival(ctx, this.p2, w, h); // Desenha oponente remoto
                this.checkPvpCollisions(w, h);
            } else {
                this.updateTargets(w, h); // Modo Offline (Alvos)
                this.drawArena(ctx, w, h);
                this.drawTargets(ctx);
            }

            // O Jogador é sempre desenhado por cima (POV)
            this.drawPlayer(ctx, this.p1, w, h);
            
            // HUD e Efeitos
            this.drawHUD(ctx, w, h);
            this.updateParticles(ctx);
            this.drawMsgs(ctx);

            if (this.timer > 0) this.timer--; else this.endRound();
            if (this.isOnline && this.p1.hp <= 0) this.endGame(false);

            return Math.floor(this.p1.score);
        },

        // =================================================================
        // FÍSICA E RASTREAMENTO (SKELETON TRACKING)
        // =================================================================

        processSkeleton: function(w, h, pose) {
            if (!pose || !pose.keypoints) return;
            const k = pose.keypoints;
            const smooth = CONF.SMOOTHING;

            // Mapeamento de Pontos (MoveNet Indices)
            // 0:Nariz, 5:OmbroE, 6:OmbroD, 7:CotoveloE, 8:CotoveloD, 9:PunhoE, 10:PunhoD
            const getP = (i, def) => (k[i] && k[i].score > 0.3) ? Utils.toScreen(k[i], w, h) : def;

            const nose = getP(0, this.p1.head);
            
            // Braço Esquerdo
            const lSh = getP(5, {x: w*0.2, y: h});
            const lEl = getP(7, {x: w*0.1, y: h}); // Cotovelo Real
            const lWr = getP(9, this.p1.armL.w);

            // Braço Direito
            const rSh = getP(6, {x: w*0.8, y: h});
            const rEl = getP(8, {x: w*0.9, y: h}); // Cotovelo Real
            const rWr = getP(10, this.p1.armR.w);

            // Suavização (Lerp) para remover tremedeira
            this.p1.head = Utils.lerpPoint(this.p1.head, nose, smooth);
            
            // Atualiza Braço Esquerdo
            this.updateArm(this.p1.armL, lSh, lEl, lWr, smooth);
            // Atualiza Braço Direito
            this.updateArm(this.p1.armR, rSh, rEl, rWr, smooth);

            // Detecção de Guarda (Punhos próximos ao rosto)
            const dL = Utils.dist(this.p1.armL.w, this.p1.head);
            const dR = Utils.dist(this.p1.armR.w, this.p1.head);
            this.p1.guard = (dL < 120 && dR < 120);
        },

        updateArm: function(arm, s, e, w, smooth) {
            // Calcula velocidade do punho antes de atualizar posição
            const dX = w.x - arm.w.x;
            const dY = w.y - arm.w.y;
            const instVel = Math.hypot(dX, dY);

            // Atualiza posições com suavização
            arm.s = Utils.lerpPoint(arm.s, s, smooth);
            arm.e = Utils.lerpPoint(arm.e, e, smooth);
            arm.w = Utils.lerpPoint(arm.w, w, smooth);
            arm.vel = instVel;

            // Lógica de "Z-Depth" (Extensão) baseada na calibração
            // Se o braço estica (distancia Ombro->Punho aumenta), o Z aumenta
            const currentLen = Utils.dist(arm.s, arm.w);
            const extensionRatio = Math.min(1.2, currentLen / this.p1.calib.armLength); // 1.0 = braço esticado
            
            // Z é visual: 0 = perto do corpo, 100 = esticado na tela
            // Mapeamos a extensão real para o Z do jogo
            const targetZ = (extensionRatio > 0.6) ? (extensionRatio - 0.6) * 250 : 0;
            arm.z = Utils.lerp(arm.z, targetZ, 0.2);

            // Detecção de Soco (High Velocity + Extension)
            if (instVel > 15 && extensionRatio > 0.8) {
                arm.state = 'PUNCH';
            } else if (instVel < 5) {
                arm.state = 'IDLE';
            }
        },

        // =================================================================
        // LÓGICA OFFLINE (TARGET TRAINING)
        // =================================================================

        updateTargets: function(w, h) {
            // Spawner
            if (this.frame % 40 === 0 && this.targets.length < 3) {
                const padSize = CONF.TARGET_SIZE;
                this.targets.push({
                    x: padSize + Math.random() * (w - padSize*2),
                    y: h*0.2 + Math.random() * (h*0.5),
                    life: 100,
                    maxLife: 100,
                    id: Math.random()
                });
            }

            // Update & Collision
            this.targets.forEach((t, i) => {
                t.life--;
                
                // Checa colisão com as mãos do player
                ['armL', 'armR'].forEach(side => {
                    const hand = this.p1[side];
                    // Só acerta se tiver velocidade e extensão (soco real)
                    if (hand.vel > 5 && hand.z > 20) {
                        if (Utils.dist(hand.w, t) < CONF.TARGET_SIZE) {
                            // HIT!
                            const score = Math.floor(hand.vel * 10);
                            this.p1.score += score;
                            this.spawnMsg(t.x, t.y, `${score} pts!`, "#ff0");
                            this.spawnParticles(t.x, t.y, '#0f0');
                            window.Sfx.hit();
                            window.Gfx.shakeScreen(5);
                            t.life = 0; // Destroy
                        }
                    }
                });
            });

            this.targets = this.targets.filter(t => t.life > 0);
        },

        drawTargets: function(ctx) {
            this.targets.forEach(t => {
                const scale = t.life / t.maxLife;
                ctx.globalAlpha = scale;
                ctx.fillStyle = t.life < 30 ? '#e74c3c' : '#2ecc71';
                ctx.beginPath(); ctx.arc(t.x, t.y, CONF.TARGET_SIZE, 0, Math.PI*2); ctx.fill();
                
                // Anéis
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(t.x, t.y, CONF.TARGET_SIZE * 0.7, 0, Math.PI*2); ctx.stroke();
                
                ctx.fillStyle = '#fff'; ctx.font="bold 20px Arial"; ctx.textAlign="center";
                ctx.fillText("HIT!", t.x, t.y+5);
                ctx.globalAlpha = 1.0;
            });
        },

        // =================================================================
        // LÓGICA ONLINE (PVP)
        // =================================================================

        syncNetwork: function() {
            if (this.frame % 3 !== 0) return; // Throttling 20fps network
            
            // Envia esqueleto simplificado para o oponente
            const packet = {
                hp: this.p1.hp,
                pose: {
                    h: {x: Math.round(this.p1.head.x), y: Math.round(this.p1.head.y)},
                    al: { s:this.p1.armL.s, e:this.p1.armL.e, w:this.p1.armL.w, z:Math.round(this.p1.armL.z) },
                    ar: { s:this.p1.armR.s, e:this.p1.armR.e, w:this.p1.armR.w, z:Math.round(this.p1.armR.z) },
                    g: this.p1.guard
                }
            };
            this.dbRef.child('players/' + window.System.playerId).update(packet);
        },

        checkPvpCollisions: function(w, h) {
            // Checa se minhas mãos acertaram a cabeça do oponente remoto (renderizada localmente)
            // A posição da cabeça do oponente é invertida ou ajustada?
            // Assumimos que oponente está em espelho.
            
            const targetHead = this.p2.head; // Head do oponente (recebida via net)
            
            ['armL', 'armR'].forEach(side => {
                const hand = this.p1[side];
                if (hand.z > 50 && hand.vel > 8) { // Soco estendido e rápido
                    // Hitbox cabeça
                    if (Utils.dist(hand.w, targetHead) < 80) {
                        if (this.p2.guard) {
                            this.spawnMsg(targetHead.x, targetHead.y, "BLOCK", "#aaa");
                        } else {
                            const dmg = Math.floor(hand.vel * 0.5);
                            this.p2.hp -= dmg; // Apenas visual local, o oponente que deve confirmar? 
                            // Modelo Arcade: Atacante é autoridade. Enviamos dano.
                            this.dbRef.child('players/' + this.p2.id).update({hp: this.p2.hp});
                            this.spawnMsg(targetHead.x, targetHead.y, `HIT ${dmg}`, "#f00");
                            window.Sfx.hit();
                        }
                    }
                }
            });
        },

        // =================================================================
        // RENDERIZAÇÃO
        // =================================================================

        drawArena: function(ctx, w, h) {
            const a = ARENAS[this.selArena];
            const mid = h * 0.5;
            const g = ctx.createLinearGradient(0,0,0,h);
            g.addColorStop(0, a.bgTop); g.addColorStop(1, a.bgBot);
            ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
            
            // Chão e Cordas (Perspectiva)
            ctx.fillStyle = a.floor;
            ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(w,h); ctx.lineTo(w*0.8, mid); ctx.lineTo(w*0.2, mid); ctx.fill();
            ctx.strokeStyle = a.rope; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(w*0.2, mid); ctx.lineTo(w*0.8, mid); ctx.moveTo(w*0.1, mid+50); ctx.lineTo(w*0.9, mid+50); ctx.stroke();
        },

        // Desenha Braço Articulado (Ombro -> Cotovelo -> Punho)
        drawArmIK: function(ctx, arm, color, isSelf) {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            // Se for o próprio jogador, braços saem de baixo da tela se os ombros não forem detectados bem
            // Mas aqui temos dados reais do esqueleto!
            
            // Segmento 1: Ombro -> Cotovelo
            ctx.strokeStyle = color; 
            ctx.lineWidth = isSelf ? 20 : 15;
            ctx.beginPath(); ctx.moveTo(arm.s.x, arm.s.y); ctx.lineTo(arm.e.x, arm.e.y); ctx.stroke();

            // Segmento 2: Cotovelo -> Punho
            ctx.strokeStyle = color; // Pode ser um tom mais claro
            ctx.lineWidth = isSelf ? 18 : 12;
            ctx.beginPath(); ctx.moveTo(arm.e.x, arm.e.y); ctx.lineTo(arm.w.x, arm.w.y); ctx.stroke();

            // Luva
            const s = isSelf ? 1.0 + (arm.z/150) : 0.8; // Escala baseada em Z
            this.drawGlove(ctx, arm.w.x, arm.w.y, s, '#e74c3c');
        },

        drawGlove: function(ctx, x, y, scale, color) {
            ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
            const g = ctx.createRadialGradient(-10,-10,5,0,0,30);
            g.addColorStop(0,'#fff'); g.addColorStop(1,color);
            ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,30,0,Math.PI*2); ctx.fill();
            ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=2; ctx.stroke();
            ctx.restore();
        },

        drawPlayer: function(ctx, p, w, h) {
            // POV - Desenhamos apenas braços e luvas
            // A cor da pele vem do personagem selecionado
            const char = CHARACTERS[p.charId];
            
            this.drawArmIK(ctx, p.armL, char.skin, true);
            this.drawArmIK(ctx, p.armR, char.skin, true);

            if (p.guard) {
                ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0,0,w,h);
                this.spawnMsg(w/2, h*0.2, "DEFESA", "#0f0", 1);
            }
        },

        drawRival: function(ctx, p, w, h) {
            const char = CHARACTERS[p.charId];
            const cx = p.head.x; const cy = p.head.y;

            // Corpo Simplificado (Atrás dos braços)
            ctx.fillStyle = char.color; 
            ctx.beginPath(); ctx.ellipse(cx, cy+150, 60, 120, 0, 0, Math.PI*2); ctx.fill();

            // Cabeça
            ctx.fillStyle = char.skin; ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = char.hat; ctx.beginPath(); ctx.arc(cx, cy-15, 42, Math.PI, 0); ctx.fill();

            // Braços do Oponente
            this.drawArmIK(ctx, p.armL, char.skin, false);
            this.drawArmIK(ctx, p.armR, char.skin, false);
        },

        // =================================================================
        // TELAS UI (RESPONSIVE VMIN)
        // =================================================================

        drawBtn: function(ctx, key, txt, x, y, w, h, active) {
            this.uiButtons[key] = {x,y,w,h};
            ctx.fillStyle = active ? '#e67e22' : '#2c3e50';
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
            ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x,y,w,h,15); else ctx.rect(x,y,w,h);
            ctx.fill(); ctx.stroke();
            
            const fs = Math.floor(h*0.5);
            ctx.fillStyle = '#fff'; ctx.font = `bold ${fs}px 'Russo One'`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(txt, x+w/2, y+h/2);
        },

        uiMode: function(ctx, w, h) {
            const v = Math.min(w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.1}px 'Russo One'`;
            ctx.fillText("BOXING SIM", w/2, h*0.2);
            this.drawBtn(ctx, 'btnOff', "TREINO (ALVOS)", w/2 - v*0.35, h*0.4, v*0.7, v*0.15, this.selMode==='OFFLINE');
            this.drawBtn(ctx, 'btnOn', "ONLINE (PVP)", w/2 - v*0.35, h*0.6, v*0.7, v*0.15, this.selMode==='ONLINE');
        },

        uiChar: function(ctx, w, h) {
            const v = Math.min(w,h);
            const c = CHARACTERS[this.selChar];
            ctx.fillStyle = c.color; ctx.fillRect(0,0,w,h);
            
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText("ESCOLHA", w/2, h*0.15);
            
            ctx.beginPath(); ctx.arc(w/2, h*0.4, v*0.25, 0, Math.PI*2); ctx.fillStyle=c.hat; ctx.fill();
            ctx.fillStyle='#fff'; ctx.fillText(c.name, w/2, h*0.65);

            this.drawBtn(ctx, 'btnNext', "TROCAR", w*0.1, h*0.8, w*0.35, v*0.12);
            this.drawBtn(ctx, 'btnOk', "OK", w*0.55, h*0.8, w*0.35, v*0.12, true);
        },

        uiArena: function(ctx, w, h) {
            const v = Math.min(w,h);
            const a = ARENAS[this.selArena];
            const g = ctx.createLinearGradient(0,0,0,h); g.addColorStop(0, a.bgTop); g.addColorStop(1, a.bgBot);
            ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
            
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText(a.name, w/2, h*0.2);
            
            this.drawBtn(ctx, 'btnNext', "MUDAR", w*0.1, h*0.8, w*0.35, v*0.12);
            this.drawBtn(ctx, 'btnOk', "CALIBRAR", w*0.55, h*0.8, w*0.35, v*0.12, true);
        },

        uiCalib: function(ctx, w, h, pose) {
            ctx.fillStyle='#111'; ctx.fillRect(0,0,w,h);
            const v = Math.min(w,h);
            
            ctx.fillStyle='#0ff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.06}px 'Russo One'`;
            ctx.fillText("CALIBRAÇÃO", w/2, h*0.15);
            ctx.fillStyle='#fff'; ctx.font=`${v*0.04}px sans-serif`;
            ctx.fillText("FIQUE EM POSIÇÃO DE GUARDA (T-POSE)", w/2, h*0.25);

            // Coleta amostras da envergadura
            if (pose && pose.keypoints) {
                const k = pose.keypoints;
                if(k[5] && k[6] && k[9] && k[10]) { // Ombros e Punhos visíveis
                    const ls = Utils.toScreen(k[5],w,h); const rs = Utils.toScreen(k[6],w,h);
                    const lw = Utils.toScreen(k[9],w,h); const rw = Utils.toScreen(k[10],w,h);
                    
                    // Desenha Esqueleto Verde
                    ctx.strokeStyle='#0f0'; ctx.lineWidth=5;
                    ctx.beginPath(); ctx.moveTo(ls.x,ls.y); ctx.lineTo(lw.x,lw.y); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(rs.x,rs.y); ctx.lineTo(rw.x,rw.y); ctx.stroke();

                    // Calcula comprimento médio do braço
                    const lenL = Utils.dist(ls, lw);
                    const lenR = Utils.dist(rs, rw);
                    const avgLen = (lenL + lenR) / 2;
                    
                    if (avgLen > 50) {
                        this.p1.calib.armLength = (this.p1.calib.armLength * 0.9) + (avgLen * 0.1);
                        this.p1.calib.samples++;
                    }
                }
            }

            // Barra de Progresso
            const pct = Math.min(1, this.p1.calib.samples / CONF.CALIB_SAMPLES);
            ctx.fillStyle = '#333'; ctx.fillRect(w*0.2, h*0.5, w*0.6, 30);
            ctx.fillStyle = '#0f0'; ctx.fillRect(w*0.2, h*0.5, w*0.6 * pct, 30);

            if (pct >= 1) {
                this.drawBtn(ctx, 'btnDone', "PRONTO!", w/2 - v*0.25, h*0.7, v*0.5, v*0.15, true);
            }
        },

        uiLobby: function(ctx, w, h) {
            ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h);
            const v = Math.min(w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText("BUSCANDO OPONENTE...", w/2, h/2);
            // Spinner
            const t = Date.now()/1000;
            ctx.beginPath(); ctx.arc(w/2, h/2+v*0.2, v*0.1, t, t+4); 
            ctx.strokeStyle='#fff'; ctx.lineWidth=5; ctx.stroke();
        },

        uiOver: function(ctx, w, h) {
            ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.fillRect(0,0,w,h);
            const v = Math.min(w,h);
            const win = this.p1.hp > 0;
            
            ctx.fillStyle = win ? '#f1c40f' : '#e74c3c';
            ctx.textAlign='center'; ctx.font=`bold ${v*0.15}px 'Russo One'`;
            ctx.fillText(win ? (this.isOnline?"VITORIA!":"BOM TREINO!") : "FIM", w/2, h*0.4);
            
            ctx.fillStyle='#fff'; ctx.font=`bold ${v*0.06}px sans-serif`;
            ctx.fillText("SCORE: " + this.p1.score, w/2, h*0.55);
            
            this.drawBtn(ctx, 'btnMenu', "MENU", w/2 - v*0.25, h*0.7, v*0.5, v*0.15, true);
        },

        // --- HUD ---
        drawHUD: function(ctx, w, h) {
            const v = Math.min(w,h);
            // Barra P1
            ctx.fillStyle='#333'; ctx.fillRect(20,20, w*0.3, 30);
            ctx.fillStyle='#e74c3c'; ctx.fillRect(20,20, w*0.3 * (this.p1.hp/100), 30);
            ctx.fillStyle='#fff'; ctx.textAlign='left'; ctx.font='20px Arial';
            ctx.fillText("P1", 25, 42);

            if (this.isOnline) {
                // Barra P2
                ctx.fillStyle='#333'; ctx.fillRect(w-20-w*0.3, 20, w*0.3, 30);
                ctx.fillStyle='#3498db'; ctx.fillRect(w-20-w*0.3, 20, w*0.3 * (this.p2.hp/100), 30);
            } else {
                // Info Offline
                ctx.textAlign='right'; ctx.fillText("ALVOS: " + this.targets.length, w-20, 42);
            }

            // Timer
            ctx.textAlign='center'; ctx.font=`bold ${v*0.1}px 'Russo One'`;
            ctx.fillText(Math.ceil(this.timer/60), w/2, v*0.15);
        },

        spawnParticles: function(x, y, c) { for(let i=0; i<8; i++) this.particles.push({x, y, vx:(Math.random()-0.5)*10, vy:(Math.random()-0.5)*10, c, l:1}); },
        updateParticles: function(ctx) { this.particles.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.l-=0.05; ctx.globalAlpha=p.l; ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,7); ctx.fill(); }); ctx.globalAlpha=1; this.particles=this.particles.filter(p=>p.l>0); },
        spawnMsg: function(x, y, t, c, l=40) { this.msgs.push({x,y,t,c,l}); },
        drawMsgs: function(ctx) { this.msgs.forEach(m => { m.y--; m.l--; ctx.fillStyle=m.c; ctx.font="bold 30px 'Russo One'"; ctx.fillText(m.t, m.x, m.y); }); this.msgs=this.msgs.filter(m=>m.l>0); },
        
        endRound: function() { 
            if(this.round < CONF.ROUNDS) { this.round++; this.timer=CONF.ROUND_TIME*60; window.System.msg("ROUND "+this.round); }
            else { this.state='GAMEOVER'; window.System.msg("FIM"); }
        },
        endGame: function(win) { this.state='GAMEOVER'; }
    };

    if(window.System) window.System.registerGame('box_pro', 'Boxe Simulator', '🥊', Game, { camOpacity: 0.3 });

})();
