// =============================================================================
// SUPER BOXING STADIUM: CHAMPIONSHIP EDITION (ONLINE & OFFLINE)
// ARQUITETO: SENIOR DEV V99 - FULL 3D RENDER & NETCODE
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E CONFIGURAÇÕES VISUAIS
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
        GRAVITY: 0.5,
        PUNCH_THRESH: 15,
        BLOCK_DIST: 90,
        REACH: 160
    };

    // Utils de renderização 3D e Vetores
    const Utils = {
        map: (val, min, max, nMin, nMax) => (val - min) * (nMax - nMin) / (max - min) + nMin,
        dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
        toScreen: (kp, w, h) => ({ x: (1 - kp.x / 640) * w, y: (kp.y / 480) * h })
    };

    // -----------------------------------------------------------------
    // 2. LÓGICA PRINCIPAL
    // -----------------------------------------------------------------

    const Game = {
        state: 'MODE_SELECT', // MODE_SELECT, CHAR_SELECT, ARENA_SELECT, LOBBY, FIGHT, GAMEOVER
        roomId: 'boxing_arena_global',
        isOnline: false,
        dbRef: null,
        
        // Seleção
        selMode: 'OFFLINE',
        selChar: 0,
        selArena: 0,
        menuTimer: 0,
        
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
        
        p2: { // Rival (AI ou Online)
            hp: 0, maxHp: 0, guard: false, charId: 0,
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

        setupInput: function() {
            // Suporte a Clique para Menus (Estilo Wii Remote apontando)
            window.System.canvas.onclick = (e) => {
                const rect = window.System.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = (e.clientY - rect.top) / rect.height;
                
                if (this.state === 'MODE_SELECT') {
                    if (y < 0.5) this.setMode('OFFLINE'); else this.setMode('ONLINE');
                } 
                else if (this.state === 'CHAR_SELECT') {
                    this.selChar = (this.selChar + 1) % CHARACTERS.length;
                    window.Sfx.play(600, 'square', 0.1);
                    // Clique longo ou área específica para confirmar? Vamos usar timer no loop ou clique duplo.
                    // Simplificação: Clique muda, botão confirmar na tela.
                    if (x > rect.width * 0.7) this.confirmChar();
                }
                else if (this.state === 'ARENA_SELECT') {
                    this.selArena = (this.selArena + 1) % ARENAS.length;
                    window.Sfx.play(600, 'square', 0.1);
                    if (x > rect.width * 0.7) this.startGame();
                }
                else if (this.state === 'GAMEOVER') {
                    this.init();
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
            
            if (this.isOnline) {
                this.connectLobby();
            } else {
                // Setup AI
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
                charId: this.selChar,
                hp: this.p1.hp,
                ready: true,
                arena: this.selArena, // Host decide
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
            myRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', snap => {
                const players = snap.val();
                if (!players) return;
                
                // Acha oponente
                const opponentId = Object.keys(players).find(id => id !== window.System.playerId);
                
                if (opponentId) {
                    const opData = players[opponentId];
                    if (this.state === 'LOBBY') {
                        // Iniciar Luta
                        this.p2.charId = opData.charId || 0;
                        this.p2.hp = opData.hp || 100;
                        this.p2.maxHp = CHARACTERS[this.p2.charId].hp;
                        this.p2.isRemote = true;
                        this.p2.id = opponentId;
                        this.state = 'FIGHT';
                        this.timer = CONF.ROUND_TIME * 60;
                        window.System.msg("VS " + CHARACTERS[this.p2.charId].name);
                    } else if (this.state === 'FIGHT') {
                        // Sync Loop
                        this.p2.hp = opData.hp;
                        if (opData.pose) {
                            this.p2.head = opData.pose.head;
                            this.p2.hands = opData.pose.hands;
                            this.p2.guard = opData.pose.guard;
                        }
                    }
                } else if (this.state === 'FIGHT') {
                    // Oponente desconectou
                    window.System.msg("OPONENTE SAIU");
                    this.state = 'GAMEOVER';
                }
            });
        },

        // -----------------------------------------------------------------
        // LOOP DE UPDATE
        // -----------------------------------------------------------------
        update: function(ctx, w, h, pose) {
            this.frame++;
            
            // Fundo Genérico para Menus
            if (this.state !== 'FIGHT') {
                const g = ctx.createLinearGradient(0,0,0,h);
                g.addColorStop(0, '#1a1a2e'); g.addColorStop(1, '#16213e');
                ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
            }

            if (this.state === 'MODE_SELECT') { this.uiModeSelect(ctx, w, h, pose); return; }
            if (this.state === 'CHAR_SELECT') { this.uiCharSelect(ctx, w, h, pose); return; }
            if (this.state === 'ARENA_SELECT') { this.uiArenaSelect(ctx, w, h, pose); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiGameOver(ctx, w, h); return; }

            // === FIGHT LOGIC ===
            
            // 1. Processar Input Local (MoveNet)
            this.processInput(w, h, pose);
            
            // 2. IA ou Netcode
            if (this.isOnline) {
                this.syncOnline();
            } else {
                this.updateAI(w, h);
            }

            // 3. Renderizar Arena e Lutadores
            this.drawArena(ctx, w, h);
            
            // Rival (Fundo)
            this.drawCharacter(ctx, this.p2, false, w, h);
            
            // Player (Frente - Transparente se câmera em primeira pessoa)
            this.drawCharacter(ctx, this.p1, true, w, h);

            // 4. UI e Partículas
            this.drawHUD(ctx, w, h);
            this.updateParticles(ctx);
            this.drawMsgs(ctx);

            // 5. Game Loop Logic
            if (this.timer > 0) this.timer--;
            else this.endRound();

            if (this.p1.hp <= 0 || this.p2.hp <= 0) {
                this.state = 'GAMEOVER';
                if(this.isOnline && this.dbRef) this.dbRef.child('players/' + window.System.playerId).remove();
            }

            return Math.floor(this.p1.score);
        },

        processInput: function(w, h, pose) {
            if (!pose || !pose.keypoints) return;
            
            // Índices: 0:Nose, 9:L_Wrist, 10:R_Wrist
            const k = pose.keypoints;
            const nose = k[0] && k[0].score > 0.3 ? Utils.toScreen(k[0], w, h) : this.p1.head;
            const lWr  = k[9] && k[9].score > 0.3 ? Utils.toScreen(k[9], w, h) : this.p1.hands.l;
            const rWr  = k[10] && k[10].score > 0.3 ? Utils.toScreen(k[10], w, h) : this.p1.hands.r;

            // Suavização
            this.p1.head.x += (nose.x - this.p1.head.x) * 0.3;
            this.p1.head.y += (nose.y - this.p1.head.y) * 0.3;

            // Lógica de Mãos
            this.updateHand(this.p1.hands.l, lWr, 'left', w, h);
            this.updateHand(this.p1.hands.r, rWr, 'right', w, h);

            // Guarda
            const dL = Utils.dist(lWr.x, lWr.y, nose.x, nose.y);
            const dR = Utils.dist(rWr.x, rWr.y, nose.x, nose.y);
            this.p1.guard = (dL < CONF.BLOCK_DIST && dR < CONF.BLOCK_DIST);
            
            // Recupera Stamina
            if (this.p1.stamina < 100) this.p1.stamina += 0.5;
        },

        updateHand: function(hand, target, side, w, h) {
            // Velocidade
            const spd = Utils.dist(target.x, target.y, hand.x, hand.y);
            
            hand.x = target.x;
            hand.y = target.y;

            // Estado de Soco
            if (spd > CONF.PUNCH_THRESH && hand.state === 'IDLE' && this.p1.stamina > 10) {
                hand.state = 'PUNCH';
                hand.z = 0; // Z vai de 0 a 100 (extensão)
                this.p1.stamina -= 15;
                if(window.Sfx) window.Sfx.play(200, 'noise', 0.1);
            }

            if (hand.state === 'PUNCH') {
                hand.z += 15; // Extensão
                
                // Detecção de Colisão (No ápice)
                if (hand.z > 50 && hand.z < 70) {
                    this.checkHit(side, hand, w, h);
                }

                if (hand.z >= 100) hand.state = 'RETRACT';
            } 
            else if (hand.state === 'RETRACT') {
                hand.z -= 10;
                if (hand.z <= 0) {
                    hand.z = 0;
                    hand.state = 'IDLE';
                }
            }
        },

        checkHit: function(side, hand, w, h) {
            // Hitbox do Rival (projetada na tela)
            // Rival Head X é invertido relativo ao centro se for local? Não, tudo screen space.
            // Para simplificar: O rival está sempre no centro da tela +- offset.
            
            const rivalX = w/2 + (this.p2.head.x - w/2) * 0.5; // Aproximação
            const rivalY = h/3 + (this.p2.head.y - h/3) * 0.5;
            
            const dist = Utils.dist(hand.x, hand.y, rivalX, rivalY);
            
            if (dist < 120) {
                if (this.p2.guard) {
                    this.spawnMsg(rivalX, rivalY, "BLOCK", "#aaa");
                    window.Sfx.play(150, 'square', 0.1);
                } else {
                    const dmg = 5 * CHARACTERS[this.p1.charId].power;
                    this.p2.hp -= dmg;
                    this.p1.score += 100;
                    this.spawnParticle(rivalX, rivalY, '#ff0');
                    this.spawnMsg(rivalX, rivalY, "HIT " + Math.floor(dmg), "#f00");
                    window.Gfx.shakeScreen(10);
                    window.Sfx.hit();
                    
                    if (this.isOnline) {
                        // Envia o dano para o rival (Authoritative Attacker para latência baixa)
                         this.dbRef.child('players/' + this.p2.id).update({ hp: this.p2.hp });
                    }
                }
                hand.state = 'RETRACT'; // Rebate
            }
        },

        updateAI: function(w, h) {
            const stats = CHARACTERS[this.p2.charId];
            
            // Movimento da Cabeça (Senoide simples + perseguição suave)
            this.p2.head.x = (w/2) + Math.sin(this.frame * 0.05 * stats.speed) * 100;
            this.p2.head.y = (h/3) + Math.cos(this.frame * 0.03) * 30;

            // Lógica
            if (this.p2.aiTimer > 0) this.p2.aiTimer--;
            else {
                const rand = Math.random();
                if (rand < 0.05 * stats.speed) {
                    // Soco
                    const hand = Math.random() > 0.5 ? this.p2.hands.l : this.p2.hands.r;
                    hand.state = 'PUNCH';
                    hand.z = 0;
                    this.p2.aiTimer = 60 / stats.speed; // Cooldown
                } else if (rand < 0.08) {
                    this.p2.guard = !this.p2.guard;
                    this.p2.aiTimer = 40;
                }
            }

            // Animação Mãos AI
            ['l', 'r'].forEach(s => {
                const hnd = this.p2.hands[s];
                // Posição Base (perto do rosto)
                const targetX = this.p2.head.x + (s==='l'?-60:60);
                const targetY = this.p2.head.y + 80;

                if (hnd.state === 'IDLE') {
                    hnd.x += (targetX - hnd.x) * 0.1;
                    hnd.y += (targetY - hnd.y) * 0.1;
                } else if (hnd.state === 'PUNCH') {
                    hnd.z += 10 * stats.speed;
                    // Mira no player (centro tela)
                    hnd.x += ((w/2) - hnd.x) * 0.2;
                    hnd.y += ((h/2) - hnd.y) * 0.2;
                    
                    if (hnd.z > 60 && !this.p1.guard && hnd.z < 80) {
                        // AI acertou player
                        this.p1.hp -= 3 * stats.power;
                        window.Gfx.shakeScreen(5);
                        this.spawnMsg(w/2, h/2, "OUCH", "#f00");
                        hnd.state = 'RETRACT';
                    } else if (hnd.z > 60 && this.p1.guard && hnd.z < 80) {
                         window.Sfx.play(100, 'sine', 0.1);
                         hnd.state = 'RETRACT';
                    }
                    
                    if (hnd.z > 100) hnd.state = 'RETRACT';
                } else {
                    hnd.z -= 10;
                    if(hnd.z <=0) { hnd.z=0; hnd.state='IDLE'; }
                }
            });
        },

        syncOnline: function() {
            // Envia estado local
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
        // RENDER 3D (PSEUDO)
        // -----------------------------------------------------------------
        drawArena: function(ctx, w, h) {
            const ar = ARENAS[this.selArena];
            const mid = h * 0.45;

            // Fundo
            const g = ctx.createLinearGradient(0,0,0,mid);
            g.addColorStop(0, ar.bgTop); g.addColorStop(1, ar.bgBot);
            ctx.fillStyle = g; ctx.fillRect(0,0,w,mid);

            // Chão (Ringue)
            ctx.fillStyle = ar.floor;
            ctx.beginPath();
            ctx.moveTo(0, h); ctx.lineTo(w, h);
            ctx.lineTo(w * 0.8, mid); ctx.lineTo(w * 0.2, mid);
            ctx.fill();

            // Cordas
            ctx.strokeStyle = ar.rope; ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(w*0.2, mid); ctx.lineTo(w*0.8, mid);
            ctx.moveTo(w*0.15, mid+40); ctx.lineTo(w*0.85, mid+40);
            ctx.stroke();
        },

        drawCharacter: function(ctx, p, isSelf, w, h) {
            const char = CHARACTERS[p.charId];
            
            // Fator de profundidade (P2 é menor porque está longe)
            // Se for P1 (Self), desenhamos "fantasmas" das luvas e HUD style
            // Se for P2, desenhamos o personagem completo
            
            if (!isSelf) {
                // DESENHAR RIVAL (3D Style)
                const cx = p.head.x;
                const cy = p.head.y;
                const scale = 1.0; 

                // Sombra
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath(); ctx.ellipse(cx, cy + 250, 80, 20, 0, 0, Math.PI*2); ctx.fill();

                // Corpo (Gradiente)
                const bodyG = ctx.createLinearGradient(cx-40, cy, cx+40, cy+200);
                bodyG.addColorStop(0, char.color); bodyG.addColorStop(1, '#000');
                ctx.fillStyle = bodyG;
                ctx.beginPath(); 
                ctx.moveTo(cx-50, cy+50); ctx.lineTo(cx+50, cy+50);
                ctx.lineTo(cx+30, cy+250); ctx.lineTo(cx-30, cy+250);
                ctx.fill();

                // Cabeça
                ctx.fillStyle = char.skin;
                ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI*2); ctx.fill();
                
                // Chapéu
                ctx.fillStyle = char.hat;
                ctx.beginPath(); ctx.arc(cx, cy-20, 52, Math.PI, 0); ctx.fill();
                ctx.fillRect(cx-55, cy-20, 110, 15);
                
                // Emblema
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy-35, 15, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#000'; ctx.font="bold 20px Arial"; ctx.textAlign='center'; 
                ctx.fillText(char.name[0], cx, cy-28);

                // Rosto (Olhos e Bigode)
                if (p.hp <= 0) {
                    ctx.font="30px Arial"; ctx.fillText("X  X", cx, cy+10);
                } else {
                    ctx.fillStyle='#000';
                    ctx.beginPath(); ctx.ellipse(cx-15, cy-5, 5, 10, 0, 0, Math.PI*2); ctx.fill();
                    ctx.beginPath(); ctx.ellipse(cx+15, cy-5, 5, 10, 0, 0, Math.PI*2); ctx.fill();
                    
                    // Bigode
                    ctx.beginPath(); ctx.moveTo(cx, cy+20); 
                    ctx.quadraticCurveTo(cx-20, cy+30, cx-30, cy+10); 
                    ctx.quadraticCurveTo(cx, cy+15, cx+30, cy+10);
                    ctx.quadraticCurveTo(cx+20, cy+30, cx, cy+20);
                    ctx.fill();
                }

                // Luvas (Z-Order: desenhar depois se z alto)
                this.drawGlove(ctx, p.hands.l, char.color, false);
                this.drawGlove(ctx, p.hands.r, char.color, false);
                
                // Bloqueio
                if(p.guard) {
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, 80, 0, Math.PI*2); ctx.stroke();
                }

            } else {
                // DESENHAR JOGADOR (POV - Mãos Grandes)
                // Luvas Semi-transparentes
                ctx.globalAlpha = 0.8;
                this.drawGlove(ctx, p.hands.l, char.color, true);
                this.drawGlove(ctx, p.hands.r, char.color, true);
                ctx.globalAlpha = 1.0;
                
                if(p.guard) {
                    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0,0,w,h);
                    this.spawnMsg(w/2, h/2, "DEFENSE", "#0f0", 1);
                }
            }
        },

        drawGlove: function(ctx, hand, color, isSelf) {
            // Z=0 (Perto do corpo), Z=100 (Esticado)
            // Se isSelf: Z=0 é em baixo, Z=100 é no meio da tela (Soco)
            // Se Rival: Z=0 é no corpo dele, Z=100 é na tela (Soco vindo)
            
            let x = hand.x;
            let y = hand.y;
            let s = 1.0;

            if (isSelf) {
                // POV
                s = 1.5 + (hand.z * 0.02); // Cresce quando soca
                // Ajuste visual para parecer que sai de baixo
                y += (100 - hand.z); 
            } else {
                // Rival
                s = 0.8 + (hand.z * 0.015); // Cresce vindo pra tela
                y += (hand.z * 1.5); // Desce um pouco ou sobe dependendo da perspectiva
            }

            ctx.save();
            ctx.translate(x, y);
            ctx.scale(s, s);
            
            // Motion Blur
            if (hand.state === 'PUNCH') {
                ctx.shadowColor = color; ctx.shadowBlur = 20;
            }

            // Luva Esfera
            const g = ctx.createRadialGradient(-10, -10, 5, 0, 0, 40);
            g.addColorStop(0, '#fff'); g.addColorStop(1, color);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI*2); ctx.fill();
            
            // Detalhe
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth=3;
            ctx.beginPath(); ctx.arc(0,0,40,0,Math.PI*2); ctx.stroke();
            
            ctx.restore();
        },

        // -----------------------------------------------------------------
        // UI & MENUS (ESTILO CONSOLE)
        // -----------------------------------------------------------------
        uiModeSelect: function(ctx, w, h, pose) {
            ctx.fillStyle = "#fff"; ctx.font = "bold 50px 'Russo One'"; ctx.textAlign = "center";
            ctx.fillText("SUPER BOXING", w/2, 100);
            
            this.drawBtn(ctx, w/2 - 150, h/2, 300, 80, "OFFLINE", this.selMode === 'OFFLINE');
            this.drawBtn(ctx, w/2 - 150, h/2 + 100, 300, 80, "ONLINE", this.selMode === 'ONLINE');
            
            this.drawCursor(ctx, pose, w, h);
        },

        uiCharSelect: function(ctx, w, h, pose) {
            const c = CHARACTERS[this.selChar];
            ctx.fillStyle = c.color; ctx.fillRect(0,0,w,h); // BG muda com char
            
            ctx.fillStyle = "#fff"; ctx.font = "bold 40px 'Russo One'"; ctx.textAlign="center";
            ctx.fillText("CHOOSE YOUR FIGHTER", w/2, 60);

            // Retrato Grande
            ctx.beginPath(); ctx.arc(w/2, h/2 - 50, 100, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = c.hat; ctx.beginPath(); ctx.arc(w/2, h/2-70, 100, Math.PI, 0); ctx.fill();
            
            ctx.fillStyle = "#fff"; ctx.font = "bold 60px 'Russo One'";
            ctx.fillText(c.name, w/2, h/2 + 100);
            
            // Stats
            this.drawStat(ctx, "POWER", c.power, w/2 - 100, h/2 + 140);
            this.drawStat(ctx, "SPEED", c.speed, w/2 - 100, h/2 + 180);
            
            ctx.font = "20px sans-serif";
            ctx.fillText("CLIQUE/TOQUE NA DIREITA PARA CONFIRMAR", w/2, h - 30);
            
            this.drawCursor(ctx, pose, w, h);
        },

        uiArenaSelect: function(ctx, w, h, pose) {
            const a = ARENAS[this.selArena];
            
            // Preview do BG
            const g = ctx.createLinearGradient(0,0,0,h);
            g.addColorStop(0, a.bgTop); g.addColorStop(1, a.bgBot);
            ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
            
            ctx.fillStyle = "#fff"; ctx.font = "bold 40px 'Russo One'"; ctx.textAlign="center";
            ctx.fillText("SELECT ARENA", w/2, 60);
            ctx.font = "bold 50px 'Russo One'";
            ctx.fillText(a.name, w/2, h/2);
            
            ctx.font = "20px sans-serif";
            ctx.fillText("CLIQUE/TOQUE NA DIREITA PARA LUTAR!", w/2, h - 30);
            
            this.drawCursor(ctx, pose, w, h);
        },

        uiLobby: function(ctx, w, h) {
            ctx.fillStyle = "#000"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center";
            ctx.font = "bold 40px 'Russo One'";
            ctx.fillText("WAITING FOR OPPONENT...", w/2, h/2);
            ctx.font = "20px sans-serif";
            ctx.fillText("ROOM: " + this.roomId, w/2, h - 50);
            
            // Loading Spinner
            const rot = (Date.now() / 1000) * Math.PI;
            ctx.save(); ctx.translate(w/2, h/2 + 60); ctx.rotate(rot);
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0,0,20,0, 5); ctx.stroke();
            ctx.restore();
        },

        uiGameOver: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0,0,w,h);
            const win = this.p1.hp > 0;
            
            ctx.fillStyle = win ? "#f1c40f" : "#e74c3c";
            ctx.font = "bold 80px 'Russo One'"; ctx.textAlign="center";
            ctx.fillText(win ? "YOU WIN!" : "YOU LOSE", w/2, h/2);
            
            ctx.fillStyle = "#fff"; ctx.font = "30px sans-serif";
            ctx.fillText("SCORE: " + this.p1.score, w/2, h/2 + 60);
            ctx.fillText("CLIQUE PARA VOLTAR", w/2, h - 50);
        },

        drawBtn: function(ctx, x, y, w, h, txt, sel) {
            ctx.fillStyle = sel ? "#e67e22" : "#34495e";
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = "#fff"; ctx.lineWidth = sel ? 4 : 1;
            ctx.strokeRect(x,y,w,h);
            ctx.fillStyle = "#fff"; ctx.font = "bold 30px sans-serif";
            ctx.fillText(txt, x + w/2, y + h/2 + 10);
        },

        drawStat: function(ctx, label, val, x, y) {
            ctx.fillStyle = "#fff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "right";
            ctx.fillText(label, x - 10, y);
            
            // Bar
            ctx.fillStyle = "#555"; ctx.fillRect(x, y - 15, 200, 15);
            ctx.fillStyle = "#f1c40f"; ctx.fillRect(x, y - 15, 200 * (val/1.5), 15);
        },

        drawCursor: function(ctx, pose, w, h) {
            if(pose && pose.keypoints && pose.keypoints[0]) {
                const nose = Utils.toScreen(pose.keypoints[0], w, h);
                ctx.strokeStyle = "#0f0"; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(nose.x, nose.y, 20, 0, Math.PI*2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(nose.x-30, nose.y); ctx.lineTo(nose.x+30, nose.y); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(nose.x, nose.y-30); ctx.lineTo(nose.x, nose.y+30); ctx.stroke();
            }
        },

        drawHUD: function(ctx, w, h) {
            const barW = w * 0.4;
            // P1 HP
            ctx.fillStyle = "#333"; ctx.fillRect(20, 20, barW, 30);
            ctx.fillStyle = "#e74c3c"; ctx.fillRect(20, 20, barW * (Math.max(0,this.p1.hp)/this.p1.maxHp), 30);
            ctx.fillStyle = "#fff"; ctx.textAlign="left"; ctx.font="bold 20px sans-serif";
            ctx.fillText(CHARACTERS[this.p1.charId].name, 25, 42);
            
            // P1 Stamina
            ctx.fillStyle = "#f39c12"; ctx.fillRect(20, 55, barW * (this.p1.stamina/100), 10);

            // P2 HP
            const p2Max = this.p2.maxHp || 100;
            const p2Hp = Math.max(0, this.p2.hp);
            ctx.fillStyle = "#333"; ctx.fillRect(w - 20 - barW, 20, barW, 30);
            ctx.fillStyle = "#3498db"; ctx.fillRect(w - 20 - barW * (p2Hp/p2Max), 20, barW * (p2Hp/p2Max), 30);
            ctx.fillStyle = "#fff"; ctx.textAlign="right";
            ctx.fillText(this.isOnline ? "RIVAL" : "CPU", w - 25, 42);

            // Clock
            ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.font="bold 50px 'Russo One'";
            ctx.fillText(Math.ceil(this.timer/60), w/2, 60);
        },

        spawnParticle: function(x, y, c) {
            for(let i=0; i<10; i++) this.particles.push({x, y, vx:(Math.random()-0.5)*15, vy:(Math.random()-0.5)*15, life:1, c});
        },

        updateParticles: function(ctx) {
            this.particles.forEach((p,i) => {
                p.x+=p.vx; p.y+=p.vy; p.life-=0.05;
                ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill();
            });
            ctx.globalAlpha=1;
            this.particles = this.particles.filter(p=>p.life>0);
        },

        spawnMsg: function(x, y, t, c, l=40) {
            this.msgs.push({x, y, t, c, life: l});
        },

        drawMsgs: function(ctx) {
            this.msgs.forEach(m => {
                m.y -= 1; m.life--;
                ctx.fillStyle = m.c; ctx.font = "bold 40px 'Russo One'"; ctx.textAlign="center";
                ctx.fillText(m.t, m.x, m.y);
            });
            this.msgs = this.msgs.filter(m=>m.life>0);
        },
        
        endRound: function() {
            if (this.round < CONF.ROUNDS) {
                this.round++;
                this.timer = CONF.ROUND_TIME * 60;
                window.System.msg("ROUND " + this.round);
            } else {
                this.state = 'GAMEOVER';
                window.System.msg("TIME OVER");
            }
        }
    };

    if(window.System) window.System.registerGame('box_pro', 'Super Boxing', '🥊', Game, { camOpacity: 0.2 });

})();