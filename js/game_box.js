// =============================================================================
// SUPER BOXING: CLASSIC AVATAR EDITION
// VISUAL: Estilo "Antigo" (Avatar Completo)
// LÓGICA: Multiplayer & Offline
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES & PERSONAGENS
    // -----------------------------------------------------------------

    const CONF = {
        ROUNDS: 3,
        ROUND_TIME: 60,
        GRAVITY: 0.5,
        BLOCK_DIST: 90,     // Distância das mãos para o rosto para defender
        PUNCH_THRESH: 15,   // Velocidade para detectar soco
        PLAYER_SCALE: 1.2,  // Tamanho do jogador (frente)
        ENEMY_SCALE: 0.9    // Tamanho do inimigo (fundo)
    };

    const CHARACTERS = [
        { 
            id: 0, name: 'MARIO', 
            colors: { hat: '#d32f2f', shirt: '#e74c3c', overall: '#3498db', skin: '#ffccaa', glove: '#fff' },
            hp: 100, power: 1.0 
        },
        { 
            id: 1, name: 'LUIGI', 
            colors: { hat: '#27ae60', shirt: '#2ecc71', overall: '#2b3a8f', skin: '#ffccaa', glove: '#fff' },
            hp: 100, power: 0.9 
        },
        { 
            id: 2, name: 'WARIO', 
            colors: { hat: '#f1c40f', shirt: '#f39c12', overall: '#8e44ad', skin: '#e67e22', glove: '#fff' },
            hp: 120, power: 1.2 
        },
        { 
            id: 3, name: 'WALUIGI', 
            colors: { hat: '#5e2d85', shirt: '#8e44ad', overall: '#2c3e50', skin: '#ffccaa', glove: '#fff' },
            hp: 100, power: 1.0 
        }
    ];

    const ARENAS = [
        { name: 'WORLD CIRCUIT', bg: '#2c3e50', floor: '#7f8c8d', rope: '#e74c3c' },
        { name: 'UNDERGROUND',   bg: '#2d0e0e', floor: '#3e2723', rope: '#f1c40f' }
    ];

    // Utils
    const Utils = {
        lerp: (curr, target, f) => {
            if(!target || !curr) return curr;
            return { x: curr.x + (target.x - curr.x) * f, y: curr.y + (target.y - curr.y) * f };
        },
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
        map: (val, min, max, nMin, nMax) => (val - min) * (nMax - nMin) / (max - min) + nMin,
        // Converte coordenadas do MediaPipe (0-640) para Tela
        toScreen: (kp, w, h) => ({ x: (1 - kp.x / 640) * w, y: (kp.y / 480) * h })
    };

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO
    // -----------------------------------------------------------------

    const Game = {
        state: 'MODE_SELECT', // MODE_SELECT, CHAR_SELECT, FIGHT, GAMEOVER, LOBBY
        roomId: 'box_arena_01',
        isOnline: false,
        dbRef: null,
        
        selMode: 'OFFLINE',
        selChar: 0,
        selArena: 0,
        
        timer: 0,
        round: 1,
        
        // Estrutura unificada de Lutador (Igual para P1 e P2)
        p1: { id: 'p1', charId: 0, hp: 100, maxHp: 100, guard: false, stamina: 100, score: 0, pose: null },
        p2: { id: 'p2', charId: 1, hp: 100, maxHp: 100, guard: false, isRemote: false, aiTimer: 0, pose: null },

        msgs: [],

        // --- INICIALIZAÇÃO ---
        init: function() {
            this.state = 'MODE_SELECT';
            this.cleanup();
            if(window.System.msg) window.System.msg("BOXING LEGENDS");
            this.initPose(this.p1);
            this.initPose(this.p2);
            this.setupInput();
        },

        initPose: function(p) {
            // Inicializa pose vazia para evitar erros de desenho
            p.pose = {
                head: {x:0,y:0},
                shoulders: {l:{x:0,y:0}, r:{x:0,y:0}},
                elbows: {l:{x:0,y:0}, r:{x:0,y:0}},
                wrists: {l:{x:0,y:0, z:0, state:'IDLE'}, r:{x:0,y:0, z:0, state:'IDLE'}}
            };
        },

        cleanup: function() {
            if (this.dbRef && window.System.playerId) {
                try { this.dbRef.child('players/' + window.System.playerId).remove(); this.dbRef.off(); } catch(e){}
            }
            window.System.canvas.onclick = null;
        },

        setupInput: function() {
            window.System.canvas.onclick = (e) => {
                const r = window.System.canvas.getBoundingClientRect();
                const y = (e.clientY - r.top) / r.height;
                
                if (this.state === 'MODE_SELECT') {
                    this.setMode(y < 0.5 ? 'OFFLINE' : 'ONLINE');
                } else if (this.state === 'CHAR_SELECT') {
                    this.selChar = (this.selChar + 1) % CHARACTERS.length;
                    window.Sfx.play(600, 'square', 0.1);
                    if ((e.clientX - r.left) > r.width * 0.7) { 
                        this.startGame(); 
                        window.Sfx.click(); 
                    }
                } else if (this.state === 'GAMEOVER') {
                    this.init();
                }
            };
        },

        setMode: function(mode) {
            this.selMode = mode;
            this.isOnline = (mode === 'ONLINE' && !!window.DB);
            if (mode === 'ONLINE' && !window.DB) { window.System.msg("OFFLINE ONLY"); return; }
            this.state = 'CHAR_SELECT';
        },

        startGame: function() {
            this.p1.charId = this.selChar;
            this.p1.hp = CHARACTERS[this.selChar].hp;
            this.p1.maxHp = this.p1.hp;
            this.p1.score = 0;
            this.initPose(this.p1);

            if (this.isOnline) {
                this.connectLobby();
            } else {
                // Configurar CPU
                this.p2.charId = (this.selChar + 1) % CHARACTERS.length;
                this.p2.hp = CHARACTERS[this.p2.charId].hp;
                this.p2.maxHp = this.p2.hp;
                this.p2.isRemote = false;
                this.initPose(this.p2);
                this.state = 'FIGHT';
                this.timer = CONF.ROUND_TIME * 60;
                window.System.msg("FIGHT!");
            }
        },

        connectLobby: function() {
            this.state = 'LOBBY';
            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            
            // Entrar na sala
            this.dbRef.child('players/' + window.System.playerId).set({
                charId: this.selChar,
                hp: this.p1.hp,
                ready: true
            });
            this.dbRef.child('players/' + window.System.playerId).onDisconnect().remove();

            // Escutar Oponente
            this.dbRef.child('players').on('value', snap => {
                const players = snap.val();
                if (!players) return;
                const opId = Object.keys(players).find(id => id !== window.System.playerId);
                
                if (opId) {
                    const opData = players[opId];
                    if (this.state === 'LOBBY') {
                        // Começar luta
                        this.p2.charId = opData.charId || 0;
                        this.p2.hp = opData.hp || 100;
                        this.p2.maxHp = CHARACTERS[this.p2.charId].hp;
                        this.p2.isRemote = true;
                        this.p2.id = opId;
                        this.state = 'FIGHT';
                        this.timer = CONF.ROUND_TIME * 60;
                        window.System.msg("VS ONLINE");
                    } else if (this.state === 'FIGHT') {
                        // Sync dos movimentos (Lerp para suavizar)
                        this.p2.hp = opData.hp;
                        if (opData.pose) {
                            this.lerpPose(this.p2.pose, opData.pose);
                        }
                    }
                } else if (this.state === 'FIGHT') {
                    window.System.msg("OPONENTE SAIU");
                    this.state = 'GAMEOVER';
                }
            });
        },

        lerpPose: function(local, remote) {
            // Suaviza o movimento do boneco remoto
            const f = 0.4;
            local.head = Utils.lerp(local.head, remote.head, f);
            local.shoulders.l = Utils.lerp(local.shoulders.l, remote.shoulders.l, f);
            local.shoulders.r = Utils.lerp(local.shoulders.r, remote.shoulders.r, f);
            local.elbows.l = Utils.lerp(local.elbows.l, remote.elbows.l, f);
            local.elbows.r = Utils.lerp(local.elbows.r, remote.elbows.r, f);
            local.wrists.l = Utils.lerp(local.wrists.l, remote.wrists.l, f);
            local.wrists.r = Utils.lerp(local.wrists.r, remote.wrists.r, f);
            // Estados discretos
            local.wrists.l.state = remote.wrists.l.state;
            local.wrists.r.state = remote.wrists.r.state;
        },

        // -----------------------------------------------------------------
        // UPDATE LOOP
        // -----------------------------------------------------------------
        update: function(ctx, w, h, inputPose) {
            // Fundo Menu
            if (this.state !== 'FIGHT') {
                ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0,0,w,h);
            }

            if (this.state === 'MODE_SELECT') { this.uiMode(ctx, w, h); return; }
            if (this.state === 'CHAR_SELECT') { this.uiChar(ctx, w, h); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiGameOver(ctx, w, h); return; }

            // === LUTA ===
            // 1. INPUT (Seu corpo)
            this.processInput(inputPose, w, h);

            // 2. LÓGICA (AI ou Rede)
            if (this.isOnline) this.syncOnline();
            else this.updateAI(w, h);

            // 3. RENDERIZAÇÃO
            this.drawArena(ctx, w, h);

            // Desenha INIMIGO (No Fundo)
            this.drawCharacter(ctx, this.p2, w, h, false);

            // Desenha VOCÊ (Na Frente, Translúcido)
            ctx.globalAlpha = 0.65; // Efeito "Fantasma" para não tapar a visão
            this.drawCharacter(ctx, this.p1, w, h, true);
            ctx.globalAlpha = 1.0;

            // 4. INTERFACE
            this.drawHUD(ctx, w, h);
            this.updateMsgs(ctx);

            // Timer
            if (this.timer > 0) this.timer--;
            else this.endRound();

            if (this.p1.hp <= 0 || this.p2.hp <= 0) this.state = 'GAMEOVER';
        },

        processInput: function(input, w, h) {
            if (!input || !input.keypoints) return;
            const kp = input.keypoints;
            const p = this.p1.pose;

            // Helper para pegar pontos
            const get = (name, old) => {
                const k = kp.find(pt => pt.name === name);
                return (k && k.score > 0.4) ? Utils.toScreen(k, w, h) : old;
            };

            // Mapeia articulações
            p.head = get('nose', p.head);
            p.shoulders.l = get('left_shoulder', p.shoulders.l);
            p.shoulders.r = get('right_shoulder', p.shoulders.r);
            p.elbows.l = get('left_elbow', p.elbows.l);
            p.elbows.r = get('right_elbow', p.elbows.r);
            
            // Lógica das Mãos (Ataque)
            this.updateHand(p.wrists.l, get('left_wrist', p.wrists.l), w, h);
            this.updateHand(p.wrists.r, get('right_wrist', p.wrists.r), w, h);

            // Guarda (Mãos perto do rosto)
            const dL = Utils.dist(p.wrists.l, p.head);
            const dR = Utils.dist(p.wrists.r, p.head);
            this.p1.guard = (dL < CONF.BLOCK_DIST && dR < CONF.BLOCK_DIST);
            
            // Stamina
            if(this.p1.stamina < 100) this.p1.stamina += 0.5;
        },

        updateHand: function(hand, target, w, h) {
            // Velocidade
            const speed = Utils.dist(hand, target);
            hand.x = target.x;
            hand.y = target.y;

            // Gatilho de Soco
            if (speed > CONF.PUNCH_THRESH && hand.state === 'IDLE' && this.p1.stamina > 10) {
                hand.state = 'PUNCH';
                hand.z = 0; // Profundidade (simulada)
                this.p1.stamina -= 20;
                window.Sfx.play(200, 'noise', 0.1);
            }

            // Animação do Soco
            if (hand.state === 'PUNCH') {
                hand.z += 10;
                
                // Colisão (no meio da extensão)
                if (hand.z > 40 && hand.z < 60) {
                    this.checkHit(hand);
                }

                if (hand.z > 80) hand.state = 'RETRACT';
            } else if (hand.state === 'RETRACT') {
                hand.z -= 10;
                if (hand.z <= 0) { hand.z = 0; hand.state = 'IDLE'; }
            }
        },

        checkHit: function(hand) {
            // Hitbox simples: A distância da sua mão projetada para a cabeça do inimigo
            // Como o inimigo está desenhado no centro da tela (ajustado), usamos a posição dele.
            
            // Projetamos a posição do inimigo para coordenadas de tela
            // Assumimos que a cabeça do inimigo está perto do centro superior
            const enemyHead = this.p2.pose.head;
            
            // Distância 2D (Tela)
            const dist = Utils.dist(hand, enemyHead);

            if (dist < 100) { // Acertou na tela
                if (this.p2.guard) {
                    this.spawnMsg(enemyHead.x, enemyHead.y, "BLOCKED", "#aaa");
                    window.Sfx.play(100, 'square', 0.1);
                } else {
                    const dmg = 5 * CHARACTERS[this.p1.charId].power;
                    this.p2.hp -= dmg;
                    this.p1.score += 50;
                    this.spawnMsg(enemyHead.x, enemyHead.y, "POW!", "#f00");
                    window.Gfx.shakeScreen(8);
                    window.Sfx.hit();
                    
                    if(this.isOnline) {
                        this.dbRef.child('players/' + this.p2.id).update({ hp: this.p2.hp });
                    }
                }
                hand.state = 'RETRACT'; // Rebate
            }
        },

        updateAI: function(w, h) {
            const ai = this.p2;
            const pose = ai.pose;
            
            // Animação Idle (Flutuando no centro)
            const time = Date.now() * 0.002;
            const cx = w/2;
            const cy = h * 0.35; // Altura da cabeça do inimigo
            
            // Simula corpo da AI
            pose.head = { x: cx + Math.sin(time)*30, y: cy + Math.cos(time)*10 };
            pose.shoulders.l = { x: pose.head.x - 50, y: pose.head.y + 60 };
            pose.shoulders.r = { x: pose.head.x + 50, y: pose.head.y + 60 };
            
            // Braços em guarda
            const guardH = ai.guard ? 0 : 60;
            pose.elbows.l = { x: pose.shoulders.l.x - 20, y: pose.shoulders.l.y + 60 };
            pose.elbows.r = { x: pose.shoulders.r.x + 20, y: pose.shoulders.r.y + 60 };
            
            // Punhos (Idle ou Soco)
            ['l', 'r'].forEach(side => {
                const hand = pose.wrists[side];
                const elbow = pose.elbows[side];
                
                if (hand.state === 'IDLE') {
                    // Posição de guarda
                    const tx = pose.head.x + (side==='l'?-40:40);
                    const ty = pose.head.y + 60 + guardH;
                    hand.x += (tx - hand.x) * 0.1;
                    hand.y += (ty - hand.y) * 0.1;
                } else if (hand.state === 'PUNCH') {
                    // Vai em direção ao centro da tela (onde está o jogador)
                    hand.z += 8;
                    hand.x += ((w/2) - hand.x) * 0.2;
                    hand.y += ((h/2) - hand.y) * 0.2;
                    
                    // Dano no Jogador
                    if (hand.z > 50 && hand.z < 70) {
                        if(!this.p1.guard) {
                            this.p1.hp -= 3;
                            window.Gfx.shakeScreen(5);
                            this.spawnMsg(w/2, h/2, "OUCH", "#ff0000");
                        }
                        hand.state = 'RETRACT';
                    }
                    if (hand.z > 80) hand.state = 'RETRACT';
                } else {
                    hand.z -= 10;
                    if(hand.z<=0) {hand.z=0; hand.state='IDLE';}
                }
            });

            // Lógica AI
            if (ai.aiTimer-- <= 0) {
                if (Math.random() < 0.05) {
                    // Soco
                    const h = Math.random()>0.5 ? pose.wrists.l : pose.wrists.r;
                    h.state = 'PUNCH';
                    ai.aiTimer = 60;
                } else if (Math.random() < 0.05) {
                    ai.guard = !ai.guard;
                    ai.aiTimer = 40;
                }
            }
        },

        syncOnline: function() {
            // Envia pose simplificada (arredondada para inteiros)
            if (this.timer % 3 === 0) {
                const r = (v) => ({x: Math.round(v.x), y: Math.round(v.y), z: Math.round(v.z||0)});
                const p = this.p1.pose;
                
                this.dbRef.child('players/' + window.System.playerId).update({
                    hp: this.p1.hp,
                    pose: {
                        head: r(p.head),
                        shoulders: {l: r(p.shoulders.l), r: r(p.shoulders.r)},
                        elbows: {l: r(p.elbows.l), r: r(p.elbows.r)},
                        wrists: {
                            l: {...r(p.wrists.l), state: p.wrists.l.state},
                            r: {...r(p.wrists.r), state: p.wrists.r.state}
                        }
                    }
                });
            }
        },

        // -----------------------------------------------------------------
        // RENDERIZAÇÃO (ESTILO ANTIGO RESTAURADO)
        // -----------------------------------------------------------------
        drawCharacter: function(ctx, player, w, h, isSelf) {
            const pose = player.pose;
            // Segurança: Se não tem ombros, não desenha nada (evita riscos na tela)
            if (pose.shoulders.l.x === 0 || pose.shoulders.r.x === 0) return;

            const conf = CHARACTERS[player.charId].colors;
            
            // Escala dinâmica baseada na distância dos ombros
            // Para o inimigo, usamos uma escala fixa baseada na posição para ele não ficar gigante/minúsculo erraticamente
            let shoulderDist = Utils.dist(pose.shoulders.l, pose.shoulders.r);
            if (!isSelf) shoulderDist = 100; // Estabiliza tamanho do inimigo

            // Escala Final (Inimigo é menor porque está longe)
            const scale = (shoulderDist / 100) * (isSelf ? CONF.PLAYER_SCALE : CONF.ENEMY_SCALE);

            // Helpers de Desenho (Estilo Cartoon)
            const drawLine = (p1, p2, color, width) => {
                if (p1.x===0 || p2.x===0) return;
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.lineWidth = width * scale; ctx.strokeStyle = color; ctx.stroke();
            };
            const drawCircle = (p, r, color) => {
                if (p.x===0) return;
                ctx.beginPath(); ctx.arc(p.x, p.y, r*scale, 0, Math.PI*2); 
                ctx.fillStyle=color; ctx.fill();
            };

            // Centro do Peito
            const chestX = (pose.shoulders.l.x + pose.shoulders.r.x) / 2;
            const chestY = (pose.shoulders.l.y + pose.shoulders.r.y) / 2;

            // 1. CORPO & MACACÃO
            ctx.fillStyle = conf.shirt;
            ctx.beginPath(); ctx.ellipse(chestX, chestY + (40*scale), 50*scale, 70*scale, 0, 0, Math.PI*2); ctx.fill();
            
            ctx.fillStyle = conf.overall;
            ctx.fillRect(chestX - 35*scale, chestY + 50*scale, 70*scale, 80*scale);
            
            // Alças
            drawLine(pose.shoulders.l, {x: chestX-20*scale, y: chestY+60*scale}, conf.overall, 10);
            drawLine(pose.shoulders.r, {x: chestX+20*scale, y: chestY+60*scale}, conf.overall, 10);
            
            // Botões
            drawCircle({x: chestX-20*scale, y: chestY+60*scale}, 6, '#ff0');
            drawCircle({x: chestX+20*scale, y: chestY+60*scale}, 6, '#ff0');

            // 2. BRAÇOS (Articulados)
            const armW = 25;
            drawLine(pose.shoulders.l, pose.elbows.l, conf.shirt, armW);
            drawLine(pose.elbows.l, pose.wrists.l, conf.shirt, armW);
            drawLine(pose.shoulders.r, pose.elbows.r, conf.shirt, armW);
            drawLine(pose.elbows.r, pose.wrists.r, conf.shirt, armW);

            // 3. CABEÇA
            drawCircle(pose.head, 45, conf.skin); // Rosto
            
            // Boné
            ctx.fillStyle = conf.hat;
            ctx.beginPath(); ctx.arc(pose.head.x, pose.head.y - 10*scale, 46*scale, Math.PI, 0); ctx.fill();
            ctx.beginPath(); ctx.ellipse(pose.head.x, pose.head.y - 12*scale, 50*scale, 15*scale, 0, Math.PI, 0); ctx.fill();
            
            // Emblema
            drawCircle({x: pose.head.x, y: pose.head.y-35*scale}, 12, '#fff');
            ctx.fillStyle = conf.hat; ctx.font=`bold ${16*scale}px Arial`; ctx.textAlign='center';
            ctx.fillText(CHARACTERS[player.charId].name[0], pose.head.x, pose.head.y - 30*scale);

            // 4. LUVAS (Por cima de tudo)
            this.drawGlove(ctx, pose.wrists.l, conf.glove, scale);
            this.drawGlove(ctx, pose.wrists.r, conf.glove, scale);
        },

        drawGlove: function(ctx, hand, color, scale) {
            if(hand.x === 0) return;
            // A luva cresce com o Z (soco)
            const zScale = 1.0 + (hand.z || 0) * 0.01; 
            const s = scale * zScale;

            ctx.save();
            ctx.translate(hand.x, hand.y);
            
            // Rastro de movimento
            if(hand.state === 'PUNCH') {
                ctx.shadowColor = color; ctx.shadowBlur = 20;
            }

            const g = ctx.createRadialGradient(-10, -10, 5, 0, 0, 35*s);
            g.addColorStop(0, '#fff'); g.addColorStop(1, '#ccc'); // Luva branca clássica
            
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, 35*s, 0, Math.PI*2); ctx.fill();
            
            // Detalhe vermelho (faixa)
            ctx.fillStyle = '#f00'; ctx.fillRect(-15*s, 10*s, 30*s, 10*s);
            
            ctx.restore();
        },

        drawArena: function(ctx, w, h) {
            const ar = ARENAS[this.selArena];
            const mid = h * 0.6;
            
            // Fundo
            ctx.fillStyle = ar.bg; ctx.fillRect(0,0,w,mid);
            // Chão
            ctx.fillStyle = ar.floor; ctx.fillRect(0,mid,w,h-mid);
            // Cordas
            ctx.strokeStyle = ar.rope; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.moveTo(0, mid-50); ctx.lineTo(w, mid-50); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, mid-120); ctx.lineTo(w, mid-120); ctx.stroke();
        },

        // --- INTERFACE ---
        uiMode: function(ctx, w, h) {
            ctx.fillStyle = "#fff"; ctx.font = "bold 50px 'Russo One'"; ctx.textAlign = "center";
            ctx.fillText("BOXING LEGENDS", w/2, 100);
            this.btn(ctx, w/2, h/2 - 60, "OFFLINE", this.selMode==='OFFLINE');
            this.btn(ctx, w/2, h/2 + 60, "ONLINE", this.selMode==='ONLINE');
        },

        uiChar: function(ctx, w, h) {
            const c = CHARACTERS[this.selChar];
            ctx.fillStyle = c.colors.overall; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center";
            ctx.font = "bold 40px 'Russo One'"; ctx.fillText(c.name, w/2, h/2);
            ctx.font = "20px sans-serif"; ctx.fillText("CLIQUE À DIREITA ->", w/2, h-50);
            
            // Retrato simples
            ctx.fillStyle = c.colors.hat; 
            ctx.beginPath(); ctx.arc(w/2, h/2 - 100, 80, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "#fff"; ctx.font="80px Arial"; ctx.fillText(c.name[0], w/2, h/2-75);
        },

        uiLobby: function(ctx, w, h) {
            ctx.fillStyle = "#000"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center"; 
            ctx.font="30px 'Russo One'"; ctx.fillText("AGUARDANDO OPONENTE...", w/2, h/2);
        },

        uiGameOver: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = this.p1.hp > 0 ? "#f1c40f" : "#e74c3c";
            ctx.textAlign="center"; ctx.font="bold 60px 'Russo One'";
            ctx.fillText(this.p1.hp > 0 ? "VITORIA!" : "DERROTA", w/2, h/2);
            ctx.fillStyle = "#fff"; ctx.font="20px sans-serif"; ctx.fillText("CLIQUE PARA VOLTAR", w/2, h-50);
        },

        drawHUD: function(ctx, w, h) {
            const bar = w * 0.4;
            // Barras de Vida
            ctx.fillStyle = "#333"; ctx.fillRect(10, 10, bar, 30);
            ctx.fillStyle = "#e74c3c"; ctx.fillRect(10, 10, bar * (Math.max(0,this.p1.hp)/100), 30);
            
            ctx.fillStyle = "#333"; ctx.fillRect(w-10-bar, 10, bar, 30);
            ctx.fillStyle = "#3498db"; ctx.fillRect(w-10-bar, 10, bar * (Math.max(0,this.p2.hp)/100), 30);

            // Nomes
            ctx.fillStyle="#fff"; ctx.font="bold 20px sans-serif";
            ctx.textAlign="left"; ctx.fillText("P1", 15, 32);
            ctx.textAlign="right"; ctx.fillText("P2", w-15, 32);
        },

        btn: function(ctx, x, y, txt, sel) {
            ctx.fillStyle = sel ? "#e67e22" : "#34495e";
            ctx.fillRect(x-100, y-30, 200, 60);
            ctx.strokeStyle = "#fff"; ctx.lineWidth=2; ctx.strokeRect(x-100,y-30,200,60);
            ctx.fillStyle = "#fff"; ctx.font="bold 24px sans-serif"; ctx.fillText(txt, x, y+8);
        },

        spawnMsg: function(x, y, t, c) { this.msgs.push({x, y, t, c, life: 30}); },
        updateMsgs: function(ctx) {
            this.msgs.forEach(m => {
                m.y-=1; m.life--;
                ctx.fillStyle=m.c; ctx.font="bold 30px Arial"; ctx.fillText(m.t, m.x, m.y);
            });
            this.msgs = this.msgs.filter(m=>m.life>0);
        },

        endRound: function() {
            if(this.round < CONF.ROUNDS) {
                this.round++; this.timer = CONF.ROUND_TIME * 60;
                window.System.msg("ROUND " + this.round);
            } else this.state = 'GAMEOVER';
        }
    };

    if(window.System) window.System.registerGame('box_pro', 'Boxing Legends', '🥊', Game, { camOpacity: 0.1 });

})();