// =============================================================================
// SUPER BOXING: REAL PHYSICS EDITION (FULL FINAL)
// ARQUITETO: PARCEIRO DE PROGRAMACAO
// OBJETIVO: Movimento 1:1 fiel, Multiplayer e Offline Completo
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES & PERSONAGENS
    // -----------------------------------------------------------------

    const CONF = {
        ROUNDS: 3,
        ROUND_TIME: 90,
        BLOCK_DIST: 90,     
        PUNCH_THRESH: 12,   // Sensibilidade do soco (velocidade para ativar)
        PLAYER_SCALE: 1.3,  // Jogador na frente parece maior
        ENEMY_SCALE: 0.95,  // Inimigo no fundo parece menor
        HIT_RADIUS: 50      // Tamanho da área de colisão da luva
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
            hp: 120, power: 1.3 
        },
        { 
            id: 3, name: 'WALUIGI', 
            colors: { hat: '#5e2d85', shirt: '#8e44ad', overall: '#2c3e50', skin: '#ffccaa', glove: '#fff' },
            hp: 100, power: 1.0 
        }
    ];

    const ARENAS = [
        { name: 'CHAMPIONSHIP', bg: '#2c3e50', floor: '#7f8c8d', rope: '#e74c3c' },
        { name: 'UNDERGROUND',  bg: '#2d0e0e', floor: '#3e2723', rope: '#f1c40f' }
    ];

    // Utils Matemáticos
    const Utils = {
        lerp: (curr, target, f) => {
            if(!target || !curr) return curr;
            return { x: curr.x + (target.x - curr.x) * f, y: curr.y + (target.y - curr.y) * f };
        },
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
        // Mapeia coordenadas normalizadas (0-640) para tamanho da tela (Window)
        toScreen: (kp, w, h) => ({ x: (1 - kp.x / 640) * w, y: (kp.y / 480) * h })
    };

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO
    // -----------------------------------------------------------------

    const Game = {
        state: 'MODE_SELECT', // Estados: MODE_SELECT, CHAR_SELECT, LOBBY, FIGHT, GAMEOVER
        roomId: 'box_real_01',
        isOnline: false,
        dbRef: null,
        
        selMode: 'OFFLINE',
        selChar: 0,
        selArena: 0,
        
        timer: 0,
        round: 1,
        
        // Estruturas de Jogador
        p1: { id: 'p1', charId: 0, hp: 100, maxHp: 100, guard: false, stamina: 100, score: 0, pose: null },
        p2: { id: 'p2', charId: 1, hp: 100, maxHp: 100, guard: false, isRemote: false, aiTimer: 0, pose: null },

        msgs: [], // Mensagens flutuantes (Dano, Pow, Block)

        // --- INICIALIZAÇÃO ---
        init: function() {
            this.state = 'MODE_SELECT';
            this.cleanup();
            if(window.System.msg) window.System.msg("REAL BOXING");
            this.initPose(this.p1);
            this.initPose(this.p2);
            this.setupInput();
        },

        initPose: function(p) {
            // Cria a estrutura vazia do esqueleto para evitar erros de leitura antes da câmera ligar
            p.pose = {
                head: {x:0,y:0},
                shoulders: {l:{x:0,y:0}, r:{x:0,y:0}},
                elbows: {l:{x:0,y:0}, r:{x:0,y:0}},
                wrists: {l:{x:0,y:0, z:0, state:'IDLE'}, r:{x:0,y:0, z:0, state:'IDLE'}}
            };
        },

        cleanup: function() {
            // Remove listeners do Firebase ao sair
            if (this.dbRef && window.System.playerId) {
                try { this.dbRef.child('players/' + window.System.playerId).remove(); this.dbRef.off(); } catch(e){}
            }
            window.System.canvas.onclick = null;
        },

        setupInput: function() {
            // Gerencia cliques nos menus
            window.System.canvas.onclick = (e) => {
                const r = window.System.canvas.getBoundingClientRect();
                const y = (e.clientY - r.top) / r.height;
                const x = (e.clientX - r.left) / r.width;
                
                if (this.state === 'MODE_SELECT') {
                    this.setMode(y < 0.5 ? 'OFFLINE' : 'ONLINE');
                } else if (this.state === 'CHAR_SELECT') {
                    this.selChar = (this.selChar + 1) % CHARACTERS.length;
                    window.Sfx.play(600, 'square', 0.1);
                    // Se clicar na direita da tela, confirma
                    if (x > 0.7) { 
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
                // Configurar CPU Inteligente
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
            
            // Regista o jogador na sala
            this.dbRef.child('players/' + window.System.playerId).set({
                charId: this.selChar,
                hp: this.p1.hp,
                ready: true
            });
            this.dbRef.child('players/' + window.System.playerId).onDisconnect().remove();

            // Ouve mudanças na sala (oponente entrou, oponente mexeu-se)
            this.dbRef.child('players').on('value', snap => {
                const players = snap.val();
                if (!players) return;
                const opId = Object.keys(players).find(id => id !== window.System.playerId);
                
                if (opId) {
                    const opData = players[opId];
                    if (this.state === 'LOBBY') {
                        // Iniciar Luta
                        this.p2.charId = opData.charId || 0;
                        this.p2.hp = opData.hp || 100;
                        this.p2.maxHp = CHARACTERS[this.p2.charId].hp;
                        this.p2.isRemote = true;
                        this.p2.id = opId;
                        this.state = 'FIGHT';
                        this.timer = CONF.ROUND_TIME * 60;
                        window.System.msg("VS ONLINE");
                    } else if (this.state === 'FIGHT') {
                        // Atualiza dados do inimigo
                        this.p2.hp = opData.hp;
                        if (opData.pose) this.lerpPose(this.p2.pose, opData.pose);
                    }
                } else if (this.state === 'FIGHT') {
                    window.System.msg("OPONENTE SAIU");
                    this.state = 'GAMEOVER';
                }
            });
        },

        lerpPose: function(local, remote) {
            // Suavização do movimento online
            const f = 0.5; 
            local.head = Utils.lerp(local.head, remote.head, f);
            local.shoulders.l = Utils.lerp(local.shoulders.l, remote.shoulders.l, f);
            local.shoulders.r = Utils.lerp(local.shoulders.r, remote.shoulders.r, f);
            local.elbows.l = Utils.lerp(local.elbows.l, remote.elbows.l, f);
            local.elbows.r = Utils.lerp(local.elbows.r, remote.elbows.r, f);
            local.wrists.l = Utils.lerp(local.wrists.l, remote.wrists.l, f);
            local.wrists.r = Utils.lerp(local.wrists.r, remote.wrists.r, f);
            local.wrists.l.state = remote.wrists.l.state;
            local.wrists.r.state = remote.wrists.r.state;
        },

        // -----------------------------------------------------------------
        // LOOP PRINCIPAL DO JOGO (UPDATE)
        // -----------------------------------------------------------------
        update: function(ctx, w, h, inputPose) {
            // Fundo Escuro para Menus
            if (this.state !== 'FIGHT') {
                ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0,0,w,h);
            }

            // Gerenciamento de Estados
            if (this.state === 'MODE_SELECT') { this.uiMode(ctx, w, h); return; }
            if (this.state === 'CHAR_SELECT') { this.uiChar(ctx, w, h); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiGameOver(ctx, w, h); return; }

            // === LUTA ATIVA ===
            
            // 1. Processar Câmera (Input)
            this.processInput(inputPose, w, h);

            // 2. Processar Lógica (Online ou AI)
            if (this.isOnline) this.syncOnline();
            else this.updateAI(w, h);

            // 3. Renderizar Cenário
            this.drawArena(ctx, w, h);

            // 4. Renderizar Lutadores
            // Desenha Inimigo (No Fundo, Opaco)
            this.drawCharacter(ctx, this.p2, w, h, false);
            
            // Desenha Jogador (Na Frente, Translúcido "Raio-X")
            ctx.globalAlpha = 0.7;
            this.drawCharacter(ctx, this.p1, w, h, true);
            ctx.globalAlpha = 1.0;

            // 5. Interface e Efeitos
            this.drawHUD(ctx, w, h);
            this.updateMsgs(ctx);

            // Tempo e Fim de Round
            if (this.timer > 0) this.timer--;
            else this.endRound();

            if (this.p1.hp <= 0 || this.p2.hp <= 0) this.state = 'GAMEOVER';
            
            // Retorna Score para o Core
            return this.p1.score;
        },

        processInput: function(input, w, h) {
            if (!input || !input.keypoints) return;
            const kp = input.keypoints;
            const p = this.p1.pose;

            const get = (name, old) => {
                const k = kp.find(pt => pt.name === name);
                // Usa 0.7 para resposta rápida (fiel ao movimento)
                return (k && k.score > 0.4) ? 
                    { x: old.x + (Utils.toScreen(k, w, h).x - old.x) * 0.7, 
                      y: old.y + (Utils.toScreen(k, w, h).y - old.y) * 0.7 } 
                    : old;
            };

            // Atualiza esqueleto
            p.head = get('nose', p.head);
            p.shoulders.l = get('left_shoulder', p.shoulders.l);
            p.shoulders.r = get('right_shoulder', p.shoulders.r);
            p.elbows.l = get('left_elbow', p.elbows.l);
            p.elbows.r = get('right_elbow', p.elbows.r);
            
            this.updateHand(p.wrists.l, get('left_wrist', p.wrists.l), w, h);
            this.updateHand(p.wrists.r, get('right_wrist', p.wrists.r), w, h);

            // Guarda Ativa se mãos perto do rosto
            const dL = Utils.dist(p.wrists.l, p.head);
            const dR = Utils.dist(p.wrists.r, p.head);
            this.p1.guard = (dL < CONF.BLOCK_DIST && dR < CONF.BLOCK_DIST);
            
            // Regenera Stamina
            if(this.p1.stamina < 100) this.p1.stamina += 0.5;
        },

        updateHand: function(hand, target, w, h) {
            // CÁLCULO DE VELOCIDADE
            const speed = Utils.dist(hand, target);
            
            // 1:1 MOVEMENT - A mão virtual vai exatamente para onde a mão real vai
            hand.x = target.x;
            hand.y = target.y;

            // GATILHO DE SOCO (Baseado em velocidade explosiva)
            if (speed > CONF.PUNCH_THRESH && hand.state === 'IDLE' && this.p1.stamina > 10) {
                hand.state = 'PUNCH';
                hand.z = 0; 
                this.p1.stamina -= 15;
                if(window.Sfx) window.Sfx.play(200, 'noise', 0.1);
            }

            // LÓGICA DE PROFUNDIDADE (Z)
            if (hand.state === 'PUNCH') {
                hand.z += 12; // Avança para dentro da tela
                
                // PONTO DE IMPACTO (Apex do soco)
                if (hand.z > 50 && hand.z < 70) {
                    this.checkHit(hand);
                }

                if (hand.z > 90) hand.state = 'RETRACT';
            } else if (hand.state === 'RETRACT') {
                hand.z -= 10;
                if (hand.z <= 0) { hand.z = 0; hand.state = 'IDLE'; }
            }
        },

        checkHit: function(hand) {
            // DETECÇÃO DE COLISÃO
            // Hitbox projetada baseada na posição visual do inimigo na tela
            
            const enemy = this.p2.pose;
            const cx = (enemy.shoulders.l.x + enemy.shoulders.r.x) / 2;
            const cy = (enemy.shoulders.l.y + enemy.shoulders.r.y) / 2;

            // Áreas de colisão
            const headBox = { x: enemy.head.x, y: enemy.head.y, r: 60 };
            const bodyBox = { x: cx, y: cy + 60, r: 80 };

            // Verifica colisão da mão (x,y) com as hitboxes do inimigo
            const hitHead = Utils.dist(hand, headBox) < (headBox.r + 20);
            const hitBody = Utils.dist(hand, bodyBox) < (bodyBox.r + 20);

            if (hitHead || hitBody) {
                if (this.p2.guard) {
                    this.spawnMsg(headBox.x, headBox.y - 50, "DEFESA", "#aaa");
                    window.Sfx.play(100, 'square', 0.1);
                } else {
                    const baseDmg = CHARACTERS[this.p1.charId].power;
                    let dmg = 0;

                    if (hitHead) {
                        dmg = 8 * baseDmg;
                        this.spawnMsg(headBox.x, headBox.y - 50, "CRITICAL!", "#f00");
                        window.Sfx.hit(); // Som forte
                    } else {
                        dmg = 4 * baseDmg;
                        this.spawnMsg(bodyBox.x, bodyBox.y, "BODY", "#ff0");
                        window.Sfx.play(150, 'sine', 0.3); // Som surdo
                    }

                    this.p2.hp -= dmg;
                    this.p1.score += Math.floor(dmg * 10);
                    
                    // Efeito de Tremer a tela
                    if(window.Gfx && window.Gfx.shakeScreen) window.Gfx.shakeScreen(hitHead ? 10 : 4);
                    
                    // Atualiza Firebase
                    if(this.isOnline) {
                        this.dbRef.child('players/' + this.p2.id).update({ hp: this.p2.hp });
                    }
                }
                hand.state = 'RETRACT'; // Rebate ao acertar
            }
        },

        updateAI: function(w, h) {
            const ai = this.p2;
            const p = ai.pose;
            const time = Date.now() * 0.002;
            
            // AI "Viva" - Respiração e movimento
            const cx = w/2; // AI sempre tenta ficar no centro
            const cy = h * 0.35;
            
            p.head = { x: cx + Math.sin(time)*40, y: cy + Math.cos(time*2)*10 };
            p.shoulders.l = { x: p.head.x - 55, y: p.head.y + 70 };
            p.shoulders.r = { x: p.head.x + 55, y: p.head.y + 70 };
            p.elbows.l = { x: p.shoulders.l.x - 25, y: p.shoulders.l.y + 65 };
            p.elbows.r = { x: p.shoulders.r.x + 25, y: p.shoulders.r.y + 65 };
            
            // Mãos da AI
            ['l', 'r'].forEach(s => {
                const hnd = p.wrists[s];
                const baseH = ai.guard ? p.head.y : p.head.y + 80;
                const baseX = p.head.x + (s==='l'?-45:45);

                if (hnd.state === 'IDLE') {
                    hnd.x += (baseX - hnd.x) * 0.1;
                    hnd.y += (baseH - hnd.y) * 0.1;
                } else if (hnd.state === 'PUNCH') {
                    hnd.z += 9;
                    // AI Mira no Player (centro da tela onde player está)
                    hnd.x += ((w/2) - hnd.x) * 0.15;
                    hnd.y += ((h/2 + 50) - hnd.y) * 0.15;
                    
                    if (hnd.z > 60 && !this.p1.guard && hnd.z < 80) {
                        this.p1.hp -= 3;
                        if(window.Gfx && window.Gfx.shakeScreen) window.Gfx.shakeScreen(5);
                        this.spawnMsg(w/2, h/2, "OUCH", "#f00");
                        hnd.state = 'RETRACT';
                    }
                    if (hnd.z > 90) hnd.state = 'RETRACT';
                } else {
                    hnd.z -= 10;
                    if (hnd.z <= 0) { hnd.z = 0; hnd.state = 'IDLE'; }
                }
            });

            // Lógica de Decisão da AI
            if (ai.aiTimer-- <= 0) {
                if (Math.random() < 0.04) {
                    const h = Math.random()>0.5 ? p.wrists.l : p.wrists.r;
                    h.state = 'PUNCH';
                    ai.aiTimer = 50;
                } else if (Math.random() < 0.03) {
                    ai.guard = !ai.guard;
                    ai.aiTimer = 60;
                }
            }
        },

        syncOnline: function() {
            // Envia pose a cada 3 frames para economizar banda
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
        // RENDERIZAÇÃO
        // -----------------------------------------------------------------
        drawCharacter: function(ctx, player, w, h, isSelf) {
            const pose = player.pose;
            if (pose.shoulders.l.x === 0) return;

            const conf = CHARACTERS[player.charId].colors;
            let shoulderDist = Utils.dist(pose.shoulders.l, pose.shoulders.r);
            if (!isSelf) shoulderDist = 100; // Estabiliza tamanho do inimigo

            // Escala dinâmica
            const scale = (shoulderDist / 100) * (isSelf ? CONF.PLAYER_SCALE : CONF.ENEMY_SCALE);

            // Helpers de Desenho
            const drawLine = (p1, p2, color, width) => {
                if (p1.x===0||p2.x===0) return;
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                ctx.lineCap='round'; ctx.lineJoin='round';
                ctx.lineWidth = width * scale; ctx.strokeStyle = color; ctx.stroke();
            };
            const drawCircle = (p, r, color) => {
                ctx.beginPath(); ctx.arc(p.x, p.y, r*scale, 0, Math.PI*2); ctx.fillStyle=color; ctx.fill();
            };

            const cx = (pose.shoulders.l.x + pose.shoulders.r.x) / 2;
            const cy = (pose.shoulders.l.y + pose.shoulders.r.y) / 2;

            // 1. Corpo (Macacão)
            ctx.fillStyle = conf.shirt;
            ctx.beginPath(); ctx.ellipse(cx, cy + (40*scale), 50*scale, 70*scale, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = conf.overall;
            ctx.fillRect(cx - 35*scale, cy + 50*scale, 70*scale, 80*scale);
            
            // Alças e Botões
            drawLine(pose.shoulders.l, {x:cx-20*scale, y:cy+60*scale}, conf.overall, 10);
            drawLine(pose.shoulders.r, {x:cx+20*scale, y:cy+60*scale}, conf.overall, 10);
            drawCircle({x:cx-20*scale, y:cy+60*scale}, 6, '#ff0');
            drawCircle({x:cx+20*scale, y:cy+60*scale}, 6, '#ff0');

            // 2. Braços
            const aw = 24;
            drawLine(pose.shoulders.l, pose.elbows.l, conf.shirt, aw);
            drawLine(pose.elbows.l, pose.wrists.l, conf.shirt, aw);
            drawLine(pose.shoulders.r, pose.elbows.r, conf.shirt, aw);
            drawLine(pose.elbows.r, pose.wrists.r, conf.shirt, aw);

            // 3. Cabeça
            drawCircle(pose.head, 45, conf.skin);
            ctx.fillStyle = conf.hat;
            ctx.beginPath(); ctx.arc(pose.head.x, pose.head.y - 10*scale, 46*scale, Math.PI, 0); ctx.fill();
            ctx.beginPath(); ctx.ellipse(pose.head.x, pose.head.y - 12*scale, 50*scale, 15*scale, 0, Math.PI, 0); ctx.fill();
            
            drawCircle({x:pose.head.x, y:pose.head.y-35*scale}, 12, '#fff');
            ctx.fillStyle=conf.hat; ctx.font=`bold ${16*scale}px Arial`; ctx.textAlign='center';
            ctx.fillText(CHARACTERS[player.charId].name[0], pose.head.x, pose.head.y-30*scale);

            // 4. Luvas (Desenhadas por último)
            this.drawGlove(ctx, pose.wrists.l, conf.glove, scale);
            this.drawGlove(ctx, pose.wrists.r, conf.glove, scale);
        },

        drawGlove: function(ctx, hand, color, scale) {
            if(hand.x===0) return;
            
            // Efeito visual de profundidade
            // Soco vai para longe (Z alto) -> Luva diminui ligeiramente para dar perspectiva
            const zFactor = 1.0 - (hand.z * 0.003); 
            const s = scale * zFactor;

            ctx.save();
            ctx.translate(hand.x, hand.y);
            
            if(hand.state === 'PUNCH') {
                ctx.shadowColor = '#000'; ctx.shadowBlur = 15;
            }

            const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, 35*s);
            g.addColorStop(0, '#fff'); g.addColorStop(1, '#ddd');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, 35*s, 0, Math.PI*2); ctx.fill();
            
            // Faixa Vermelha da Luva
            ctx.fillStyle = '#f00'; ctx.fillRect(-15*s, 10*s, 30*s, 12*s);
            ctx.restore();
        },

        drawArena: function(ctx, w, h) {
            const ar = ARENAS[this.selArena];
            const mid = h * 0.6;
            const g = ctx.createLinearGradient(0,0,0,mid);
            g.addColorStop(0, ar.bg); g.addColorStop(1, '#000');
            ctx.fillStyle = g; ctx.fillRect(0,0,w,mid);
            ctx.fillStyle = ar.floor; ctx.fillRect(0,mid,w,h-mid);
            ctx.strokeStyle = ar.rope; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.moveTo(0, mid-50); ctx.lineTo(w, mid-50); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, mid-120); ctx.lineTo(w, mid-120); ctx.stroke();
        },

        // --- UI & MENUS ---
        uiMode: function(ctx, w, h) {
            ctx.fillStyle = "#fff"; ctx.font = "bold 50px 'Russo One'"; ctx.textAlign = "center";
            ctx.fillText("REAL BOXING", w/2, 100);
            this.btn(ctx, w/2, h/2 - 60, "OFFLINE", this.selMode==='OFFLINE');
            this.btn(ctx, w/2, h/2 + 60, "ONLINE", this.selMode==='ONLINE');
        },

        uiChar: function(ctx, w, h) {
            const c = CHARACTERS[this.selChar];
            ctx.fillStyle = c.colors.overall; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center";
            ctx.font = "bold 50px 'Russo One'"; ctx.fillText(c.name, w/2, h/2);
            ctx.font = "20px sans-serif"; ctx.fillText("CLIQUE NA DIREITA PARA INICIAR", w/2, h-50);
            
            ctx.fillStyle = c.colors.hat; 
            ctx.beginPath(); ctx.arc(w/2, h/2 - 100, 80, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "#fff"; ctx.font="80px Arial"; ctx.fillText(c.name[0], w/2, h/2-75);
        },

        uiLobby: function(ctx, w, h) {
            ctx.fillStyle = "#000"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center"; 
            ctx.font="30px 'Russo One'"; ctx.fillText("AGUARDANDO...", w/2, h/2);
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
            // Barra P1
            ctx.fillStyle = "#333"; ctx.fillRect(10, 10, bar, 30);
            ctx.fillStyle = "#e74c3c"; ctx.fillRect(10, 10, bar * (Math.max(0,this.p1.hp)/100), 30);
            
            // Barra P2
            ctx.fillStyle = "#333"; ctx.fillRect(w-10-bar, 10, bar, 30);
            ctx.fillStyle = "#3498db"; ctx.fillRect(w-10-bar, 10, bar * (Math.max(0,this.p2.hp)/100), 30);

            ctx.fillStyle="#fff"; ctx.font="bold 20px sans-serif";
            ctx.textAlign="left"; ctx.fillText("P1", 15, 32);
            ctx.textAlign="right"; ctx.fillText("CPU", w-15, 32);
            
            // Stamina
            ctx.fillStyle = "#f1c40f"; ctx.fillRect(10, 45, bar * (this.p1.stamina/100), 5);
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
                ctx.fillStyle=m.c; ctx.font="bold 40px Impact"; ctx.textAlign="center"; ctx.strokeText(m.t, m.x, m.y); ctx.fillText(m.t, m.x, m.y);
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

    // REGISTRO NO SISTEMA
    if(window.System) window.System.registerGame('box_pro', 'Real Boxing', '🥊', Game, { camOpacity: 0.1 });

})();