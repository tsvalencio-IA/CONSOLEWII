// =============================================================================
// SUPER BOXING STADIUM: CHAMPIONSHIP EDITION (GOLD MASTER)
// ARQUITETO: SENIOR DEV - TRUE 1:1 SIMULATION & ROBUST TRACKING
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E CONFIGURAÇÕES
    // -----------------------------------------------------------------

    const CHARACTERS = [
        { id: 0, name: 'MARIO',   color: '#e74c3c', skin: '#ffccaa', hat: '#d32f2f', power: 1.0, speed: 1.0 },
        { id: 1, name: 'LUIGI',   color: '#2ecc71', skin: '#ffccaa', hat: '#27ae60', power: 0.9, speed: 1.1 },
        { id: 2, name: 'PEACH',   color: '#ff9ff3', skin: '#ffe0bd', hat: '#fd79a8', power: 0.8, speed: 1.3 },
        { id: 3, name: 'BOWSER',  color: '#f1c40f', skin: '#e67e22', hat: '#c0392b', power: 1.4, speed: 0.7 },
        { id: 4, name: 'WALUIGI', color: '#8e44ad', skin: '#ffccaa', hat: '#5e2d85', power: 1.1, speed: 0.9 }
    ];

    const ARENAS = [
        { id: 0, name: 'TRAINING GYM',  bgTop: '#34495e', bgBot: '#2c3e50', rope: '#bdc3c7', floor: '#95a5a6' },
        { id: 1, name: 'WORLD CIRCUIT', bgTop: '#2980b9', bgBot: '#2c3e50', rope: '#e74c3c', floor: '#ecf0f1' },
        { id: 2, name: 'CHAMPION RING', bgTop: '#8e44ad', bgBot: '#2c2c54', rope: '#f1c40f', floor: '#f5f6fa' }
    ];

    const CONF = {
        ROUNDS: 3,
        ROUND_TIME: 60,
        VELOCITY_THRESH: 4,   // Sensibilidade ajustada
        MIN_CONFIDENCE: 0.2,  // Aceita tracking mesmo com luz média
        SMOOTHING: 0.65       // Suavização para remover tremedeira da webcam
    };

    const Utils = {
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
        lerp: (a, b, t) => a + (b - a) * t,
        lerpPoint: (p1, p2, t) => ({ x: Utils.lerp(p1.x, p2.x, t), y: Utils.lerp(p1.y, p2.y, t) }),
        
        // Mapeamento corrigido para tela cheia
        toScreen: (kp, w, h) => ({ 
            x: (1 - kp.x / 640) * w, // Espelhado horizontalmente
            y: (kp.y / 480) * h 
        }),
        
        isInside: (x, y, btn) => {
            const pad = 20;
            return x >= btn.x - pad && x <= btn.x + btn.w + pad && 
                   y >= btn.y - pad && y <= btn.y + btn.h + pad;
        }
    };

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO (STATE MACHINE)
    // -----------------------------------------------------------------

    const Game = {
        state: 'MODE_SELECT', // MODE_SELECT, CHAR_SELECT, ARENA_SELECT, CALIBRATE, LOBBY, FIGHT, GAMEOVER
        roomId: 'boxing_v9_master',
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
        
        // --- JOGADOR (P1) ---
        p1: { 
            hp: 100, maxHp: 100, stamina: 100, score: 0,
            head: {x:0, y:0},
            shoulders: { l:{x:0,y:0}, r:{x:0,y:0} },
            elbows: { l:{x:0,y:0}, r:{x:0,y:0} },
            hands: { 
                l: {x:0, y:0, z:0, state:'IDLE', vel:0}, 
                r: {x:0, y:0, z:0, state:'IDLE', vel:0} 
            },
            guard: false,
            calib: { 
                active: false,
                samples: 0,
                maxReach: 120, // Distância Ombro -> Punho (esticado)
                progress: 0
            }
        },

        // --- OPONENTE (P2 - IA ou NETWORK) ---
        p2: { 
            hp: 100, maxHp: 100, id: null, isRemote: false, charId: 0,
            head: {x:0, y:0},
            shoulders: { l:{x:0,y:0}, r:{x:0,y:0} },
            elbows: { l:{x:0,y:0}, r:{x:0,y:0} },
            hands: { l: {x:0, y:0, z:0, state:'IDLE'}, r: {x:0, y:0, z:0, state:'IDLE'} },
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
            if(window.System.msg) window.System.msg("SIMULADOR DE BOXE");
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
                
                const checkBtn = (id) => this.uiButtons[id] && Utils.isInside(x, y, this.uiButtons[id]);

                if (this.state === 'MODE_SELECT') {
                    if (checkBtn('off')) this.setMode('OFFLINE');
                    if (checkBtn('on')) this.setMode('ONLINE');
                } else if (this.state === 'CHAR_SELECT') {
                    if (checkBtn('next')) { this.selChar = (this.selChar+1)%CHARACTERS.length; window.Sfx.play(600,'square',0.1); }
                    if (checkBtn('ok')) { this.state = 'ARENA_SELECT'; window.Sfx.click(); }
                } else if (this.state === 'ARENA_SELECT') {
                    if (checkBtn('next')) { this.selArena = (this.selArena+1)%ARENAS.length; window.Sfx.play(600,'square',0.1); }
                    if (checkBtn('ok')) this.startCalib();
                } else if (this.state === 'CALIBRATE') {
                    if (checkBtn('done') && this.p1.calib.progress > 20) this.finishCalib();
                } else if (this.state === 'GAMEOVER') {
                    if (checkBtn('menu')) this.init();
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
            this.p1.calib.progress = 0;
            this.p1.calib.maxReach = 100;
            this.p1.calib.active = true;
            window.System.msg("POSIÇÃO DE GUARDA");
        },

        finishCalib: function() {
            this.p1.calib.active = false;
            // Garante que maxReach tenha um valor sensato se o usuário não se mexeu muito
            this.p1.calib.maxReach = Math.max(80, this.p1.calib.maxReach);
            this.startGame();
            window.Sfx.click();
        },

        startGame: function() {
            this.p1.hp = 100;
            this.p1.score = 0;
            this.round = 1;
            this.timer = CONF.ROUND_TIME * 60;
            
            // Inicializa posições padrão para evitar glitch no primeiro frame
            const w = window.System.canvas.width;
            const h = window.System.canvas.height;
            this.p1.head = {x: w/2, y: h/2};
            this.p1.shoulders = {l: {x: w*0.3, y: h}, r: {x: w*0.7, y: h}};
            this.p1.hands = { 
                l: {x: w*0.3, y: h*0.7, z:0, state:'IDLE', vel:0}, 
                r: {x: w*0.7, y: h*0.7, z:0, state:'IDLE', vel:0} 
            };

            if (this.isOnline) {
                this.connectLobby();
            } else {
                // Setup CPU
                this.p2.charId = Math.floor(Math.random() * CHARACTERS.length);
                this.p2.hp = 100;
                this.p2.isRemote = false;
                
                // Inicializa IA no centro
                this.p2.head = {x: w/2, y: h/3};
                this.p2.shoulders = {l: {x: w/2-60, y: h/3+100}, r: {x: w/2+60, y: h/3+100}};
                this.p2.elbows = {l: {x: w/2-80, y: h/3+150}, r: {x: w/2+80, y: h/3+150}};
                this.p2.hands = { l: {x: w/2-40, y: h/3+80, z:0}, r: {x: w/2+40, y: h/3+80, z:0} };

                this.state = 'FIGHT';
                window.System.msg("LUTA!");
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
                            // Sincronia total do esqueleto remoto
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

            // 1. RASTREAMENTO (Sempre roda para atualizar p1)
            this.processInput(w, h, pose);

            // 2. FUNDO (Menus)
            if (this.state !== 'FIGHT') {
                const g = ctx.createLinearGradient(0,0,0,h);
                g.addColorStop(0, '#1a1a2e'); g.addColorStop(1, '#16213e');
                ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
            }

            // 3. MÁQUINA DE ESTADOS
            switch(this.state) {
                case 'MODE_SELECT': this.uiMode(ctx, w, h); return;
                case 'CHAR_SELECT': this.uiChar(ctx, w, h); return;
                case 'ARENA_SELECT': this.uiArena(ctx, w, h); return;
                case 'CALIBRATE': this.uiCalib(ctx, w, h, pose); return;
                case 'LOBBY': this.uiLobby(ctx, w, h); return;
                case 'GAMEOVER': this.uiOver(ctx, w, h); return;
                case 'FIGHT': this.updateFight(ctx, w, h); break;
            }

            return Math.floor(this.p1.score);
        },

        updateFight: function(ctx, w, h) {
            // Lógica
            if (this.isOnline) this.syncNetwork();
            else this.updateAI(w, h);

            if (this.timer > 0) this.timer--; else this.endGame();
            if (this.p1.hp <= 0 || this.p2.hp <= 0) this.endGame();

            // Render
            this.drawArena(ctx, w, h);
            this.drawCharacter(ctx, this.p2, false, w, h); // Rival (Fundo)
            this.drawCharacter(ctx, this.p1, true, w, h);  // Player (POV)
            
            this.drawHUD(ctx, w, h);
            this.updateParticles(ctx);
            this.drawMsgs(ctx);
        },

        // =================================================================
        // INPUT E FÍSICA (1:1 FIDELITY)
        // =================================================================

        processInput: function(w, h, pose) {
            if (!pose || !pose.keypoints) return;
            const k = pose.keypoints;
            const thresh = CONF.MIN_CONFIDENCE;

            // Helper: Pega ponto da câmera ou fallback (mantém posição anterior)
            const getP = (idx, prev) => (k[idx] && k[idx].score > thresh) ? Utils.toScreen(k[idx], w, h) : prev;

            // 1. DADOS CRUS (RAW)
            const nose = getP(0, this.p1.head);
            const ls = getP(5, {x: w*0.3, y: h}); // Ombro E
            const rs = getP(6, {x: w*0.7, y: h}); // Ombro D
            const le = getP(7, {x: ls.x, y: ls.y+50}); // Cotovelo E (fallback perto do ombro)
            const re = getP(8, {x: rs.x, y: rs.y+50}); // Cotovelo D
            const lw = getP(9, this.p1.hands.l); // Punho E
            const rw = getP(10, this.p1.hands.r); // Punho D

            // 2. SUAVIZAÇÃO (LERP) PARA REDUZIR JITTER
            const s = CONF.SMOOTHING;
            this.p1.head = Utils.lerpPoint(this.p1.head, nose, s);
            
            // Ombros fixos na base para POV, mas se movem levemente com a cabeça
            const povShoulderY = h + 60; // Fora da tela embaixo
            this.p1.shoulders.l = { x: Utils.lerp(w*0.1, w*0.4, (nose.x/w)), y: povShoulderY };
            this.p1.shoulders.r = { x: Utils.lerp(w*0.9, w*0.6, (nose.x/w)), y: povShoulderY };

            // 3. COTOVELOS (HÍBRIDO: REAL + CORREÇÃO VISUAL)
            // Usamos o cotovelo real detectado, mas suavizado
            this.p1.elbows.l = Utils.lerpPoint(this.p1.elbows.l, le, s);
            this.p1.elbows.r = Utils.lerpPoint(this.p1.elbows.r, re, s);

            // 4. MÃOS E SOCOS (LÓGICA 1:1)
            this.processHand('l', lw, this.p1.shoulders.l, w, h);
            this.processHand('r', rw, this.p1.shoulders.r, w, h);

            // 5. GUARDA
            const dL = Utils.dist(this.p1.hands.l, nose);
            const dR = Utils.dist(this.p1.hands.r, nose);
            this.p1.guard = (dL < CONF.BLOCK_DIST && dR < CONF.BLOCK_DIST);
            
            if (this.p1.stamina < 100) this.p1.stamina += 0.4;
        },

        processHand: function(side, rawPos, shoulderPos, w, h) {
            const hand = this.p1.hands[side];
            
            // Velocidade Instantânea (para detectar impacto)
            const dx = rawPos.x - hand.x;
            const dy = rawPos.y - hand.y;
            const speed = Math.hypot(dx, dy);

            // Atualiza posição XY (Segue 100% a câmera)
            hand.x = Utils.lerp(hand.x, rawPos.x, CONF.SMOOTHING);
            hand.y = Utils.lerp(hand.y, rawPos.y, CONF.SMOOTHING);
            hand.vel = speed;

            // Z-DEPTH (PROFUNDIDADE SIMULADA)
            // Calculamos o quão "esticado" o braço está em relação ao ombro
            // A calibração define o "máximo alcance". 
            const distFromShoulder = Utils.dist(rawPos, shoulderPos); // Distância 2D na tela
            
            // Se a distância na tela é pequena (punho perto do ombro/rosto), Z é baixo (perto)
            // Se a distância é grande (punho longe), Z é alto (soco esticado)
            // MAS em POV, "longe do ombro" visualmente pode ser "para cima".
            // Truque: Soco é geralmente Y negativo (para cima na tela) ou centro.
            
            let extension = 0;
            // Normaliza com base na calibração
            if (this.p1.calib.maxReach > 0) {
                 extension = Math.min(1.5, distFromShoulder / this.p1.calib.maxReach);
            }
            
            // Mapeia extensão para Z visual (0 a 100+)
            const targetZ = Math.max(0, (extension - 0.4) * 200); 
            hand.z = Utils.lerp(hand.z, targetZ, 0.2);

            // Estado de Soco
            if (speed > CONF.VELOCITY_THRESH && extension > 0.8) {
                hand.state = 'PUNCH';
            } else {
                hand.state = 'IDLE';
            }

            // Colisão
            if (hand.state === 'PUNCH' && hand.z > 50) {
                this.checkHit(hand, speed);
            }
        },

        checkHit: function(hand, speed) {
            // Hitbox do Rival (Centro da tela ajustado pela cabeça dele)
            const rX = this.p2.head.x;
            const rY = this.p2.head.y;
            
            if (Utils.dist(hand, {x:rX, y:rY}) < 100) {
                if (this.p2.guard) {
                    this.spawnMsg(rX, rY, "BLOCKED", "#aaa");
                    window.Sfx.play(150, 'square', 0.1);
                } else {
                    const power = CHARACTERS[this.p1.charId].power;
                    const dmg = Math.floor(5 * power + (speed * 0.2)); 
                    this.p2.hp -= dmg;
                    this.p1.score += dmg * 10;
                    this.spawnParticles(rX, rY, '#ff0');
                    this.spawnMsg(rX, rY, dmg, "#f00");
                    window.Gfx.shakeScreen(10);
                    window.Sfx.hit();
                    
                    if (this.isOnline) {
                        this.dbRef.child('players/' + this.p2.id).update({ hp: this.p2.hp });
                    }
                }
            }
        },

        updateAI: function(w, h) {
            const cpu = this.p2;
            const t = this.frame * 0.05;
            
            // Movimento da Cabeça
            cpu.head.x = Utils.lerp(cpu.head.x, (w/2) + Math.sin(t)*100, 0.05);
            cpu.head.y = Utils.lerp(cpu.head.y, (h/3) + Math.cos(t*0.5)*30, 0.05);

            // Ombros seguem cabeça
            cpu.shoulders.l = { x: cpu.head.x - 60, y: cpu.head.y + 80 };
            cpu.shoulders.r = { x: cpu.head.x + 60, y: cpu.head.y + 80 };

            // IA Lógica
            if (cpu.ai.timer-- <= 0) {
                const r = Math.random();
                if (r < 0.04) { // Soco
                    const hand = Math.random()>0.5 ? cpu.hands.l : cpu.hands.r;
                    hand.z = 150; // Estica
                    hand.x = w/2; hand.y = h/2 + 100; // Mira no player
                    cpu.ai.timer = 50;
                    if (!this.p1.guard) { this.p1.hp -= 5; window.Gfx.shakeScreen(5); this.spawnMsg(w/2, h/2, "OUCH", "#f00"); }
                } else if (r < 0.06) {
                    cpu.guard = !cpu.guard;
                    cpu.ai.timer = 60;
                } else {
                    cpu.hands.l.z = 0; cpu.hands.r.z = 0;
                }
            }
            
            // Animação Mãos Idle
            if (cpu.hands.l.z < 10) { 
                cpu.hands.l.x = Utils.lerp(cpu.hands.l.x, cpu.head.x - 50, 0.1);
                cpu.hands.l.y = Utils.lerp(cpu.hands.l.y, cpu.head.y + 60, 0.1);
            }
            if (cpu.hands.r.z < 10) {
                cpu.hands.r.x = Utils.lerp(cpu.hands.r.x, cpu.head.x + 50, 0.1);
                cpu.hands.r.y = Utils.lerp(cpu.hands.r.y, cpu.head.y + 60, 0.1);
            }
        },

        syncNetwork: function() {
            if (this.frame % 3 !== 0) return;
            this.dbRef.child('players/' + window.System.playerId).update({
                hp: this.p1.hp,
                pose: {
                    h: {x:Math.round(this.p1.head.x), y:Math.round(this.p1.head.y)},
                    s: this.p1.shoulders,
                    e: this.p1.elbows, // Envia cotovelos reais
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

        // Função de Desenho de Braço (Ombro -> Cotovelo -> Mão)
        drawArmSegment: function(ctx, s, e, w, color, width) {
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            // Desenha Borda
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = width + 4;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.lineTo(w.x, w.y); ctx.stroke();
            // Desenha Pele
            ctx.strokeStyle = color; ctx.lineWidth = width;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.lineTo(w.x, w.y); ctx.stroke();
        },

        drawCharacter: function(ctx, p, isSelf, w, h) {
            const char = CHARACTERS[p.charId];
            
            if (!isSelf) { // RIVAL
                const cx = p.head.x; const cy = p.head.y;
                // Corpo
                const bg = ctx.createLinearGradient(cx-40,cy,cx+40,cy+200); bg.addColorStop(0, char.color); bg.addColorStop(1,'#000');
                ctx.fillStyle=bg; ctx.beginPath(); ctx.moveTo(cx-50,cy+60); ctx.lineTo(cx+50,cy+60); ctx.lineTo(cx+30,cy+250); ctx.lineTo(cx-30,cy+250); ctx.fill();
                
                // Braços IA (Z-sorted)
                this.drawArmSegment(ctx, p.shoulders.l, p.elbows?.l || {x:cx-70,y:cy+100}, p.hands.l, char.skin, 18);
                this.drawArmSegment(ctx, p.shoulders.r, p.elbows?.r || {x:cx+70,y:cy+100}, p.hands.r, char.skin, 18);

                // Cabeça
                ctx.fillStyle=char.skin; ctx.beginPath(); ctx.arc(cx,cy,45,0,7); ctx.fill();
                ctx.fillStyle=char.hat; ctx.beginPath(); ctx.arc(cx,cy-15,47,Math.PI,0); ctx.fill(); ctx.fillRect(cx-50,cy-15,100,15);
                ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(cx,cy-35,15,0,7); ctx.fill();
                ctx.fillStyle='#000'; ctx.font="bold 20px Arial"; ctx.textAlign='center'; ctx.fillText(char.name[0], cx, cy-28);
                
                // Luvas
                this.drawGlove(ctx, p.hands.l, char.color, 0.8 + p.hands.l.z/300);
                this.drawGlove(ctx, p.hands.r, char.color, 0.8 + p.hands.r.z/300);
            } else { // PLAYER
                // POV - Braços saem da base (ombros virtuais)
                this.drawArmSegment(ctx, p.shoulders.l, p.elbows.l, p.hands.l, char.skin, 40);
                this.drawArmSegment(ctx, p.shoulders.r, p.elbows.r, p.hands.r, char.skin, 40);
                
                // Luvas (maiores e z-scale)
                this.drawGlove(ctx, p.hands.l, char.color, 1.2 + p.hands.l.z/300);
                this.drawGlove(ctx, p.hands.r, char.color, 1.2 + p.hands.r.z/300);
            }
        },

        drawGlove: function(ctx, h, color, s) {
            ctx.save(); ctx.translate(h.x, h.y); ctx.scale(s, s);
            const g = ctx.createRadialGradient(-10,-10,5,0,0,35); g.addColorStop(0,'#fff'); g.addColorStop(1,color);
            ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,35,0,7); ctx.fill();
            ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=3; ctx.stroke();
            ctx.restore();
        },

        // --- UI & CALIBRAÇÃO VISUAL ---
        uiCalibrate: function(ctx, w, h, pose) {
            ctx.fillStyle='#111'; ctx.fillRect(0,0,w,h);
            const v = Math.min(w,h);
            
            // Título
            ctx.fillStyle='#0ff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.06}px 'Russo One'`;
            ctx.fillText("CALIBRAÇÃO", w/2, h*0.15);
            ctx.font=`${v*0.04}px sans-serif`; ctx.fillStyle='#fff';
            ctx.fillText("FAÇA UMA POSE DE 'T' (BRAÇOS ABERTOS)", w/2, h*0.25);

            let tracking = false;
            // Visualização do Esqueleto
            if(pose && pose.keypoints) {
                const k = pose.keypoints;
                const thresh = CONF.MIN_CONFIDENCE;
                
                // Desenha pontos detectados
                const drawPt = (i, c) => {
                    if(k[i] && k[i].score > thresh) {
                        const p = Utils.toScreen(k[i], w, h);
                        ctx.fillStyle=c; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, 7); ctx.fill();
                        return p;
                    } return null;
                };

                const n = drawPt(0, '#fff'); // Nariz
                const l = drawPt(9, '#0ff'); // Mão E
                const r = drawPt(10, '#0ff'); // Mão D
                
                if (l && r && n) {
                    tracking = true;
                    // Mede envergadura
                    const span = Utils.dist(l, r);
                    if (span > this.p1.calib.maxReach) this.p1.calib.maxReach = span / 2; // Metade da envergadura = alcance aprox
                    
                    if (span > 100) this.p1.calib.progress = Math.min(100, this.p1.calib.progress + 2);
                }
            }

            // Barra Progresso
            ctx.fillStyle='#333'; ctx.fillRect(w*0.2, h*0.5, w*0.6, 20);
            ctx.fillStyle=tracking ? '#0f0' : '#f00'; ctx.fillRect(w*0.2, h*0.5, w*0.6 * (this.p1.calib.progress/100), 20);

            if (this.p1.calib.progress > 90) {
                this.drawBtn(ctx, 'done', "JOGAR AGORA!", w/2-v*0.3, h*0.7, v*0.6, v*0.15, true);
            }
        },

        // --- MENUS COMUNS ---
        drawBtn: function(ctx, id, txt, x, y, w, h, active) {
            this.uiButtons[id] = {x,y,w,h};
            ctx.fillStyle = active ? '#e67e22' : '#34495e';
            ctx.beginPath(); ctx.rect(x,y,w,h); ctx.fill();
            ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.stroke();
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.font=`bold ${h*0.5}px 'Russo One'`;
            ctx.fillText(txt, x+w/2, y+h/2);
        },

        uiMode: function(ctx,w,h) {
            const v = Math.min(w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.1}px 'Russo One'`;
            ctx.fillText("SUPER BOXING", w/2, h*0.2);
            this.drawBtn(ctx, 'off', "OFFLINE", w/2-v*0.3, h*0.4, v*0.6, v*0.15);
            this.drawBtn(ctx, 'on', "ONLINE", w/2-v*0.3, h*0.6, v*0.6, v*0.15);
        },

        uiChar: function(ctx,w,h) {
            const v = Math.min(w,h);
            const c = CHARACTERS[this.selChar];
            ctx.fillStyle=c.color; ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#fff'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText("ESCOLHA: " + c.name, w/2, h*0.2);
            this.drawBtn(ctx, 'next', "PRÓXIMO", w*0.1, h*0.8, w*0.35, v*0.15);
            this.drawBtn(ctx, 'ok', "OK", w*0.55, h*0.8, w*0.35, v*0.15, true);
        },

        uiArena: function(ctx,w,h) {
            const v = Math.min(w,h);
            ctx.fillStyle='#fff'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText("ARENA: " + ARENAS[this.selArena].name, w/2, h*0.2);
            this.drawBtn(ctx, 'next', "MUDAR", w*0.1, h*0.8, w*0.35, v*0.15);
            this.drawBtn(ctx, 'ok', "CALIBRAR", w*0.55, h*0.8, w*0.35, v*0.15, true);
        },

        uiLobby: function(ctx,w,h) {
            const v = Math.min(w,h);
            ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font=`bold ${v*0.08}px 'Russo One'`;
            ctx.fillText("PROCURANDO...", w/2, h/2);
        },

        uiOver: function(ctx,w,h) {
            ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.fillRect(0,0,w,h);
            const v = Math.min(w,h);
            ctx.fillStyle='#fff'; ctx.font=`bold ${v*0.1}px 'Russo One'`;
            ctx.fillText(this.p1.hp>0?"VITÓRIA!":"DERROTA", w/2, h*0.4);
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