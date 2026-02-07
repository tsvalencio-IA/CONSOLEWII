// =============================================================================
// SUPER BOXING STADIUM: ULTIMATE EDITION (GFX PATCHED)
// FUSÃO: Lógica Multiplayer + Gráficos 3D Avatar
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E CONFIGURAÇÕES VISUAIS
    // -----------------------------------------------------------------

    const CHARACTERS = [
        { 
            id: 0, name: 'MARIO', 
            colors: { shirt: '#e74c3c', overall: '#3498db', hat: '#d32f2f', skin: '#ffccaa' },
            power: 1.0, speed: 1.0, hp: 100 
        },
        { 
            id: 1, name: 'LUIGI', 
            colors: { shirt: '#2ecc71', overall: '#2c3e50', hat: '#27ae60', skin: '#ffccaa' },
            power: 0.8, speed: 1.2, hp: 100 
        },
        { 
            id: 2, name: 'PEACH', 
            colors: { shirt: '#fd79a8', overall: '#e84393', hat: '#fd79a8', skin: '#ffe0bd' },
            power: 0.7, speed: 1.4, hp: 90 
        },
        { 
            id: 3, name: 'WARIO', 
            colors: { shirt: '#f1c40f', overall: '#8e44ad', hat: '#f39c12', skin: '#e67e22' },
            power: 1.4, speed: 0.6, hp: 130 
        }
    ];

    const ARENAS = [
        { id: 0, name: 'WORLD CIRCUIT',  bgTop: '#2c3e50', bgBot: '#34495e', rope: '#e74c3c', floor: '#ecf0f1' },
        { id: 1, name: 'BOWSER ARENA',   bgTop: '#2d0e0e', bgBot: '#581414', rope: '#f1c40f', floor: '#2c2c2c' }
    ];

    const CONF = {
        ROUNDS: 3,
        ROUND_TIME: 60,
        BLOCK_DIST: 90,
        PUNCH_THRESH: 15
    };

    // Utils Matemáticos
    const Utils = {
        lerp: (curr, target, f) => target ? { x: curr.x + (target.x - curr.x) * f, y: curr.y + (target.y - curr.y) * f } : curr,
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
        toScreen: (kp, w, h) => ({ x: (1 - kp.x / 640) * w, y: (kp.y / 480) * h })
    };

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO
    // -----------------------------------------------------------------

    const Game = {
        state: 'MODE_SELECT',
        roomId: 'boxing_global_v1',
        isOnline: false,
        dbRef: null,
        
        selMode: 'OFFLINE',
        selChar: 0,
        selArena: 0,
        
        timer: 0,
        round: 1,
        
        // Estrutura do Jogador Local
        p1: { 
            hp: 100, maxHp: 100, stamina: 100, guard: false, charId: 0, score: 0,
            // Esqueleto completo para renderização
            pose: {
                head: {x:0, y:0},
                shoulders: {l:{x:0,y:0}, r:{x:0,y:0}},
                elbows: {l:{x:0,y:0}, r:{x:0,y:0}},
                wrists: {l:{x:0,y:0, z:0, state:'IDLE'}, r:{x:0,y:0, z:0, state:'IDLE'}}
            }
        },
        
        // Estrutura do Jogador Remoto / CPU
        p2: { 
            hp: 100, maxHp: 100, guard: false, charId: 1, isRemote: false, id: null, aiTimer: 0,
            pose: {
                head: {x:0, y:0},
                shoulders: {l:{x:0,y:0}, r:{x:0,y:0}},
                elbows: {l:{x:0,y:0}, r:{x:0,y:0}},
                wrists: {l:{x:0,y:0, z:0, state:'IDLE'}, r:{x:0,y:0, z:0, state:'IDLE'}}
            }
        },

        particles: [],
        msgs: [],

        init: function() {
            this.state = 'MODE_SELECT';
            this.cleanup();
            if(window.System.msg) window.System.msg("SUPER BOXING");
            this.setupInput();
        },

        cleanup: function() {
            if (this.dbRef && window.System.playerId) {
                try { this.dbRef.child('players/' + window.System.playerId).remove(); this.dbRef.off(); } catch(e){}
            }
            window.System.canvas.onclick = null;
        },

        setupInput: function() {
            window.System.canvas.onclick = (e) => {
                const rect = window.System.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = (e.clientY - rect.top) / rect.height; // 0 a 1

                if (this.state === 'MODE_SELECT') {
                    if (y < 0.5) this.setMode('OFFLINE'); else this.setMode('ONLINE');
                } 
                else if (this.state === 'CHAR_SELECT') {
                    this.selChar = (this.selChar + 1) % CHARACTERS.length;
                    window.Sfx.play(600, 'square', 0.1);
                    if (x > rect.width * 0.7) { this.state = 'ARENA_SELECT'; window.Sfx.click(); }
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
            if (mode === 'ONLINE' && !window.DB) { window.System.msg("OFFLINE ONLY"); return; }
            this.state = 'CHAR_SELECT';
            window.Sfx.click();
        },

        startGame: function() {
            this.resetFighter(this.p1, this.selChar);
            
            if (this.isOnline) {
                this.connectLobby();
            } else {
                // Configurar CPU
                const cpuChar = Math.floor(Math.random() * CHARACTERS.length);
                this.resetFighter(this.p2, cpuChar);
                this.p2.isRemote = false;
                this.state = 'FIGHT';
                this.timer = CONF.ROUND_TIME * 60;
                window.System.msg("ROUND 1");
            }
        },

        resetFighter: function(p, charId) {
            p.charId = charId;
            p.hp = CHARACTERS[charId].hp;
            p.maxHp = p.hp;
            p.guard = false;
            // Reset Pose
            p.pose.wrists.l.state = 'IDLE';
            p.pose.wrists.r.state = 'IDLE';
            p.pose.wrists.l.z = 0;
            p.pose.wrists.r.z = 0;
        },

        connectLobby: function() {
            this.state = 'LOBBY';
            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            
            myRef.set({
                charId: this.selChar,
                hp: this.p1.hp,
                ready: true,
                ts: firebase.database.ServerValue.TIMESTAMP
            });
            myRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', snap => {
                const players = snap.val();
                if (!players) return;
                
                const opId = Object.keys(players).find(id => id !== window.System.playerId);
                
                if (opId) {
                    const opData = players[opId];
                    if (this.state === 'LOBBY') {
                        this.resetFighter(this.p2, opData.charId || 0);
                        this.p2.isRemote = true;
                        this.p2.id = opId;
                        this.state = 'FIGHT';
                        this.timer = CONF.ROUND_TIME * 60;
                        window.System.msg("VS ONLINE");
                    } else if (this.state === 'FIGHT') {
                        // Sincronização de Rede
                        this.p2.hp = opData.hp;
                        if (opData.pose) {
                            // Lerp suave para o oponente online
                            const lerpPose = (local, remote) => {
                                local.head = Utils.lerp(local.head, remote.head, 0.3);
                                local.shoulders.l = Utils.lerp(local.shoulders.l, remote.shoulders.l, 0.3);
                                local.shoulders.r = Utils.lerp(local.shoulders.r, remote.shoulders.r, 0.3);
                                local.elbows.l = Utils.lerp(local.elbows.l, remote.elbows.l, 0.3);
                                local.elbows.r = Utils.lerp(local.elbows.r, remote.elbows.r, 0.3);
                                local.wrists.l = Utils.lerp(local.wrists.l, remote.wrists.l, 0.3);
                                local.wrists.r = Utils.lerp(local.wrists.r, remote.wrists.r, 0.3);
                                local.wrists.l.z = remote.wrists.l.z; // Z é crítico, não suavizar muito
                                local.wrists.r.z = remote.wrists.r.z;
                            };
                            if(opData.pose.head) lerpPose(this.p2.pose, opData.pose);
                        }
                    }
                } else if (this.state === 'FIGHT') {
                    window.System.msg("OPONENTE SAIU");
                    this.state = 'GAMEOVER';
                }
            });
        },

        // -----------------------------------------------------------------
        // LOOP PRINCIPAL (UPDATE)
        // -----------------------------------------------------------------
        update: function(ctx, w, h, inputPose) {
            // Renderiza fundo de menu se não estiver lutando
            if (this.state !== 'FIGHT') {
                const g = ctx.createLinearGradient(0,0,0,h);
                g.addColorStop(0, '#1a1a2e'); g.addColorStop(1, '#16213e');
                ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
            }

            if (this.state === 'MODE_SELECT') { this.uiMode(ctx, w, h); return; }
            if (this.state === 'CHAR_SELECT') { this.uiChar(ctx, w, h); return; }
            if (this.state === 'ARENA_SELECT') { this.uiArena(ctx, w, h); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiGameOver(ctx, w, h); return; }

            // === LUTA ===
            
            // 1. Processar Input (MoveNet -> P1 Pose)
            this.processInput(inputPose, w, h);
            
            // 2. IA ou Rede
            if (this.isOnline) this.syncOnline();
            else this.updateAI(w, h);

            // 3. Renderizar Cenário
            this.drawArena(ctx, w, h);
            
            // 4. Renderizar Personagens
            // Oponente (Desenhado normal)
            this.drawAvatar(ctx, this.p2, false, w, h);
            
            // Player (Desenhado como "Fantasma" ou transparente para não atrapalhar a visão)
            ctx.globalAlpha = 0.6; // Transparência para o player
            this.drawAvatar(ctx, this.p1, true, w, h);
            ctx.globalAlpha = 1.0;

            // 5. UI & Lógica
            this.drawHUD(ctx, w, h);
            this.updateEffects(ctx);
            
            if (this.timer > 0) this.timer--;
            else this.endRound();
            
            if (this.p1.hp <= 0 || this.p2.hp <= 0) this.state = 'GAMEOVER';
        },

        processInput: function(inputPose, w, h) {
            if (!inputPose || !inputPose.keypoints) return;
            const kp = inputPose.keypoints;
            const p = this.p1.pose;

            // Helper para pegar ponto raw ou manter anterior
            const get = (name, curr) => {
                const k = kp.find(k => k.name === name);
                return (k && k.score > 0.3) ? Utils.toScreen(k, w, h) : curr;
            };

            // Atualiza Posições com Suavização (Lerp 0.3)
            p.head = Utils.lerp(p.head, get('nose', p.head), 0.3);
            p.shoulders.l = Utils.lerp(p.shoulders.l, get('left_shoulder', p.shoulders.l), 0.3);
            p.shoulders.r = Utils.lerp(p.shoulders.r, get('right_shoulder', p.shoulders.r), 0.3);
            p.elbows.l = Utils.lerp(p.elbows.l, get('left_elbow', p.elbows.l), 0.3);
            p.elbows.r = Utils.lerp(p.elbows.r, get('right_elbow', p.elbows.r), 0.3);
            
            // Mãos (Lógica de soco)
            this.updateHandLogic(p.wrists.l, get('left_wrist', p.wrists.l), 'left', w, h);
            this.updateHandLogic(p.wrists.r, get('right_wrist', p.wrists.r), 'right', w, h);

            // Guarda (Mãos perto do rosto)
            const dL = Utils.dist(p.wrists.l, p.head);
            const dR = Utils.dist(p.wrists.r, p.head);
            this.p1.guard = (dL < CONF.BLOCK_DIST && dR < CONF.BLOCK_DIST);

            // Stamina regen
            if (this.p1.stamina < 100) this.p1.stamina += 0.5;
        },

        updateHandLogic: function(hand, targetXY, side, w, h) {
            // Velocidade do movimento físico gatilha o soco virtual
            const spd = Utils.dist(hand, targetXY);
            hand.x = targetXY.x;
            hand.y = targetXY.y;

            if (spd > CONF.PUNCH_THRESH && hand.state === 'IDLE' && this.p1.stamina > 10) {
                hand.state = 'PUNCH';
                hand.z = 0;
                this.p1.stamina -= 15;
                if(window.Sfx) window.Sfx.play(200, 'noise', 0.1);
            }

            if (hand.state === 'PUNCH') {
                hand.z += 15; // Extensão do soco (Z-depth virtual)
                if (hand.z > 50 && hand.z < 70) this.checkHit(hand, w, h); // Checa colisão no ápice
                if (hand.z >= 100) hand.state = 'RETRACT';
            } 
            else if (hand.state === 'RETRACT') {
                hand.z -= 10;
                if (hand.z <= 0) { hand.z = 0; hand.state = 'IDLE'; }
            }
        },

        checkHit: function(hand, w, h) {
            // Hitbox simplificada: Oponente está no centro
            const rivalPos = this.p2.pose.head; // Cabeça do oponente
            // Compensa a posição do oponente na tela
            const dist = Utils.dist(hand, rivalPos);
            
            if (dist < 120) { // Alcance
                if (this.p2.guard) {
                    this.spawnMsg(rivalPos.x, rivalPos.y, "BLOCK", "#aaa");
                    window.Sfx.play(150, 'square', 0.1);
                } else {
                    const dmg = 5 * CHARACTERS[this.p1.charId].power;
                    this.p2.hp -= dmg;
                    this.p1.score += 100;
                    this.spawnMsg(rivalPos.x, rivalPos.y, "HIT!", "#f00");
                    window.Gfx.shakeScreen(5);
                    window.Sfx.hit();
                    if(this.isOnline) this.dbRef.child('players/' + this.p2.id).update({ hp: this.p2.hp });
                }
                hand.state = 'RETRACT';
            }
        },

        updateAI: function(w, h) {
            const p = this.p2.pose;
            const stats = CHARACTERS[this.p2.charId];

            // Animação "Idle" da CPU
            p.head.x = (w/2) + Math.sin(Date.now() * 0.002 * stats.speed) * 80;
            p.head.y = (h/3) + Math.cos(Date.now() * 0.001) * 20;

            // Ombros acompanham a cabeça
            p.shoulders.l = { x: p.head.x - 60, y: p.head.y + 80 };
            p.shoulders.r = { x: p.head.x + 60, y: p.head.y + 80 };
            
            // Cotovelos
            p.elbows.l = { x: p.shoulders.l.x - 20, y: p.shoulders.l.y + 80 };
            p.elbows.r = { x: p.shoulders.r.x + 20, y: p.shoulders.r.y + 80 };

            // Lógica de Ataque
            if (this.p2.aiTimer > 0) this.p2.aiTimer--;
            else {
                if (Math.random() < 0.05 * stats.speed) {
                    const hand = Math.random() > 0.5 ? p.wrists.l : p.wrists.r;
                    hand.state = 'PUNCH';
                    this.p2.aiTimer = 60 / stats.speed;
                } else if (Math.random() < 0.05) {
                    this.p2.guard = !this.p2.guard;
                    this.p2.aiTimer = 40;
                }
            }

            // Animação dos Punhos CPU
            ['l', 'r'].forEach(side => {
                const hnd = p.wrists[side];
                const base = p.elbows[side]; // Punho volta pro cotovelo
                
                if (hnd.state === 'IDLE') {
                    // Guarda levantada ou baixa
                    const guardY = this.p2.guard ? p.head.y : base.y;
                    hnd.x += (base.x - hnd.x) * 0.1;
                    hnd.y += (guardY - hnd.y) * 0.1;
                } else if (hnd.state === 'PUNCH') {
                    hnd.z += 10 * stats.speed;
                    // Mira no player (centro)
                    hnd.x += ((w/2) - hnd.x) * 0.2;
                    hnd.y += ((h/2) - hnd.y) * 0.2;
                    
                    if (hnd.z > 60 && !this.p1.guard && hnd.z < 80) {
                        this.p1.hp -= 2 * stats.power;
                        window.Gfx.shakeScreen(5);
                        this.spawnMsg(w/2, h/2, "OUCH", "#f00");
                        hnd.state = 'RETRACT';
                    }
                    if (hnd.z > 100) hnd.state = 'RETRACT';
                } else { // RETRACT
                    hnd.z -= 10;
                    if(hnd.z <= 0) { hnd.z=0; hnd.state='IDLE'; }
                }
            });
        },

        syncOnline: function() {
            // Envia pose completa (simplificada para inteiros para economizar banda)
            if (this.timer % 3 === 0) { // Envia a cada 3 frames
                const p = this.p1.pose;
                const round = v => ({ x: Math.round(v.x), y: Math.round(v.y), z: Math.round(v.z||0) });
                
                this.dbRef.child('players/' + window.System.playerId).update({
                    hp: this.p1.hp,
                    pose: {
                        head: round(p.head),
                        shoulders: { l: round(p.shoulders.l), r: round(p.shoulders.r) },
                        elbows: { l: round(p.elbows.l), r: round(p.elbows.r) },
                        wrists: { 
                            l: { ...round(p.wrists.l), state: p.wrists.l.state },
                            r: { ...round(p.wrists.r), state: p.wrists.r.state }
                        }
                    }
                });
            }
        },

        // -----------------------------------------------------------------
        // RENDERIZAÇÃO 3D (AVATAR)
        // -----------------------------------------------------------------
        drawAvatar: function(ctx, player, isSelf, w, h) {
            const pose = player.pose;
            const colors = CHARACTERS[player.charId].colors;
            
            // Se as coordenadas não existem, não desenha
            if (pose.shoulders.l.x === 0) return;

            // Escala dinâmica baseada no tamanho dos ombros
            const shoulderDist = Utils.dist(pose.shoulders.l, pose.shoulders.r);
            const scale = Math.max(0.5, shoulderDist / 120); 

            // Helpers de desenho
            const drawLimb = (p1, p2, color, width) => {
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                ctx.lineCap = 'round'; ctx.lineWidth = width * scale;
                ctx.strokeStyle = color; ctx.stroke();
            };
            const drawCircle = (x, y, r, c) => {
                ctx.beginPath(); ctx.arc(x, y, r * scale, 0, Math.PI*2); ctx.fillStyle = c; ctx.fill();
            };

            // 1. CORPO
            const chestX = (pose.shoulders.l.x + pose.shoulders.r.x) / 2;
            const chestY = (pose.shoulders.l.y + pose.shoulders.r.y) / 2;

            // Camisa
            ctx.fillStyle = colors.shirt;
            ctx.beginPath(); ctx.ellipse(chestX, chestY + (40*scale), 50*scale, 70*scale, 0, 0, Math.PI*2); ctx.fill();

            // Macacão
            ctx.fillStyle = colors.overall;
            ctx.fillRect(chestX - 35*scale, chestY + 50*scale, 70*scale, 80*scale);
            
            // Alças
            ctx.lineWidth = 10 * scale; ctx.strokeStyle = colors.overall;
            ctx.beginPath(); ctx.moveTo(pose.shoulders.l.x, pose.shoulders.l.y + 10); ctx.lineTo(chestX - 20*scale, chestY + 60*scale); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(pose.shoulders.r.x, pose.shoulders.r.y + 10); ctx.lineTo(chestX + 20*scale, chestY + 60*scale); ctx.stroke();
            
            // Botões
            drawCircle(chestX - 20*scale, chestY + 60*scale, 6, '#ffff00');
            drawCircle(chestX + 20*scale, chestY + 60*scale, 6, '#ffff00');

            // 2. BRAÇOS (Só desenha se não for o próprio player em 1ª pessoa, ou desenha transparente)
            drawLimb(pose.shoulders.l, pose.elbows.l, colors.shirt, 25);
            drawLimb(pose.elbows.l, pose.wrists.l, colors.shirt, 25);
            drawLimb(pose.shoulders.r, pose.elbows.r, colors.shirt, 25);
            drawLimb(pose.elbows.r, pose.wrists.r, colors.shirt, 25);

            // 3. CABEÇA
            if (player.hp <= 0) {
                // KO Visual
                 ctx.font = `bold ${40*scale}px Arial`; ctx.fillStyle='#fff'; ctx.fillText("😵", pose.head.x, pose.head.y);
            } else {
                // Rosto
                drawCircle(pose.head.x, pose.head.y, 45, colors.skin);
                // Boné
                ctx.fillStyle = colors.hat;
                ctx.beginPath(); ctx.arc(pose.head.x, pose.head.y - 10*scale, 46*scale, Math.PI, 0); ctx.fill();
                // Aba
                ctx.beginPath(); ctx.ellipse(pose.head.x, pose.head.y - 12*scale, 50*scale, 15*scale, 0, Math.PI, 0); ctx.fill();
                // Logo 'M' ou 'L'
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pose.head.x, pose.head.y - 35*scale, 12*scale, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = colors.hat; ctx.font = `bold ${16*scale}px Arial`; ctx.textAlign='center';
                ctx.fillText(CHARACTERS[player.charId].name[0], pose.head.x, pose.head.y - 31*scale);

                // Detalhes do Rosto (Só se for o oponente, player vê as costas... ou espelho?)
                // Assumindo estilo ESPELHO para Player e FRENTE para Oponente
                if (!isSelf || true) { // Desenha rosto sempre por enquanto
                    ctx.fillStyle = '#000'; // Olhos
                    drawCircle(pose.head.x - 12*scale, pose.head.y - 10*scale, 4, '#000');
                    drawCircle(pose.head.x + 12*scale, pose.head.y - 10*scale, 4, '#000');
                    // Bigode
                    ctx.beginPath(); ctx.moveTo(pose.head.x, pose.head.y + 20*scale); 
                    ctx.quadraticCurveTo(pose.head.x-20*scale, pose.head.y + 30*scale, pose.head.x-30*scale, pose.head.y + 10*scale); 
                    ctx.quadraticCurveTo(pose.head.x, pose.head.y + 15*scale, pose.head.x+30*scale, pose.head.y + 10*scale);
                    ctx.quadraticCurveTo(pose.head.x+20*scale, pose.head.y + 30*scale, pose.head.x, pose.head.y + 20*scale);
                    ctx.fill();
                }
            }

            // 4. LUVAS (RENDERIZADAS POR ÚLTIMO)
            this.drawGlove(ctx, pose.wrists.l, colors.hat, isSelf, scale);
            this.drawGlove(ctx, pose.wrists.r, colors.hat, isSelf, scale);
        },

        drawGlove: function(ctx, hand, color, isSelf, scale) {
            let s = scale * (isSelf ? 1.5 : 1.0); // Luva do player é maior (perspectiva)
            // Z-Depth effect
            if (hand.state === 'PUNCH') s *= 1.3;

            ctx.save();
            ctx.translate(hand.x, hand.y);
            
            // Efeito de rastro
            if (hand.state === 'PUNCH') {
                ctx.shadowColor = color; ctx.shadowBlur = 20;
            }

            // Gradiente 3D
            const g = ctx.createRadialGradient(-10, -10, 5, 0, 0, 35 * s);
            g.addColorStop(0, '#fff'); g.addColorStop(1, color);
            
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, 35 * s, 0, Math.PI*2); ctx.fill();
            
            // Detalhes (Faixa)
            ctx.fillStyle = '#fff'; ctx.fillRect(-20*s, 10*s, 40*s, 10*s);
            
            ctx.restore();
        },

        drawArena: function(ctx, w, h) {
            const ar = ARENAS[this.selArena];
            const mid = h * 0.55;
            
            // Fundo
            const g = ctx.createLinearGradient(0,0,0,mid);
            g.addColorStop(0, ar.bgTop); g.addColorStop(1, ar.bgBot);
            ctx.fillStyle = g; ctx.fillRect(0,0,w,mid);

            // Chão
            ctx.fillStyle = ar.floor;
            ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.lineTo(w, mid); ctx.lineTo(0, mid); ctx.fill();

            // Cordas
            ctx.strokeStyle = ar.rope; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.moveTo(0, mid - 40); ctx.lineTo(w, mid - 40); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, mid - 100); ctx.lineTo(w, mid - 100); ctx.stroke();
        },

        // -----------------------------------------------------------------
        // UI & EFEITOS
        // -----------------------------------------------------------------
        uiMode: function(ctx, w, h) {
            ctx.fillStyle = "#fff"; ctx.font = "bold 50px 'Russo One'"; ctx.textAlign = "center";
            ctx.fillText("SUPER BOXING", w/2, 100);
            this.drawBtn(ctx, w/2 - 150, h/2, 300, 80, "OFFLINE", this.selMode === 'OFFLINE');
            this.drawBtn(ctx, w/2 - 150, h/2 + 100, 300, 80, "ONLINE", this.selMode === 'ONLINE');
        },

        uiChar: function(ctx, w, h) {
            const c = CHARACTERS[this.selChar];
            ctx.fillStyle = c.colors.overall; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center";
            ctx.font = "bold 40px 'Russo One'"; ctx.fillText("SELECT FIGHTER", w/2, 60);
            ctx.font = "bold 80px 'Russo One'"; ctx.fillText(c.name, w/2, h/2);
            ctx.font = "20px sans-serif"; ctx.fillText("HP: "+c.hp + "  PWR: "+c.power, w/2, h/2+50);
            ctx.fillText("CLIQUE À DIREITA ->", w/2, h - 50);
        },

        uiArena: function(ctx, w, h) {
            const a = ARENAS[this.selArena];
            ctx.fillStyle = a.bgTop; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center";
            ctx.font = "bold 40px 'Russo One'"; ctx.fillText("ARENA", w/2, h/2 - 50);
            ctx.font = "bold 60px 'Russo One'"; ctx.fillText(a.name, w/2, h/2 + 20);
            ctx.font = "20px sans-serif"; ctx.fillText("CLIQUE PARA LUTAR!", w/2, h - 50);
        },

        uiGameOver: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
            const win = this.p1.hp > 0;
            ctx.fillStyle = win ? "#f1c40f" : "#e74c3c";
            ctx.font = "bold 80px 'Russo One'"; ctx.textAlign="center";
            ctx.fillText(win ? "YOU WIN!" : "YOU LOSE", w/2, h/2);
            ctx.fillStyle = "#fff"; ctx.font = "30px sans-serif";
            ctx.fillText("SCORE: " + this.p1.score, w/2, h/2 + 60);
            ctx.fillText("CLIQUE PARA REINICIAR", w/2, h - 50);
        },

        uiLobby: function(ctx, w, h) {
            ctx.fillStyle = "#000"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center";
            ctx.font = "bold 30px 'Russo One'"; ctx.fillText("WAITING FOR PLAYER...", w/2, h/2);
        },

        drawHUD: function(ctx, w, h) {
            const barW = w * 0.35;
            // P1
            ctx.fillStyle = "#444"; ctx.fillRect(20, 20, barW, 25);
            ctx.fillStyle = "#e74c3c"; ctx.fillRect(20, 20, barW * (Math.max(0,this.p1.hp)/this.p1.maxHp), 25);
            // P2
            ctx.fillStyle = "#444"; ctx.fillRect(w - 20 - barW, 20, barW, 25);
            ctx.fillStyle = "#3498db"; ctx.fillRect(w - 20 - barW * (Math.max(0,this.p2.hp)/this.p2.maxHp), 25);
            
            ctx.fillStyle = "#fff"; ctx.font="bold 20px 'Russo One'"; 
            ctx.textAlign="left"; ctx.fillText(CHARACTERS[this.p1.charId].name, 20, 65);
            ctx.textAlign="right"; ctx.fillText(CHARACTERS[this.p2.charId].name, w-20, 65);
            
            ctx.textAlign="center"; ctx.font="40px 'Russo One'"; ctx.fillText(Math.ceil(this.timer/60), w/2, 50);
        },

        drawBtn: function(ctx, x, y, w, h, txt, sel) {
            ctx.fillStyle = sel ? "#e67e22" : "#34495e";
            ctx.fillRect(x,y,w,h);
            ctx.strokeStyle="#fff"; ctx.lineWidth=sel?4:1; ctx.strokeRect(x,y,w,h);
            ctx.fillStyle="#fff"; ctx.font="bold 30px sans-serif"; ctx.fillText(txt, x+w/2, y+h/2+10);
        },

        spawnMsg: function(x, y, t, c) { this.msgs.push({x, y, t, c, life: 40}); },
        updateEffects: function(ctx) {
            this.msgs.forEach((m,i) => {
                m.y-=1; m.life--;
                ctx.fillStyle=m.c; ctx.font="bold 40px 'Russo One'"; ctx.textAlign="center";
                ctx.fillText(m.t, m.x, m.y);
            });
            this.msgs = this.msgs.filter(m=>m.life>0);
        },

        endRound: function() {
            if(this.round < CONF.ROUNDS) {
                this.round++; this.timer = CONF.ROUND_TIME * 60;
                window.System.msg("ROUND " + this.round);
            } else {
                this.state = 'GAMEOVER';
            }
        }
    };

    // REGISTRO NO SISTEMA (CORE)
    if(window.System) window.System.registerGame('box_pro', 'Boxe Ultimate', '🥊', Game, { camOpacity: 0.1 });

})();
