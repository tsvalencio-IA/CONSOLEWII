// =============================================================================
// SUPER BOXING STADIUM: CHAMPIONSHIP EDITION (ULTIMATE MOBILE FIX V2)
// ARQUITETO: SENIOR DEV - ARMS VISUALIZATION & RESPONSIVE UI
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E CONFIGURAÇÕES
    // -----------------------------------------------------------------

    const CHARACTERS = [
        { id: 0, name: 'MARIO',   color: '#e74c3c', skin: '#ffccaa', hat: '#d32f2f', power: 1.0, speed: 1.0, hp: 100 },
        { id: 1, name: 'LUIGI',   color: '#2ecc71', skin: '#ffccaa', hat: '#27ae60', power: 0.8, speed: 1.2, hp: 100 },
        { id: 2, name: 'PEACH',   color: '#ff9ff3', skin: '#ffe0bd', hat: '#fd79a8', power: 0.7, speed: 1.4, hp: 90  },
        { id: 3, name: 'BOWSER',  color: '#f1c40f', skin: '#e67e22', hat: '#c0392b', power: 1.4, speed: 0.6, hp: 130 },
        { id: 4, name: 'WALUIGI', color: '#8e44ad', skin: '#ffccaa', hat: '#5e2d85', power: 1.1, speed: 0.9, hp: 100 }
    ];

    const ARENAS = [
        { id: 0, name: 'WORLD CIRCUIT',  bgTop: '#2c3e50', bgBot: '#34495e', rope: '#e74c3c', floor: '#ecf0f1' },
        { id: 1, name: 'BOWSER CASTLE',  bgTop: '#2d0e0e', bgBot: '#581414', rope: '#f1c40f', floor: '#2c2c2c' },
        { id: 2, name: 'PEACH GARDEN',   bgTop: '#00b894', bgBot: '#55efc4', rope: '#e17055', floor: '#81ecec' }
    ];

    const CONF = {
        ROUNDS: 3,
        ROUND_TIME: 60,
        PUNCH_THRESH: 10,    // Mais sensível para detectar socos mais fácil
        BLOCK_DIST: 120,     // Margem de defesa maior
        SMOOTHING: 0.8       // Movimento mais rápido e fiel (menos lag)
    };

    // Utils
    const Utils = {
        dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
        toScreen: (kp, w, h) => ({ 
            x: (1 - kp.x / 640) * w, // Espelhado
            y: (kp.y / 480) * h 
        }),
        isInside: (x, y, btn) => {
            // Hitbox extendida (padding) para facilitar toque no mobile
            const padding = 20;
            return x >= btn.x - padding && x <= btn.x + btn.w + padding && 
                   y >= btn.y - padding && y <= btn.y + btn.h + padding;
        }
    };

    // -----------------------------------------------------------------
    // 2. LÓGICA PRINCIPAL
    // -----------------------------------------------------------------

    const Game = {
        state: 'MODE_SELECT', 
        roomId: 'boxing_arena_global',
        isOnline: false,
        dbRef: null,
        
        // UI Layout System
        uiButtons: {}, 
        
        // Seleção
        selMode: 'OFFLINE',
        selChar: 0,
        selArena: 0,
        
        // Dados da Partida
        timer: 0,
        round: 1,
        frame: 0,
        
        // Entidades
        p1: { 
            hp: 0, maxHp: 0, stamina: 100, guard: false, charId: 0,
            head: {x:0, y:0}, 
            hands: { l: {x:0, y:0, z:0, state:'IDLE'}, r: {x:0, y:0, z:0, state:'IDLE'} },
            score: 0
        },
        
        p2: { 
            hp: 0, maxHp: 0, guard: false, charId: 0, id: null,
            head: {x:0, y:0},
            hands: { l: {x:0, y:0, z:0, state:'IDLE'}, r: {x:0, y:0, z:0, state:'IDLE'} },
            aiTimer: 0, isRemote: false
        },

        particles: [],
        msgs: [],
        lastSync: 0,

        // --- SISTEMA ---
        init: function() {
            this.state = 'MODE_SELECT';
            this.cleanup();
            if(window.System.msg) window.System.msg("SUPER BOXING");
            this.setupInput();
        },

        cleanup: function() {
            if (this.dbRef) try { this.dbRef.child('players/' + window.System.playerId).remove(); this.dbRef.off(); } catch(e){}
            window.System.canvas.onclick = null;
        },

        // --- SISTEMA DE INPUT (UI CLIQUE) ---
        setupInput: function() {
            window.System.canvas.onclick = (e) => {
                const rect = window.System.canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                
                const checkBtn = (name) => {
                    const btn = this.uiButtons[name];
                    return btn && Utils.isInside(clickX, clickY, btn);
                };

                if (this.state === 'MODE_SELECT') {
                    if (checkBtn('btnOffline')) this.setMode('OFFLINE');
                    else if (checkBtn('btnOnline')) this.setMode('ONLINE');
                } 
                else if (this.state === 'CHAR_SELECT') {
                    if (checkBtn('btnNextChar')) {
                        this.selChar = (this.selChar + 1) % CHARACTERS.length;
                        window.Sfx.play(600, 'square', 0.1);
                    }
                    else if (checkBtn('btnConfirm')) this.confirmChar();
                }
                else if (this.state === 'ARENA_SELECT') {
                    if (checkBtn('btnNextArena')) {
                        this.selArena = (this.selArena + 1) % ARENAS.length;
                        window.Sfx.play(600, 'square', 0.1);
                    }
                    else if (checkBtn('btnFight')) this.startGame();
                }
                else if (this.state === 'GAMEOVER') {
                    if (checkBtn('btnMenu')) this.init();
                }
            };
        },

        setMode: function(mode) {
            this.selMode = mode;
            this.isOnline = (mode === 'ONLINE' && !!window.DB);
            if (mode === 'ONLINE' && !window.DB) {
                window.System.msg("ERRO: OFFLINE");
                return;
            }
            this.state = 'CHAR_SELECT';
            window.Sfx.click();
        },

        confirmChar: function() {
            this.state = 'ARENA_SELECT';
            window.Sfx.click();
        },

        startGame: function() {
            this.p1.charId = this.selChar;
            const stats = CHARACTERS[this.selChar];
            this.p1.maxHp = stats.hp; this.p1.hp = stats.hp;
            this.p1.score = 0;
            this.p1.stamina = 100;
            
            // Posição inicial da cabeça para evitar lerp do zero
            const w = window.System.canvas.width;
            const h = window.System.canvas.height;
            this.p1.head = {x: w/2, y: h/2};
            this.p1.hands.l = {x: w*0.3, y: h*0.8, z:0, state:'IDLE'};
            this.p1.hands.r = {x: w*0.7, y: h*0.8, z:0, state:'IDLE'};
            
            if (this.isOnline) {
                this.connectLobby();
            } else {
                this.p2.charId = Math.floor(Math.random() * CHARACTERS.length);
                const aiStats = CHARACTERS[this.p2.charId];
                this.p2.maxHp = aiStats.hp; this.p2.hp = aiStats.hp;
                this.p2.isRemote = false;
                this.state = 'FIGHT';
                this.timer = CONF.ROUND_TIME * 60;
                window.System.msg("ROUND 1");
            }
        },

        connectLobby: function() {
            this.state = 'LOBBY';
            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            myRef.set({
                charId: this.selChar, hp: this.p1.hp, ready: true,
                arena: this.selArena, lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
            myRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', snap => {
                const players = snap.val();
                if (!players) return;
                const opponentId = Object.keys(players).find(id => id !== window.System.playerId);
                
                if (opponentId) {
                    const opData = players[opponentId];
                    if (this.state === 'LOBBY') {
                        this.p2.charId = opData.charId || 0;
                        this.p2.hp = opData.hp || 100;
                        this.p2.maxHp = CHARACTERS[this.p2.charId].hp;
                        this.p2.isRemote = true;
                        this.p2.id = opponentId;
                        this.state = 'FIGHT';
                        this.timer = CONF.ROUND_TIME * 60;
                        window.System.msg("VS " + CHARACTERS[this.p2.charId].name);
                    } else if (this.state === 'FIGHT') {
                        this.p2.hp = opData.hp;
                        if (opData.pose) {
                            this.p2.head = opData.pose.head;
                            this.p2.hands = opData.pose.hands;
                            this.p2.guard = opData.pose.guard;
                        }
                    }
                } else if (this.state === 'FIGHT') {
                    window.System.msg("OPONENTE SAIU");
                    this.state = 'GAMEOVER';
                }
            });
        },

        // -----------------------------------------------------------------
        // LOOP UPDATE
        // -----------------------------------------------------------------
        update: function(ctx, w, h, pose) {
            this.frame++;
            this.uiButtons = {}; 

            if (this.state !== 'FIGHT') {
                const g = ctx.createLinearGradient(0,0,0,h);
                g.addColorStop(0, '#1a1a2e'); g.addColorStop(1, '#16213e');
                ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
            }

            if (this.state === 'MODE_SELECT') { this.uiModeSelect(ctx, w, h); return; }
            if (this.state === 'CHAR_SELECT') { this.uiCharSelect(ctx, w, h); return; }
            if (this.state === 'ARENA_SELECT') { this.uiArenaSelect(ctx, w, h); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiGameOver(ctx, w, h); return; }

            // === LUTA ===
            this.processInput(w, h, pose);
            
            if (this.isOnline) this.syncOnline();
            else this.updateAI(w, h);

            this.drawArena(ctx, w, h);
            this.drawCharacter(ctx, this.p2, false, w, h); // Rival
            this.drawCharacter(ctx, this.p1, true, w, h);  // Player (POV)
            
            this.drawHUD(ctx, w, h);
            this.updateParticles(ctx);
            this.drawMsgs(ctx);

            if (this.timer > 0) this.timer--; else this.endRound();

            if (this.p1.hp <= 0 || this.p2.hp <= 0) {
                this.state = 'GAMEOVER';
                if(this.isOnline && this.dbRef) this.dbRef.child('players/' + window.System.playerId).remove();
            }

            return Math.floor(this.p1.score);
        },

        processInput: function(w, h, pose) {
            if (!pose || !pose.keypoints) return;
            
            const k = pose.keypoints;
            const nose = k[0] && k[0].score > 0.3 ? Utils.toScreen(k[0], w, h) : this.p1.head;
            const lWr  = k[9] && k[9].score > 0.3 ? Utils.toScreen(k[9], w, h) : this.p1.hands.l;
            const rWr  = k[10] && k[10].score > 0.3 ? Utils.toScreen(k[10], w, h) : this.p1.hands.r;

            // Movimento Rápido (Alta Fidelidade)
            const smooth = CONF.SMOOTHING;
            this.p1.head.x += (nose.x - this.p1.head.x) * smooth;
            this.p1.head.y += (nose.y - this.p1.head.y) * smooth;

            this.updateHand(this.p1.hands.l, lWr, 'left', w, h);
            this.updateHand(this.p1.hands.r, rWr, 'right', w, h);

            const dL = Utils.dist(this.p1.hands.l.x, this.p1.hands.l.y, this.p1.head.x, this.p1.head.y);
            const dR = Utils.dist(this.p1.hands.r.x, this.p1.hands.r.y, this.p1.head.x, this.p1.head.y);
            this.p1.guard = (dL < CONF.BLOCK_DIST && dR < CONF.BLOCK_DIST);
            
            if (this.p1.stamina < 100) this.p1.stamina += 0.5;
        },

        updateHand: function(hand, target, side, w, h) {
            const dx = target.x - hand.x;
            const dy = target.y - hand.y;
            const velocity = Math.hypot(dx, dy);
            
            hand.x = target.x;
            hand.y = target.y;

            if (velocity > CONF.PUNCH_THRESH && hand.state === 'IDLE' && this.p1.stamina > 10) {
                hand.state = 'PUNCH';
                hand.z = 0; 
                this.p1.stamina -= 12;
                if(window.Sfx) window.Sfx.play(200, 'noise', 0.1);
            }

            if (hand.state === 'PUNCH') {
                hand.z += 20; 
                if (hand.z > 60 && hand.z < 90) this.checkHit(side, hand, w, h);
                if (hand.z >= 120) hand.state = 'RETRACT';
            } 
            else if (hand.state === 'RETRACT') {
                hand.z -= 15;
                if (hand.z <= 0) { hand.z = 0; hand.state = 'IDLE'; }
            }
        },

        checkHit: function(side, hand, w, h) {
            const rX = w/2 + (this.p2.head.x - w/2) * 0.5;
            const rY = h/3 + (this.p2.head.y - h/3) * 0.5;
            
            if (Utils.dist(hand.x, hand.y, rX, rY) < 140) {
                if (this.p2.guard) {
                    this.spawnMsg(rX, rY, "BLOCKED", "#aaa");
                    window.Sfx.play(150, 'square', 0.1);
                } else {
                    const dmg = 6 * CHARACTERS[this.p1.charId].power;
                    this.p2.hp -= dmg;
                    this.p1.score += 100;
                    this.spawnParticle(rX, rY, '#ff0');
                    this.spawnMsg(rX, rY, Math.floor(dmg), "#f00");
                    window.Gfx.shakeScreen(15);
                    window.Sfx.hit();
                    if (this.isOnline) this.dbRef.child('players/' + this.p2.id).update({ hp: this.p2.hp });
                }
                hand.state = 'RETRACT';
            }
        },

        updateAI: function(w, h) {
            const stats = CHARACTERS[this.p2.charId];
            this.p2.head.x += ((w/2 + Math.sin(this.frame*0.05)*100) - this.p2.head.x) * 0.05;
            this.p2.head.y = h/3 + Math.cos(this.frame*0.04)*20;

            if (this.p2.aiTimer > 0) this.p2.aiTimer--;
            else {
                const rand = Math.random();
                if (rand < 0.04 * stats.speed) {
                    const hnd = Math.random()>0.5 ? this.p2.hands.l : this.p2.hands.r;
                    hnd.state = 'PUNCH'; hnd.z = 0;
                    this.p2.aiTimer = 50 / stats.speed;
                } else if (rand < 0.06) {
                    this.p2.guard = !this.p2.guard;
                    this.p2.aiTimer = 60;
                }
            }

            ['l', 'r'].forEach(s => {
                const hnd = this.p2.hands[s];
                const tx = this.p2.head.x + (s==='l'?-60:60);
                const ty = this.p2.head.y + 90;
                
                if (hnd.state === 'IDLE') {
                    hnd.x += (tx - hnd.x) * 0.1; hnd.y += (ty - hnd.y) * 0.1;
                } else if (hnd.state === 'PUNCH') {
                    hnd.z += 12 * stats.speed;
                    hnd.x += ((w/2) - hnd.x) * 0.2; hnd.y += ((h/2) - hnd.y) * 0.2;
                    if (hnd.z > 70 && hnd.z < 100) {
                        if (!this.p1.guard) {
                            this.p1.hp -= 4 * stats.power;
                            window.Gfx.shakeScreen(8);
                            this.spawnMsg(w/2, h/2, "OUCH", "#f00");
                            hnd.state = 'RETRACT';
                        } else {
                            hnd.state = 'RETRACT';
                            window.Sfx.play(100, 'sine', 0.1);
                        }
                    }
                    if (hnd.z > 120) hnd.state = 'RETRACT';
                } else {
                    hnd.z -= 15; if(hnd.z<=0) { hnd.z=0; hnd.state='IDLE'; }
                }
            });
        },

        syncOnline: function() {
            if (this.frame % 3 === 0) {
                this.dbRef.child('players/' + window.System.playerId).update({
                    hp: this.p1.hp,
                    pose: {
                        head: { x: Math.floor(this.p1.head.x), y: Math.floor(this.p1.head.y) },
                        hands: { 
                            l: { x: Math.floor(this.p1.hands.l.x), y: Math.floor(this.p1.hands.l.y), z: Math.floor(this.p1.hands.l.z), state: this.p1.hands.l.state },
                            r: { x: Math.floor(this.p1.hands.r.x), y: Math.floor(this.p1.hands.r.y), z: Math.floor(this.p1.hands.r.z), state: this.p1.hands.r.state }
                        },
                        guard: this.p1.guard
                    }
                });
            }
        },

        // -----------------------------------------------------------------
        // UI & MENUS (ESCALA MOBILE CORRIGIDA)
        // -----------------------------------------------------------------
        
        drawBtn: function(ctx, key, txt, x, y, w, h, active=false) {
            this.uiButtons[key] = {x, y, w, h};
            ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
            ctx.fillStyle = active ? "#e67e22" : "#34495e";
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 15) : ctx.rect(x, y, w, h);
            ctx.fill();
            ctx.lineWidth = active ? 4 : 2; ctx.strokeStyle = "#fff"; ctx.stroke();
            ctx.shadowBlur = 0; ctx.fillStyle = "#fff";
            ctx.font = `bold ${Math.floor(h*0.5)}px 'Russo One'`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(txt, x + w/2, y + h/2 + 2);
        },

        uiModeSelect: function(ctx, w, h) {
            const rem = Math.min(w, h) / 10; 
            ctx.fillStyle = "#fff"; ctx.font = `bold ${rem * 1.5}px 'Russo One'`; 
            ctx.textAlign = "center"; ctx.fillText("SUPER BOXING", w/2, h * 0.2);
            
            const btnW = Math.min(500, w * 0.85); // Botão mais largo
            const btnH = Math.max(60, h * 0.12); // Botão mais alto
            
            this.drawBtn(ctx, 'btnOffline', "OFFLINE (VS CPU)", w/2 - btnW/2, h * 0.4, btnW, btnH, this.selMode==='OFFLINE');
            this.drawBtn(ctx, 'btnOnline', "ONLINE (PVP)", w/2 - btnW/2, h * 0.6, btnW, btnH, this.selMode==='ONLINE');
        },

        uiCharSelect: function(ctx, w, h) {
            const rem = Math.min(w, h) / 10;
            const c = CHARACTERS[this.selChar];
            ctx.fillStyle = c.color; ctx.fillRect(0,0,w,h);
            
            ctx.fillStyle = "#fff"; ctx.font = `bold ${rem}px 'Russo One'`; ctx.textAlign="center";
            ctx.fillText("ESCOLHA SEU LUTADOR", w/2, h*0.15);

            const avatarSize = Math.min(w,h) * 0.25;
            ctx.beginPath(); ctx.arc(w/2, h*0.4, avatarSize, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = c.hat; ctx.beginPath(); ctx.arc(w/2, h*0.4 - 20, avatarSize, Math.PI, 0); ctx.fill();
            
            ctx.fillStyle = "#fff"; ctx.font = `bold ${rem*1.5}px 'Russo One'`;
            ctx.fillText(c.name, w/2, h*0.65);
            
            const btnW = Math.min(180, w * 0.4);
            const btnH = Math.max(50, h * 0.1);
            this.drawBtn(ctx, 'btnNextChar', "TROCAR", w/2 - btnW - 10, h*0.8, btnW, btnH);
            this.drawBtn(ctx, 'btnConfirm', "PRONTO", w/2 + 10, h*0.8, btnW, btnH, true);
        },

        uiArenaSelect: function(ctx, w, h) {
            const rem = Math.min(w, h) / 10;
            const a = ARENAS[this.selArena];
            const g = ctx.createLinearGradient(0,0,0,h);
            g.addColorStop(0, a.bgTop); g.addColorStop(1, a.bgBot);
            ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
            
            ctx.fillStyle = "#fff"; ctx.font = `bold ${rem}px 'Russo One'`; ctx.textAlign="center";
            ctx.fillText("ARENA", w/2, h*0.2);
            ctx.font = `bold ${rem*1.2}px 'Russo One'`; ctx.fillText(a.name, w/2, h*0.5);
            
            const btnW = Math.min(180, w * 0.4);
            const btnH = Math.max(50, h * 0.1);
            this.drawBtn(ctx, 'btnNextArena', "TROCAR", w/2 - btnW - 10, h*0.8, btnW, btnH);
            this.drawBtn(ctx, 'btnFight', "LUTAR!", w/2 + 10, h*0.8, btnW, btnH, true);
        },

        uiLobby: function(ctx, w, h) {
            const rem = Math.min(w, h) / 10;
            ctx.fillStyle = "#000"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.font = `bold ${rem}px 'Russo One'`;
            ctx.fillText("AGUARDANDO...", w/2, h/2);
            const rot = (Date.now() / 500) * Math.PI;
            ctx.save(); ctx.translate(w/2, h/2 + rem*2); ctx.rotate(rot);
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0,0,rem,0, 5); ctx.stroke();
            ctx.restore();
        },

        uiGameOver: function(ctx, w, h) {
            const rem = Math.min(w, h) / 10;
            ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
            const win = this.p1.hp > 0;
            ctx.fillStyle = win ? "#f1c40f" : "#e74c3c";
            ctx.font = `bold ${rem*2}px 'Russo One'`; ctx.textAlign="center";
            ctx.fillText(win ? "VITÓRIA!" : "DERROTA", w/2, h*0.4);
            ctx.fillStyle = "#fff"; ctx.font = `${rem}px sans-serif`;
            ctx.fillText("SCORE: " + this.p1.score, w/2, h*0.55);
            
            const btnW = Math.min(300, w * 0.6);
            const btnH = Math.max(60, h * 0.12);
            this.drawBtn(ctx, 'btnMenu', "MENU", w/2 - btnW/2, h*0.7, btnW, btnH, true);
        },

        // --- RENDER VISUAL ---
        drawArena: function(ctx, w, h) {
            const ar = ARENAS[this.selArena];
            const mid = h * 0.45;
            const g = ctx.createLinearGradient(0,0,0,mid);
            g.addColorStop(0, ar.bgTop); g.addColorStop(1, ar.bgBot);
            ctx.fillStyle = g; ctx.fillRect(0,0,w,mid);
            ctx.fillStyle = ar.floor;
            ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.lineTo(w * 0.8, mid); ctx.lineTo(w * 0.2, mid); ctx.fill();
            ctx.strokeStyle = ar.rope; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(w*0.2, mid); ctx.lineTo(w*0.8, mid); ctx.moveTo(w*0.15, mid+40); ctx.lineTo(w*0.85, mid+40); ctx.stroke();
        },

        drawCharacter: function(ctx, p, isSelf, w, h) {
            const char = CHARACTERS[p.charId];
            if (!isSelf) {
                // RIVAL (CORPO COMPLETO)
                const cx = p.head.x; const cy = p.head.y;
                // Sombra
                ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + 250, 80, 20, 0, 0, Math.PI*2); ctx.fill();
                // Corpo
                const bodyG = ctx.createLinearGradient(cx-40, cy, cx+40, cy+200); bodyG.addColorStop(0, char.color); bodyG.addColorStop(1, '#000');
                ctx.fillStyle = bodyG; ctx.beginPath(); ctx.moveTo(cx-50, cy+50); ctx.lineTo(cx+50, cy+50); ctx.lineTo(cx+30, cy+250); ctx.lineTo(cx-30, cy+250); ctx.fill();
                // Cabeça
                ctx.fillStyle = char.skin; ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = char.hat; ctx.beginPath(); ctx.arc(cx, cy-20, 52, Math.PI, 0); ctx.fill(); ctx.fillRect(cx-55, cy-20, 110, 15);
                // Rosto
                ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(cx-15, cy-5, 5, 10, 0, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx+15, cy-5, 5, 10, 0, 0, Math.PI*2); ctx.fill();
                
                this.drawGlove(ctx, p.hands.l, char.color, false);
                this.drawGlove(ctx, p.hands.r, char.color, false);
                if(p.guard) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, 80, 0, Math.PI*2); ctx.stroke(); }
            } else {
                // PLAYER (POV COM BRAÇOS ESTICADOS)
                ctx.lineCap = 'round';
                
                // Função para desenhar braço
                const drawArm = (start, hand, side) => {
                    ctx.strokeStyle = char.skin; // Cor da pele
                    ctx.lineWidth = 18;
                    
                    // Simula profundidade: a mão sobe na tela quando 'z' aumenta (soco)
                    // O braço conecta o canto inferior à luva
                    let handVisualY = hand.y + (100 - hand.z); 
                    
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(hand.x, handVisualY);
                    ctx.stroke();
                    
                    // Manga da camisa
                    ctx.strokeStyle = char.color;
                    ctx.lineWidth = 22;
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(start.x + (hand.x - start.x)*0.3, start.y + (handVisualY - start.y)*0.3);
                    ctx.stroke();
                };

                // Braço Esquerdo (Sai do canto inferior esquerdo)
                drawArm({x: w*0.1, y: h+50}, p.hands.l, 'left');
                // Braço Direito (Sai do canto inferior direito)
                drawArm({x: w*0.9, y: h+50}, p.hands.r, 'right');

                ctx.globalAlpha = 0.9;
                this.drawGlove(ctx, p.hands.l, char.color, true);
                this.drawGlove(ctx, p.hands.r, char.color, true);
                ctx.globalAlpha = 1.0;
                
                if(p.guard) { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0,0,w,h); this.spawnMsg(w/2, h/2, "DEFESA", "#0f0", 1); }
            }
        },

        drawGlove: function(ctx, hand, color, isSelf) {
            let x = hand.x; let y = hand.y; let s = 1.0;
            if (isSelf) { 
                s = 1.3 + (hand.z * 0.015); // Luva cresce ao socar
                y += (100 - hand.z); // Sobe na tela
            } else { 
                s = 0.8 + (hand.z * 0.015); // Cresce vindo
                y += (hand.z * 1.5); 
            }
            ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
            if (hand.state === 'PUNCH') { ctx.shadowColor = color; ctx.shadowBlur = 25; }
            const g = ctx.createRadialGradient(-10, -10, 5, 0, 0, 40); g.addColorStop(0, '#fff'); g.addColorStop(1, color);
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 45, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,45,0,Math.PI*2); ctx.stroke();
            ctx.restore();
        },

        drawHUD: function(ctx, w, h) {
            const barW = w * 0.35;
            const barH = Math.max(20, h*0.03);
            
            // P1
            ctx.fillStyle = "#333"; ctx.fillRect(20, 20, barW, barH);
            ctx.fillStyle = "#e74c3c"; ctx.fillRect(20, 20, barW * (Math.max(0,this.p1.hp)/this.p1.maxHp), barH);
            ctx.fillStyle = "#fff"; ctx.textAlign="left"; ctx.font="bold 20px sans-serif";
            ctx.fillText(CHARACTERS[this.p1.charId].name, 20, 20 + barH + 25);
            ctx.fillStyle = "#f39c12"; ctx.fillRect(20, 20 + barH + 8, barW * (this.p1.stamina/100), 6);

            // P2
            const p2Max = this.p2.maxHp || 100;
            ctx.fillStyle = "#333"; ctx.fillRect(w - 20 - barW, 20, barW, barH);
            ctx.fillStyle = "#3498db"; ctx.fillRect(w - 20 - barW * (Math.max(0,this.p2.hp)/p2Max), 20, barW * (Math.max(0,this.p2.hp)/p2Max), barH);
            ctx.fillStyle = "#fff"; ctx.textAlign="right";
            ctx.fillText(this.isOnline ? "RIVAL" : "CPU", w - 20, 20 + barH + 25);

            ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.font="bold 40px 'Russo One'";
            ctx.fillText(Math.ceil(this.timer/60), w/2, 60);
        },

        spawnParticle: function(x, y, c) { for(let i=0; i<10; i++) this.particles.push({x, y, vx:(Math.random()-0.5)*15, vy:(Math.random()-0.5)*15, life:1, c}); },
        updateParticles: function(ctx) { this.particles.forEach((p,i) => { p.x+=p.vx; p.y+=p.vy; p.life-=0.05; ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill(); }); ctx.globalAlpha=1; this.particles = this.particles.filter(p=>p.life>0); },
        spawnMsg: function(x, y, t, c, l=40) { this.msgs.push({x, y, t, c, life: l}); },
        drawMsgs: function(ctx) { this.msgs.forEach(m => { m.y-=1; m.life--; ctx.fillStyle=m.c; ctx.font="bold 40px 'Russo One'"; ctx.textAlign="center"; ctx.fillText(m.t, m.x, m.y); }); this.msgs = this.msgs.filter(m=>m.life>0); },
        endRound: function() { if (this.round < CONF.ROUNDS) { this.round++; this.timer = CONF.ROUND_TIME * 60; window.System.msg("ROUND " + this.round); } else { this.state = 'GAMEOVER'; window.System.msg("TIME OVER"); } }
    };

    if(window.System) window.System.registerGame('box_pro', 'Super Boxing', '🥊', Game, { camOpacity: 0.2 });