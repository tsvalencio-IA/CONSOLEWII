// =============================================================================
// SUPER BOXING STADIUM: PLATINUM EDITION (REALITY FIX)
// ARQUITETO: SENIOR DEV - HYBRID SYSTEM (OLD INPUT + NEW GRAPHICS)
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E CONFIGURAÇÕES VISUAIS
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
        SMOOTHING: 0.5,       // Menor = mais rápido (fiel ao usuário)
        MIN_CONFIDENCE: 0.2,
        REACH_SCALE: 2.5
    };

    const Utils = {
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
        lerp: (a, b, t) => a + (b - a) * t,
        lerpPoint: (p1, p2, t) => ({ x: Utils.lerp(p1.x, p2.x, t), y: Utils.lerp(p1.y, p2.y, t) }),
        
        // Mapeamento Robusto (Baseado no Kart)
        toScreen: (kp, w, h) => {
            const vid = window.System ? window.System.video : null;
            const vw = (vid && vid.videoWidth > 0) ? vid.videoWidth : 640;
            const vh = (vid && vid.videoHeight > 0) ? vid.videoHeight : 480;
            // Inverte X para espelho
            return { 
                x: (1 - kp.x / vw) * w, 
                y: (kp.y / vh) * h 
            };
        },
        
        isInside: (x, y, btn) => {
            const pad = 30; 
            return x >= btn.x - pad && x <= btn.x + btn.w + pad && y >= btn.y - pad && y <= btn.y + btn.h + pad;
        }
    };

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO
    // -----------------------------------------------------------------

    const Game = {
        state: 'MODE_SELECT',
        roomId: 'boxing_platinum_v1',
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
            hp: 100, maxHp: 100, score: 0,
            head: {x:0, y:0},
            // Dados brutos (Input Real)
            hands: { 
                l: {x:0, y:0, z:0, vel:0}, 
                r: {x:0, y:0, z:0, vel:0} 
            },
            elbows: { l:{x:0,y:0}, r:{x:0,y:0} },
            shoulders: { l:{x:0,y:0}, r:{x:0,y:0} }, 
            guard: false,
            calib: { active: false, samples: 0, maxReach: 150, progress: 0 }
        },

        // --- OPONENTE (P2) ---
        p2: { 
            hp: 100, maxHp: 100, id: null, isRemote: false, charId: 0,
            head: {x:0, y:0},
            hands: { l: {x:0, y:0, z:0}, r: {x:0, y:0, z:0} },
            elbows: { l:{x:0,y:0}, r:{x:0,y:0} },
            shoulders: { l:{x:0,y:0}, r:{x:0,y:0} },
            guard: false,
            ai: { timer: 0, state: 'IDLE' }
        },

        particles: [],
        msgs: [],

        // =================================================================
        // SISTEMA & INPUT
        // =================================================================

        init: function() {
            this.state = 'MODE_SELECT';
            this.cleanup();
            if(window.System.msg) window.System.msg("SUPER BOXING PLATINUM");
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
                    if (btn('off')) this.setMode('OFFLINE');
                    if (btn('on')) this.setMode('ONLINE');
                } else if (this.state === 'CHAR_SELECT') {
                    if (btn('next')) { this.selChar = (this.selChar+1)%CHARACTERS.length; window.Sfx.play(600,'square',0.1); }
                    if (btn('ok')) { this.state = 'ARENA_SELECT'; window.Sfx.click(); }
                } else if (this.state === 'ARENA_SELECT') {
                    if (btn('next')) { this.selArena = (this.selArena+1)%ARENAS.length; window.Sfx.play(600,'square',0.1); }
                    if (btn('ok')) this.startCalib();
                } else if (this.state === 'CALIBRATE') {
                    if (btn('done') && this.p1.calib.progress > 10) this.finishCalib();
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
            this.p1.calib.progress = 0;
            this.p1.calib.maxReach = 100;
            this.p1.calib.active = true;
            window.System.msg("ABRA OS BRAÇOS");
        },

        finishCalib: function() {
            this.p1.calib.active = false;
            this.p1.calib.maxReach = Math.max(80, this.p1.calib.maxReach);
            this.startGame();
            window.Sfx.click();
        },

        startGame: function() {
            this.p1.hp = 100;
            this.p1.score = 0;
            this.round = 1;
            this.timer = CONF.ROUND_TIME * 60;
            this.particles = [];
            
            const w = window.System.canvas.width;
            const h = window.System.canvas.height;
            this.p1.head = {x: w/2, y: h/2};
            // Inicializa braços para não bugar render antes do tracking
            this.p1.shoulders = { l:{x:w*0.2, y:h}, r:{x:w*0.8, y:h} };
            this.p1.hands = { l:{x:w*0.2, y:h*0.7, z:0, vel:0}, r:{x:w*0.8, y:h*0.7, z:0, vel:0} };

            if (this.isOnline) {
                this.connectLobby();
            } else {
                this.p2.charId = Math.floor(Math.random() * CHARACTERS.length);
                this.p2.hp = 100;
                this.p2.isRemote = false;
                // IA Inicial
                this.p2.head = {x: w/2, y: h/3};
                this.p2.shoulders = {l: {x:w/2-60, y:h/3+80}, r: {x:w/2+60, y:h/3+80}};
                this.p2.elbows = {l: {x:w/2-80, y:h/3+140}, r: {x:w/2+80, y:h/3+140}};
                this.p2.hands = { l: {x:w/2-40, y:h/3+80, z:0}, r: {x:w/2+40, y:h/3+80, z:0} };
                
                this.state = 'FIGHT';
                window.System.msg("LUTA!");
            }
        },

        connectLobby: function() {
            this.state = 'LOBBY';
            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            myRef.set({ charId: this.selChar, hp: 100, lastSeen: firebase.database.ServerValue.TIMESTAMP });
            myRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', snap => {
                const players = snap.val();
                if (!players) return;
                const opId = Object.keys(players).find(id => id !== window.System.playerId);

                if (opId) {
                    const p2Data = players[opId];
                    if (this.state === 'LOBBY') {
                        this.p2.id = opId;
                        this.p2.charId = p2Data.charId || 0;
                        this.p2.hp = 100;
                        this.p2.isRemote = true;
                        this.state = 'FIGHT';
                        window.System.msg("VS " + CHARACTERS[this.p2.charId].name);
                    }
                    if (this.state === 'FIGHT') {
                        this.p2.hp = p2Data.hp;
                        if (p2Data.pose) {
                            this.p2.head = p2Data.pose.h;
                            this.p2.shoulders = p2Data.pose.s;
                            this.p2.elbows = p2Data.pose.e;
                            this.p2.hands = p2Data.pose.w;
                            this.p2.guard = p2Data.pose.g;
                        }
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

            // 1. INPUT (CRUCIAL: Sempre roda para atualizar posições)
            this.processSkeleton(w, h, pose);

            // 2. BACKGROUND
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

            const getP = (i, fallback) => (k[i] && k[i].score > thresh) ? Utils.toScreen(k[i], w, h) : fallback;

            // Dados Crus
            const nose = getP(0, this.p1.head);
            const ls = getP(5, {x:w*0.3, y:h*0.8});
            const rs = getP(6, {x:w*0.7, y:h*0.8});
            const le = getP(7, null); 
            const re = getP(8, null);
            const lw = getP(9, this.p1.hands.l);
            const rw = getP(10, this.p1.hands.r);

            // CALIBRAÇÃO
            if (this.p1.calib.active) {
                this.p1.head = nose; 
                // Feedback visual na tela de calibração
                if (k[9] && k[10]) {
                    const span = Utils.dist(lw, rw);
                    if (span > this.p1.calib.maxReach) this.p1.calib.maxReach = span / 2;
                    if (span > 100) this.p1.calib.progress = Math.min(100, this.p1.calib.progress + 2);
                }
                return;
            }

            // SUAVIZAÇÃO E POSICIONAMENTO 1:1
            this.p1.head = Utils.lerpPoint(this.p1.head, nose, smooth);
            
            // Ombros Virtuais (POV) - Base fixa embaixo, move X com cabeça
            this.p1.shoulders.l = { x: Utils.lerp(w*0.1, w*0.4, (nose.x/w)), y: h + 50 };
            this.p1.shoulders.r = { x: Utils.lerp(w*0.9, w*0.6, (nose.x/w)), y: h + 50 };

            // Processa Mãos
            this.processHand('l', lw, le, this.p1.shoulders.l, w, h);
            this.processHand('r', rw, re, this.p1.shoulders.r, w, h);

            // Guarda
            const dL = Utils.dist(this.p1.hands.l, nose);
            const dR = Utils.dist(this.p1.hands.r, nose);
            const guardDist = this.p1.calib.maxReach * 0.7; 
            this.p1.guard = (dL < guardDist && dR < guardDist);
        },

        processHand: function(side, rawPos, rawElbow, shoulderPos, w, h) {
            const hand = this.p1.hands[side];
            const elbow = this.p1.elbows[side];

            // 1. Posição XY (Fiel 1:1)
            const speed = Utils.dist(hand, rawPos);
            hand.x = Utils.lerp(hand.x, rawPos.x, CONF.SMOOTHING);
            hand.y = Utils.lerp(hand.y, rawPos.y, CONF.SMOOTHING);
            hand.vel = speed;

            // 2. Cotovelo (Se não detectado, interpola para visual natural)
            if (rawElbow) {
                elbow.x = Utils.lerp(elbow.x, rawElbow.x, CONF.SMOOTHING);
                elbow.y = Utils.lerp(elbow.y, rawElbow.y, CONF.SMOOTHING);
            } else {
                // Cotovelo estimado (ponto médio puxado para fora)
                const midX = (shoulderPos.x + hand.x) / 2;
                const midY = (shoulderPos.y + hand.y) / 2;
                const sideDir = (side === 'l') ? -1 : 1;
                elbow.x = Utils.lerp(elbow.x, midX + (sideDir * 40), 0.1);
                elbow.y = Utils.lerp(elbow.y, midY, 0.1);
            }

            // 3. Z-Depth (Simulado pela extensão do braço)
            const distFromShoulder = Utils.dist(rawPos, shoulderPos);
            // Normaliza extensão (0 a 1.0)
            const extRatio = Math.min(1.5, distFromShoulder / this.p1.calib.maxReach);
            // Mapeia para Z visual
            const targetZ = Math.max(0, (extRatio - 0.4) * 200);
            hand.z = Utils.lerp(hand.z, targetZ, 0.3);

            // 4. Detecção de Impacto
            // Se velocidade alta E mão esticada
            if (speed > 5 && hand.z > 60) {
                this.checkHit(hand, speed);
            }
        },

        checkHit: function(handPos, speed) {
            // Hitbox Rival
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
            cpu.shoulders.l = {x: cpu.head.x-60, y: baseY};
            cpu.shoulders.r = {x: cpu.head.x+60, y: baseY};

            // Ataque
            if (cpu.ai.timer-- <= 0) {
                const r = Math.random();
                if (r < 0.03) { 
                    const side = Math.random()>0.5 ? 'l' : 'r';
                    cpu.hands[side].z = 150; // Soco
                    cpu.hands[side].x = w/2; cpu.hands[side].y = h/2+100;
                    cpu.ai.timer = 50;
                    if (!this.p1.guard) {
                        this.p1.hp -= 5;
                        window.Gfx.shakeScreen(5);
                        this.spawnMsg(w/2, h/2, "OUCH", "#f00");
                    } else window.Sfx.play(100, 'sine', 0.1);

                } else if (r < 0.05) { 
                    cpu.guard = !cpu.guard;
                    cpu.ai.timer = 60;
                } else { 
                    cpu.hands.l.z = 0; cpu.hands.r.z = 0;
                }
            }

            // Animação Mãos Idle
            ['l', 'r'].forEach((s, i) => {
                const hand = cpu.hands[s];
                if (hand.z < 10) {
                    hand.x = Utils.lerp(hand.x, cpu.head.x + (i===0?-50:50), 0.1);
                    hand.y = Utils.lerp(hand.y, baseY + (cpu.guard?-40:40), 0.1);
                } else {
                    hand.z -= 5; 
                }
                // IK Cotovelo IA (Simples)
                cpu.elbows[s] = {
                    x: (cpu.shoulders[s].x + hand.x)/2 + (i===0?-40:40),
                    y: (cpu.shoulders[s].y + hand.y)/2 + 20
                };
            });
        },

        syncNetwork: function() {
            if (this.frame % 3 !== 0) return;
            this.dbRef.child('players/' + window.System.playerId).update({
                hp: this.p1.hp,
                pose: {
                    h: {x:Math.round(this.p1.head.x), y:Math.round(this.p1.head.y)},
                    s: this.p1.shoulders,
                    e: this.p1.elbows,
                    w: this.p1.hands,
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
            
            if (!isSelf) {
                const cx = p.head.x; const cy = p.head.y;
                const bg = ctx.createLinearGradient(cx-40,cy,cx+40,cy+200); 
                bg.addColorStop(0, char.color); bg.addColorStop(1, '#000');
                ctx.fillStyle=bg; ctx.beginPath(); ctx.moveTo(cx-50,cy+60); ctx.lineTo(cx+50,cy+60); ctx.lineTo(cx+30,cy+250); ctx.lineTo(cx-30,cy+250); ctx.fill();
                
                ctx.fillStyle=char.skin; ctx.beginPath(); ctx.arc(cx,cy,45,0,7); ctx.fill();
                ctx.fillStyle=char.hat; ctx.beginPath(); ctx.arc(cx,cy-15,47,Math.PI,0); ctx.fill(); ctx.fillRect(cx-50,cy-15,100,15);
                ctx.fillStyle='#000'; ctx.font="20px Arial"; ctx.textAlign='center'; ctx.fillText(char.name[0], cx, cy-28);
                
                this.drawArmSegment(ctx, p.shoulders.l, p.elbows.l, p.hands.l, char.skin, 18);
                this.drawArmSegment(ctx, p.shoulders.r, p.elbows.r, p.hands.r, char.skin, 18);
            } else {
                // PLAYER
                this.drawArmSegment(ctx, p.shoulders.l, p.elbows.l, p.hands.l, char.skin, 40);
                this.drawArmSegment(ctx, p.shoulders.r, p.elbows.r, p.hands.r, char.skin, 40);
            }

            // Luvas
            this.drawGlove(ctx, p.hands.l, char.color, isSelf ? (1+p.hands.l.z/300) : (0.8+p.hands.l.z/300));
            this.drawGlove(ctx, p.hands.r, char.color, isSelf ? (1+p.hands.r.z/300) : (0.8+p.hands.r.z/300));

            if(p.guard && isSelf) { ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.fillRect(0,0,w,h); }
        },

        drawArmSegment: function(ctx, s, e, w, color, width) {
            ctx.lineCap='round'; ctx.lineJoin='round';
            // Contorno
            ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=width+4;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.lineTo(w.x, w.y); ctx.stroke();
            // Pele
            ctx.strokeStyle=color; ctx.lineWidth=width;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.lineTo(w.x, w.y); ctx.stroke();
        },

        drawGlove: function(ctx, pos, color, s) {
            ctx.save(); ctx.translate(pos.x, pos.y); ctx.scale(s, s);
            const g = ctx.createRadialGradient(-10,-10,5,0,0,35); g.addColorStop(0,'#fff'); g.addColorStop(1,color);
            ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,35,0,7); ctx.fill();
            ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=3; ctx.stroke();
            ctx.restore();
        },

        uiCalib: function(ctx,w,h,pose) {
            ctx.fillStyle='#111'; ctx.fillRect(0,0,w,h);
            const v=Math.min(w,h);
            ctx.fillStyle='#0ff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.06}px 'Russo One'`;
            ctx.fillText("CALIBRAÇÃO", w/2, h*0.15);
            ctx.fillStyle='#fff'; ctx.font=`${v*0.04}px sans-serif`;
            ctx.fillText("FAÇA A POSE DE 'T'", w/2, h*0.25);
            
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

        drawBtn: function(ctx, id, txt, x, y, w, h, active) {
            this.uiButtons[id] = {x,y,w,h};
            ctx.shadowBlur=10; ctx.shadowColor='rgba(0,0,0,0.5)';
            ctx.fillStyle = active ? '#e67e22' : '#34495e';
            ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x,y,w,h,20); else ctx.rect(x,y,w,h); ctx.fill();
            ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.stroke();
            ctx.shadowBlur=0; ctx.fillStyle='#fff'; 
            ctx.font=`bold ${h*0.5}px 'Russo One'`; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(txt, x+w/2, y+h/2);
        },

        uiMode: function(ctx,w,h) {
            const v = Math.min(w,h);
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