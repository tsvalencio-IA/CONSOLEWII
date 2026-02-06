// =============================================================================
// SUPER BOXING STADIUM: CHAMPIONSHIP EDITION (VERSION 10 - NO-FREEZE FIX)
// ARQUITETO: SENIOR DEV - AUTO-IDLE ANIMATION & INSTANT FEEDBACK
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E CONFIGURAÇÕES
    // -----------------------------------------------------------------

    const CHARACTERS = [
        { id: 0, name: 'MARIO',    color: '#e74c3c', skin: '#ffccaa', hat: '#d32f2f', power: 1.0, speed: 1.0, hp: 100 },
        { id: 1, name: 'LUIGI',    color: '#2ecc71', skin: '#ffccaa', hat: '#27ae60', power: 0.9, speed: 1.1, hp: 100 },
        { id: 2, name: 'PEACH',    color: '#ff9ff3', skin: '#ffe0bd', hat: '#fd79a8', power: 0.8, speed: 1.3, hp: 90  },
        { id: 3, name: 'BOWSER',   color: '#f1c40f', skin: '#e67e22', hat: '#c0392b', power: 1.4, speed: 0.7, hp: 130 },
        { id: 4, name: 'WALUIGI', color: '#8e44ad', skin: '#ffccaa', hat: '#5e2d85', power: 1.1, speed: 0.9, hp: 100 }
    ];

    const ARENAS = [
        { id: 0, name: 'PRO RING',       bgTop: '#2c3e50', bgBot: '#1a252f', rope: '#c0392b', floor: '#95a5a6' },
        { id: 1, name: 'LAS VEGAS',      bgTop: '#2c2c54', bgBot: '#474787', rope: '#f1c40f', floor: '#f1f2f6' },
        { id: 2, name: 'UNDERGROUND',    bgTop: '#2d3436', bgBot: '#000000', rope: '#636e72', floor: '#b2bec3' }
    ];

    const CONF = {
        ROUNDS: 3,
        ROUND_TIME: 60,
        VELOCITY_THRESH: 5,   
        BLOCK_DIST: 140,      
        SMOOTHING: 0.6,       
        MIN_CONFIDENCE: 0.2,  
        ARM_SCALE: 2.2        
    };

    const Utils = {
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
        lerp: (a, b, t) => a + (b - a) * t,
        lerpPoint: (p1, p2, t) => ({ x: Utils.lerp(p1.x, p2.x, t), y: Utils.lerp(p1.y, p2.y, t) }),
        
        toScreen: (kp, w, h) => {
            const vid = window.System ? window.System.video : null;
            const vw = (vid && vid.videoWidth > 0) ? vid.videoWidth : 640;
            const vh = (vid && vid.videoHeight > 0) ? vid.videoHeight : 480;
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
    // 2. CORE DO JOGO
    // -----------------------------------------------------------------

    const Game = {
        state: 'MODE_SELECT',
        roomId: 'boxing_pro_global',
        isOnline: false,
        dbRef: null,
        uiButtons: {},

        selMode: 'OFFLINE',
        selChar: 0,
        selArena: 0,

        timer: 0,
        round: 1,
        frame: 0,
        hasPose: false, // Nova flag para saber se a câmera está detectando
        
        // --- JOGADOR 1 (LOCAL) ---
        p1: { 
            hp: 100, maxHp: 100, stamina: 100, score: 0,
            head: {x:0, y:0},
            // Estrutura Visual
            visual: {
                armL: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 },
                armR: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 }
            },
            // Dados brutos
            raw: { 
                ls: {x:0,y:0}, rs: {x:0,y:0}, 
                le: {x:0,y:0}, re: {x:0,y:0}, 
                lw: {x:0,y:0}, rw: {x:0,y:0} 
            },
            guard: false,
            calib: { active: false, samples: 0, upperLen: 100, foreLen: 90, totalLen: 190 }
        },

        // --- JOGADOR 2 (IA OU REDE) ---
        p2: { 
            hp: 100, maxHp: 100, id: null, isRemote: false, charId: 0,
            head: {x:0, y:0},
            visual: {
                armL: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 },
                armR: { s:{x:0,y:0}, e:{x:0,y:0}, w:{x:0,y:0}, z:0 }
            },
            guard: false,
            ai: { timer: 0 }
        },

        particles: [],
        msgs: [],

        // =================================================================
        // CICLO DE VIDA
        // =================================================================

        init: function() {
            this.state = 'MODE_SELECT';
            this.cleanup();
            if(window.System && window.System.msg) window.System.msg("BOXING PRO V10");
            this.setupInput();
        },

        cleanup: function() {
            if (this.dbRef) {
                try { this.dbRef.child('players/' + window.System.playerId).remove(); this.dbRef.off(); } 
                catch(e){}
            }
            if(window.System && window.System.canvas) window.System.canvas.onclick = null;
        },

        setupInput: function() {
            window.System.canvas.onclick = (e) => {
                const r = window.System.canvas.getBoundingClientRect();
                const x = e.clientX - r.left;
                const y = e.clientY - r.top;
                
                const btn = (id) => this.uiButtons[id] && Utils.isInside(x, y, this.uiButtons[id]);

                if (this.state === 'MODE_SELECT') {
                    if (btn('off')) this.setMode('OFFLINE');
                    else if (btn('on')) this.setMode('ONLINE');
                } else if (this.state === 'CHAR_SELECT') {
                    if (btn('next')) { this.selChar = (this.selChar+1)%CHARACTERS.length; if(window.Sfx) window.Sfx.play(600,'square',0.1); }
                    else if (btn('ok')) { this.state = 'ARENA_SELECT'; if(window.Sfx) window.Sfx.click(); }
                } else if (this.state === 'ARENA_SELECT') {
                    if (btn('next')) { this.selArena = (this.selArena+1)%ARENAS.length; if(window.Sfx) window.Sfx.play(600,'square',0.1); }
                    else if (btn('ok')) this.startCalib();
                } else if (this.state === 'CALIBRATE') {
                    if (btn('done') && this.p1.calib.samples > 5) this.finishCalib();
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
            if(window.Sfx) window.Sfx.click();
        },

        startCalib: function() {
            this.state = 'CALIBRATE';
            this.p1.calib.samples = 0;
            this.p1.calib.active = true;
            if(window.System) window.System.msg("POSIÇÃO T-POSE");
        },

        finishCalib: function() {
            this.p1.calib.active = false;
            this.p1.calib.upperLen = Math.max(60, this.p1.calib.upperLen);
            this.p1.calib.foreLen = Math.max(60, this.p1.calib.foreLen);
            this.p1.calib.totalLen = this.p1.calib.upperLen + this.p1.calib.foreLen;
            this.startGame();
            if(window.Sfx) window.Sfx.click();
        },

        startGame: function() {
            this.p1.hp = 100;
            this.p1.score = 0;
            this.round = 1;
            this.timer = CONF.ROUND_TIME * 60;
            this.particles = [];
            this.hasPose = false;
            
            const w = window.System.canvas.width;
            const h = window.System.canvas.height;
            
            // --- CORREÇÃO DE POSICIONAMENTO INICIAL (ANTI-TRAVAMENTO) ---
            // Coordenadas ajustadas para "Guarda de Boxe" e não "Mãos ao alto"
            this.p1.head = {x:w/2, y:h*0.4}; // Cabeça mais alta
            
            // Ombros (Mais baixos que a cabeça)
            this.p1.raw.ls = {x:w*0.35, y:h*0.6}; 
            this.p1.raw.rs = {x:w*0.65, y:h*0.6};
            
            // Cotovelos (Para baixo)
            this.p1.raw.le = {x:w*0.3, y:h*0.8}; 
            this.p1.raw.re = {x:w*0.7, y:h*0.8};
            
            // Punhos (Na altura do queixo, não acima da cabeça)
            this.p1.raw.lw = {x:w*0.4, y:h*0.5}; 
            this.p1.raw.rw = {x:w*0.6, y:h*0.5};

            // Aplica aos visuais
            this.p1.visual.armL.s = this.p1.raw.ls; this.p1.visual.armL.e = this.p1.raw.le; this.p1.visual.armL.w = this.p1.raw.lw;
            this.p1.visual.armR.s = this.p1.raw.rs; this.p1.visual.armR.e = this.p1.raw.re; this.p1.visual.armR.w = this.p1.raw.rw;

            if (this.isOnline) {
                this.connectLobby();
            } else {
                this.p2.charId = Math.floor(Math.random() * CHARACTERS.length);
                this.p2.hp = 100;
                this.p2.isRemote = false;
                this.p2.head = {x:w/2, y:h/3};
                this.state = 'FIGHT';
                if(window.System) window.System.msg("LUTA!");
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
                        this.timer = CONF.ROUND_TIME * 60;
                        window.System.msg("VS " + CHARACTERS[this.p2.charId].name);
                    }
                    if (this.state === 'FIGHT') {
                        this.p2.hp = p2Data.hp;
                        if (p2Data.pose) {
                            this.p2.head = p2Data.pose.h;
                            this.p2.visual.armL = p2Data.pose.al;
                            this.p2.visual.armR = p2Data.pose.ar;
                            this.p2.guard = p2Data.pose.g;
                        }
                    }
                } else if (this.state === 'FIGHT') {
                    this.state = 'GAMEOVER';
                    window.System.msg("DESCONECTADO");
                }
            });
        },

        // =================================================================
        // UPDATE & FÍSICA
        // =================================================================

        update: function(ctx, w, h, pose) {
            this.frame++;
            this.uiButtons = {};

            // 1. Processamento de Pose
            this.processSkeleton(w, h, pose);

            // 2. Renderização de Telas
            if (this.state !== 'FIGHT') {
                const g = ctx.createLinearGradient(0,0,0,h);
                g.addColorStop(0, '#0f0c29'); g.addColorStop(1, '#302b63');
                ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
            }

            if (this.state === 'MODE_SELECT') { this.uiMode(ctx, w, h); return; }
            if (this.state === 'CHAR_SELECT') { this.uiChar(ctx, w, h); return; }
            if (this.state === 'ARENA_SELECT') { this.uiArena(ctx, w, h); return; }
            if (this.state === 'CALIBRATE') { this.uiCalib(ctx, w, h, pose); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiOver(ctx, w, h); return; }

            // === ARENA DE BATALHA ===
            this.drawArena(ctx, w, h);

            if (this.isOnline) this.syncNetwork();
            else this.updateAI(w, h);

            // Renderiza Oponente (Fundo)
            this.drawCharacter(ctx, this.p2, false, w, h);
            
            // Renderiza Jogador (Frente)
            this.drawCharacter(ctx, this.p1, true, w, h);

            if (this.timer > 0) this.timer--; else this.endGame();
            if (this.p1.hp <= 0 || this.p2.hp <= 0) this.endGame();

            this.drawHUD(ctx, w, h);
            this.updateParticles(ctx);
            this.drawMsgs(ctx);

            return Math.floor(this.p1.score);
        },

        processSkeleton: function(w, h, pose) {
            // --- CORREÇÃO DE TRAVAMENTO ---
            // Se não houver pose detectada, animamos o boneco automaticamente
            if (!pose || !pose.keypoints || pose.score < 0.1) {
                this.hasPose = false;
                // Animação de "Respiração" (Idle) para não parecer travado
                const breath = Math.sin(this.frame * 0.1) * 5;
                this.p1.head.y += Math.cos(this.frame * 0.1) * 0.5;
                
                // Mantém os punhos flutuando levemente em posição de guarda
                this.p1.visual.armL.w.y += Math.sin(this.frame * 0.15) * 1;
                this.p1.visual.armR.w.y += Math.cos(this.frame * 0.15) * 1;
                return; 
            }
            
            this.hasPose = true;

            const k = pose.keypoints;
            const smooth = CONF.SMOOTHING;
            const thresh = CONF.MIN_CONFIDENCE;
            const getP = (i, fallback) => (k[i] && k[i].score > thresh) ? Utils.toScreen(k[i], w, h) : fallback;

            const nose = getP(0, this.p1.head);
            const ls = getP(5, this.p1.raw.ls); const rs = getP(6, this.p1.raw.rs);
            const le = getP(7, this.p1.raw.le); const re = getP(8, this.p1.raw.re);
            const lw = getP(9, this.p1.raw.lw); const rw = getP(10, this.p1.raw.rw);

            if (this.p1.calib.active) {
                this.p1.head = nose; this.p1.raw.ls = ls; this.p1.raw.rs = rs;
                this.p1.raw.le = le; this.p1.raw.re = re; this.p1.raw.lw = lw; this.p1.raw.rw = rw;
                
                const dUL = Utils.dist(ls, le); const dFL = Utils.dist(le, lw);
                const dUR = Utils.dist(rs, re); const dFR = Utils.dist(re, rw);
                if (dUL > 20 && dFL > 20) {
                    this.p1.calib.upperLen = (this.p1.calib.upperLen * 0.9) + ((dUL + dUR)/2 * 0.1);
                    this.p1.calib.foreLen = (this.p1.calib.foreLen * 0.9) + ((dFL + dFR)/2 * 0.1);
                    this.p1.calib.samples++;
                }
                return;
            }

            this.p1.head = Utils.lerpPoint(this.p1.head, nose, smooth);
            this.p1.raw.ls = Utils.lerpPoint(this.p1.raw.ls, ls, smooth);
            this.p1.raw.rs = Utils.lerpPoint(this.p1.raw.rs, rs, smooth);
            
            const shoulderY = h + 100;
            const shoulderSpread = w * 0.25;
            const virtualLS = { x: w/2 - shoulderSpread + (this.p1.head.x - w/2)*0.5, y: shoulderY };
            const virtualRS = { x: w/2 + shoulderSpread + (this.p1.head.x - w/2)*0.5, y: shoulderY };

            this.processArm('armL', virtualLS, le, lw, w, h);
            this.processArm('armR', virtualRS, re, rw, w, h);

            const dL = Utils.dist(this.p1.visual.armL.w, this.p1.head);
            const dR = Utils.dist(this.p1.visual.armR.w, this.p1.head);
            this.p1.guard = (dL < CONF.BLOCK_DIST && dR < CONF.BLOCK_DIST);
            
            if(this.p1.stamina < 100) this.p1.stamina += 0.3;
        },

        processArm: function(armKey, s, e, wrist, w, h) {
            const visual = this.p1.visual[armKey];
            visual.s = s; 

            const speed = Utils.dist(visual.w, wrist);
            visual.w = Utils.lerpPoint(visual.w, wrist, 0.5); 

            const currentDist = Utils.dist(s, wrist);
            const maxDist = this.p1.calib.totalLen * CONF.ARM_SCALE;
            const extension = Math.min(1.2, currentDist / maxDist);
            
            const targetZ = Math.max(0, (extension - 0.4) * 3 * 150);
            visual.z = Utils.lerp(visual.z, targetZ, 0.3);

            const midX = (visual.s.x + visual.w.x) / 2;
            const midY = (visual.s.y + visual.w.y) / 2;
            visual.e = { x: Utils.lerp(midX, e.x, 0.5), y: Utils.lerp(midY, e.y, 0.5) };

            if (speed > CONF.VELOCITY_THRESH && visual.z > 60 && this.p1.stamina > 5) {
                this.checkHit(visual.w, visual.z, speed);
            }
        },

        checkHit: function(handPos, z, speed) {
            const rX = this.p2.head.x;
            const rY = this.p2.head.y;
            
            if (Utils.dist(handPos, {x:rX, y:rY}) < 120 && z > 90) {
                if (this.p2.guard) {
                    this.spawnMsg(rX, rY, "BLOCKED", "#aaa");
                    if(window.Sfx) window.Sfx.play(150, 'square', 0.1);
                } else {
                    const dmg = Math.floor(speed * 0.6) + 5;
                    this.p2.hp -= dmg;
                    this.p1.score += dmg * 10;
                    this.p1.stamina -= 10;
                    this.spawnParticles(rX, rY, '#f00');
                    this.spawnMsg(rX, rY, dmg, "#ff0");
                    if(window.Sfx) window.Sfx.hit();
                    if(window.Gfx) window.Gfx.shakeScreen(10);
                    if (this.isOnline) this.dbRef.child('players/' + this.p2.id).update({hp: this.p2.hp});
                }
            }
        },

        updateAI: function(w, h) {
            const cpu = this.p2;
            const t = this.frame * 0.05;
            const targetX = (w/2) + Math.sin(t) * 150;
            cpu.head.x = Utils.lerp(cpu.head.x, targetX, 0.05);
            cpu.head.y = h/3 + Math.cos(t*0.5) * 30;

            if (cpu.ai.timer-- <= 0) {
                const act = Math.random();
                if (act < 0.04) { 
                    const side = Math.random()>0.5 ? 'armL' : 'armR';
                    cpu.visual[side].z = 160; 
                    cpu.ai.timer = 30;
                    if (Math.random() > 0.3 && !this.p1.guard) {
                        this.p1.hp -= 5;
                        if(window.Gfx) window.Gfx.shakeScreen(5);
                        this.spawnMsg(w/2, h/2, "HIT", "#f00");
                    }
                } else if (act < 0.06) { 
                    cpu.guard = !cpu.guard;
                    cpu.ai.timer = 50;
                } else { 
                    cpu.visual.armL.z = 0;
                    cpu.visual.armR.z = 0;
                }
            }

            ['armL', 'armR'].forEach((k, i) => {
                const arm = cpu.visual[k];
                const homeX = cpu.head.x + (i===0 ? -50 : 50);
                arm.s = {x: cpu.head.x + (i===0 ? -60 : 60), y: cpu.head.y + 100};
                
                if (arm.z > 10) { 
                    arm.w.x = Utils.lerp(arm.w.x, w/2, 0.25);
                    arm.w.y = Utils.lerp(arm.w.y, h/2 + 50, 0.25);
                    arm.z -= 8; 
                } else { 
                    arm.w.x = Utils.lerp(arm.w.x, homeX, 0.1);
                    arm.w.y = Utils.lerp(arm.w.y, cpu.head.y + 100 + (cpu.guard ? -50 : 50), 0.1);
                }
                arm.e = { x: (arm.s.x + arm.w.x)/2 + (i===0?-40:40), y: (arm.s.y + arm.w.y)/2 + 20 };
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

        drawArena: function(ctx, w, h) {
            const a = ARENAS[this.selArena];
            const mid = h * 0.45;
            ctx.fillStyle = a.bgTop; ctx.fillRect(0,0,w,mid);
            ctx.fillStyle = a.floor; ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(w,h); ctx.lineTo(w*0.8, mid); ctx.lineTo(w*0.2, mid); ctx.fill();
            ctx.strokeStyle = a.rope; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w*0.2, mid); ctx.lineTo(w*0.8, mid); ctx.moveTo(w*0.15, mid+40); ctx.lineTo(w*0.85, mid+40); ctx.stroke();
        },

        drawCharacter: function(ctx, p, isSelf, w, h) {
            const char = CHARACTERS[p.charId];
            const arms = p.visual;
            
            if (!isSelf) {
                const cx = p.head.x; const cy = p.head.y;
                const bodyG = ctx.createLinearGradient(cx-40, cy, cx+40, cy+200); 
                bodyG.addColorStop(0, char.color); bodyG.addColorStop(1, '#000');
                ctx.fillStyle = bodyG; ctx.beginPath(); ctx.moveTo(cx-50, cy+60); ctx.lineTo(cx+50, cy+60); ctx.lineTo(cx+30, cy+250); ctx.lineTo(cx-30, cy+250); ctx.fill();
                
                ctx.fillStyle = char.skin; ctx.beginPath(); ctx.arc(cx, cy, 45, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = char.hat; ctx.beginPath(); ctx.arc(cx, cy-15, 47, Math.PI, 0); ctx.fill(); ctx.fillRect(cx-50, cy-15, 100, 15);
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy-35, 15, 0, Math.PI*2); ctx.fill();
            }

            // Indicador de "Procurando Câmera"
            if (isSelf && !this.hasPose && this.state === 'FIGHT') {
                 ctx.fillStyle = 'rgba(255,0,0,0.7)'; 
                 ctx.font = 'bold 30px Arial'; 
                 ctx.textAlign = 'center';
                 ctx.fillText("PROCURANDO JOGADOR...", p.head.x, p.head.y - 80);
                 ctx.strokeStyle = '#fff'; ctx.lineWidth=2;
                 ctx.beginPath(); ctx.arc(p.head.x, p.head.y, 60, 0, Math.PI*2); ctx.stroke();
            }

            const drawArm = (arm) => {
                const width = isSelf ? 40 : 18;
                const scale = isSelf ? (1 + arm.z/300) : (0.8 + arm.z/300);
                
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                
                ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = width+4;
                ctx.beginPath(); ctx.moveTo(arm.s.x, arm.s.y); ctx.lineTo(arm.e.x, arm.e.y); ctx.stroke();
                ctx.strokeStyle = char.skin; ctx.lineWidth = width;
                ctx.beginPath(); ctx.moveTo(arm.s.x, arm.s.y); ctx.lineTo(arm.e.x, arm.e.y); ctx.stroke();

                ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = width+4;
                ctx.beginPath(); ctx.moveTo(arm.e.x, arm.e.y); ctx.lineTo(arm.w.x, arm.w.y); ctx.stroke();
                ctx.strokeStyle = char.skin; ctx.lineWidth = width;
                ctx.beginPath(); ctx.moveTo(arm.e.x, arm.e.y); ctx.lineTo(arm.w.x, arm.w.y); ctx.stroke();

                ctx.save(); ctx.translate(arm.w.x, arm.w.y); ctx.scale(scale, scale);
                const g = ctx.createRadialGradient(-10,-10,5,0,0,35);
                g.addColorStop(0,'#fff'); g.addColorStop(1, char.color);
                ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,35,0,Math.PI*2); ctx.fill();
                ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=3; ctx.stroke();
                ctx.restore();
            };

            drawArm(arms.armL);
            drawArm(arms.armR);

            if (p.guard && isSelf) {
                ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0,0,w,h);
                this.spawnMsg(w/2, h/2, "GUARD", "#0f0");
            }
        },

        drawBtn: function(ctx, id, txt, x, y, w, h, active) {
            this.uiButtons[id] = {x,y,w,h};
            ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=10;
            ctx.fillStyle = active ? '#e67e22' : '#34495e';
            ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x,y,w,h,15); else ctx.rect(x,y,w,h); ctx.fill();
            ctx.lineWidth=active?4:2; ctx.strokeStyle='#fff'; ctx.stroke();
            ctx.shadowBlur=0; ctx.fillStyle='#fff'; 
            ctx.font=`bold ${Math.floor(h*0.45)}px 'Russo One'`; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(txt, x+w/2, y+h/2+3);
        },

        uiMode: function(ctx,w,h) {
            const v = Math.min(w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.1}px 'Russo One'`;
            ctx.fillText("BOXING PRO", w/2, h*0.25);
            this.drawBtn(ctx, 'off', "OFFLINE (CPU)", w/2-v*0.35, h*0.45, v*0.7, v*0.15);
            this.drawBtn(ctx, 'on', "ONLINE (PVP)", w/2-v*0.35, h*0.65, v*0.7, v*0.15);
        },

        uiChar: function(ctx,w,h) {
            const v = Math.min(w,h);
            const c = CHARACTERS[this.selChar];
            ctx.fillStyle=c.color; ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#fff'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText(c.name, w/2, h*0.2);
            ctx.beginPath(); ctx.arc(w/2, h*0.45, v*0.2, 0, Math.PI*2); ctx.fill();
            this.drawBtn(ctx, 'next', "TROCAR", w*0.1, h*0.8, w*0.35, v*0.12);
            this.drawBtn(ctx, 'ok', "CONFIRMAR", w*0.55, h*0.8, w*0.35, v*0.12, true);
        },

        uiArena: function(ctx,w,h) {
            const v = Math.min(w,h);
            ctx.fillStyle='#fff'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText(ARENAS[this.selArena].name, w/2, h*0.2);
            this.drawBtn(ctx, 'next', "MUDAR", w*0.1, h*0.8, w*0.35, v*0.12);
            this.drawBtn(ctx, 'ok', "CALIBRAR", w*0.55, h*0.8, w*0.35, v*0.12, true);
        },

        uiCalib: function(ctx, w, h, pose) {
            ctx.fillStyle='#111'; ctx.fillRect(0,0,w,h);
            const v = Math.min(w,h);
            ctx.fillStyle='#0ff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.06}px 'Russo One'`;
            ctx.fillText("ABRA OS BRAÇOS (T-POSE)", w/2, h*0.15);
            
            const cx=w/2, cy=h*0.45;
            ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=10;
            ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy+100); ctx.stroke(); 
            ctx.beginPath(); ctx.moveTo(cx-100,cy); ctx.lineTo(cx+100,cy); ctx.stroke();

            if (this.p1.calib.active && pose && pose.keypoints) {
                const k = pose.keypoints;
                const drawP = (i,c) => { if(k[i] && k[i].score>0.2) { const p=Utils.toScreen(k[i],w,h); ctx.fillStyle=c; ctx.beginPath(); ctx.arc(p.x,p.y,10,0,7); ctx.fill(); } };
                drawP(9,'#0ff'); drawP(10,'#0ff');
                this.p1.calib.samples++;
            }

            const pct = Math.min(1, this.p1.calib.samples / 30);
            ctx.fillStyle='#333'; ctx.fillRect(w*0.2, h*0.7, w*0.6, 20);
            ctx.fillStyle='#0f0'; ctx.fillRect(w*0.2, h*0.7, w*0.6 * pct, 20);

            if (pct >= 1) this.drawBtn(ctx, 'done', "JOGAR!", w/2-v*0.25, h*0.85, v*0.5, v*0.12, true);
        },

        uiLobby: function(ctx,w,h) { ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h); ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font='40px Arial'; ctx.fillText("CONECTANDO...", w/2, h/2); },
        uiOver: function(ctx,w,h) { ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.fillRect(0,0,w,h); ctx.fillStyle='#fff'; ctx.font='60px Arial'; ctx.fillText(this.p1.hp>0?"VITÓRIA":"DERROTA", w/2, h*0.4); this.drawBtn(ctx, 'menu', "VOLTAR", w/2-100, h*0.7, 200, 60, true); },

        drawHUD: function(ctx, w, h) {
            const bw = w*0.35;
            ctx.fillStyle='#333'; ctx.fillRect(20,20,bw,25);
            ctx.fillStyle='#e74c3c'; ctx.fillRect(20,20,bw*(this.p1.hp/100),25);
            
            ctx.fillStyle='#333'; ctx.fillRect(w-20-bw,20,bw,25);
            ctx.fillStyle='#3498db'; ctx.fillRect(w-20-bw,20,bw*(this.p2.hp/100),25);
            
            ctx.fillStyle='#fff'; ctx.font="bold 30px 'Russo One'"; ctx.textAlign='center'; 
            ctx.fillText(Math.ceil(this.timer/60), w/2, 45);
        },

        spawnParticles: function(x,y,c) { for(let i=0;i<8;i++) this.particles.push({x,y,vx:(Math.random()-0.5)*15,vy:(Math.random()-0.5)*15,c,l:1}); },
        updateParticles: function(ctx) { this.particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.l-=0.05; ctx.globalAlpha=p.l; ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,7); ctx.fill(); }); ctx.globalAlpha=1; this.particles=this.particles.filter(p=>p.l>0); },
        spawnMsg: function(x,y,t,c) { this.msgs.push({x,y,t,c,l:40}); },
        drawMsgs: function(ctx) { this.msgs.forEach(m=>{ m.y--; m.l--; ctx.fillStyle=m.c; ctx.font="bold 40px Arial"; ctx.fillText(m.t,m.x,m.y); }); this.msgs=this.msgs.filter(m=>m.l>0); },
        endGame: function() { this.state='GAMEOVER'; }
    };

    if(window.System) window.System.registerGame('box_pro', 'Super Boxing', '🥊', Game, { camOpacity: 0.2 });

})();