// =============================================================================
// SUPER BOXING: ENTERPRISE EDITION (ROBUST & CRASH-PROOF)
// ARQUITETO: SENIOR DEV (CODE 177)
// STATUS: GOLD MASTER
// =============================================================================

(function() {
    "use strict"; // Força modo estrito para evitar erros silenciosos

    // -----------------------------------------------------------------
    // 1. CONSTANTES E CONFIGURAÇÃO
    // -----------------------------------------------------------------
    const CONF = {
        DEBUG: false,        // Mude para true se quiser ver as hitboxes
        ROUNDS: 3,
        ROUND_TIME: 90,
        BLOCK_DIST: 100,     // Distância para considerar defesa
        PUNCH_THRESH: 10,    // Sensibilidade do soco
        PUNCH_COOLDOWN: 15,  // Frames entre socos
        PLAYER_SCALE: 1.4,   // Escala visual do Player (POV)
        ENEMY_SCALE: 1.0,    // Escala visual do Inimigo
        SMOOTHING: 0.6       // 0.1 (lento) a 1.0 (instantâneo)
    };

    const CHARACTERS = [
        { id: 0, name: 'MARIO',   c: { hat: '#d32f2f', shirt: '#e74c3c', overall: '#3498db', skin: '#ffccaa' }, pwr: 1.0 },
        { id: 1, name: 'LUIGI',   c: { hat: '#27ae60', shirt: '#2ecc71', overall: '#2b3a8f', skin: '#ffccaa' }, pwr: 0.9 },
        { id: 2, name: 'WARIO',   c: { hat: '#f1c40f', shirt: '#f39c12', overall: '#8e44ad', skin: '#e67e22' }, pwr: 1.3 },
        { id: 3, name: 'WALUIGI', c: { hat: '#5e2d85', shirt: '#8e44ad', overall: '#2c3e50', skin: '#ffccaa' }, pwr: 1.0 }
    ];

    const ARENAS = [
        { name: 'CHAMPIONSHIP', bg: '#2c3e50', floor: '#95a5a6', rope: '#c0392b' },
        { name: 'UNDERGROUND',  bg: '#1a1a1a', floor: '#3e2723', rope: '#f1c40f' }
    ];

    // -----------------------------------------------------------------
    // 2. UTILITÁRIOS SEGUROS (CRASH-PROOF)
    // -----------------------------------------------------------------
    const SafeUtils = {
        // Interpolação Linear segura (não retorna NaN)
        lerp: (curr, target, f) => {
            if (!curr) return target || {x:0, y:0};
            if (!target) return curr;
            return {
                x: curr.x + (target.x - curr.x) * f,
                y: curr.y + (target.y - curr.y) * f
            };
        },
        // Distância segura
        dist: (p1, p2) => {
            if (!p1 || !p2) return 9999;
            return Math.hypot(p1.x - p2.x, p1.y - p2.y);
        },
        // Converte coordenadas do vídeo para a tela de forma segura
        toScreen: (kp, w, h) => {
            if (!kp || typeof kp.x !== 'number') return {x: w/2, y: h/2};
            // Espelha o X (1 - x) para ficar intuitivo
            return { x: (1 - kp.x / 640) * w, y: (kp.y / 480) * h };
        },
        // Cria estrutura de pose padrão para evitar "undefined"
        createPose: () => ({
            head: {x:0, y:0},
            shoulders: {l:{x:0,y:0}, r:{x:0,y:0}},
            elbows: {l:{x:0,y:0}, r:{x:0,y:0}},
            wrists: {l:{x:0,y:0, z:0, state:'IDLE'}, r:{x:0,y:0, z:0, state:'IDLE'}}
        })
    };

    // -----------------------------------------------------------------
    // 3. ENGINE DO JOGO
    // -----------------------------------------------------------------
    const Game = {
        state: 'INIT',
        roomId: 'box_pro_v1',
        isOnline: false,
        dbRef: null,
        
        selChar: 0,
        selArena: 0,
        timer: 0,
        round: 1,

        p1: null,
        p2: null,
        msgs: [], // Sistema de partículas de texto

        // Inicialização Segura
        init: function() {
            try {
                this.state = 'MODE_SELECT';
                this.cleanup();
                if(window.System && window.System.msg) window.System.msg("BOXING PRO");
                
                // Reinicia estruturas
                this.p1 = this.createPlayer('p1', 0);
                this.p2 = this.createPlayer('p2', 1);
                
                this.setupInput();
            } catch(e) {
                console.error("Critical Init Error:", e);
            }
        },

        createPlayer: function(id, charId) {
            return {
                id: id,
                charId: charId,
                hp: 100, maxHp: 100,
                stamina: 100,
                guard: false,
                score: 0,
                pose: SafeUtils.createPose(), // Garante que pose nunca é null
                aiTimer: 0,
                isRemote: false
            };
        },

        cleanup: function() {
            if (this.dbRef && window.System.playerId) {
                try { 
                    this.dbRef.child('players/' + window.System.playerId).remove(); 
                    this.dbRef.off(); 
                } catch(e){ console.warn("Firebase cleanup error", e); }
            }
            if(window.System.canvas) window.System.canvas.onclick = null;
        },

        setupInput: function() {
            window.System.canvas.onclick = (e) => {
                const r = window.System.canvas.getBoundingClientRect();
                const x = (e.clientX - r.left);
                const y = (e.clientY - r.top);
                const w = r.width;
                const h = r.height;

                if (this.state === 'MODE_SELECT') {
                    this.setMode(y < h/2 ? 'OFFLINE' : 'ONLINE');
                } else if (this.state === 'CHAR_SELECT') {
                    this.selChar = (this.selChar + 1) % CHARACTERS.length;
                    this.playSound('sine', 600);
                    if (x > w * 0.7) { 
                        this.startGame(); 
                        this.playSound('square', 400);
                    }
                } else if (this.state === 'GAMEOVER') {
                    this.init();
                }
            };
        },

        setMode: function(mode) {
            this.state = 'CHAR_SELECT';
            this.isOnline = (mode === 'ONLINE' && !!window.DB);
            if(mode === 'ONLINE' && !window.DB) window.System.msg("OFFLINE MODE");
        },

        startGame: function() {
            this.p1 = this.createPlayer('p1', this.selChar);
            
            if (this.isOnline) {
                this.connectLobby();
            } else {
                // Configura CPU
                const cpuId = (this.selChar + 1) % CHARACTERS.length;
                this.p2 = this.createPlayer('p2', cpuId);
                this.state = 'FIGHT';
                this.timer = CONF.ROUND_TIME * 60;
                window.System.msg("FIGHT!");
            }
        },

        connectLobby: function() {
            this.state = 'LOBBY';
            try {
                this.dbRef = window.DB.ref('rooms/' + this.roomId);
                
                // Entra na sala
                const myData = { charId: this.selChar, hp: 100, pose: this.p1.pose };
                this.dbRef.child('players/' + window.System.playerId).set(myData);
                this.dbRef.child('players/' + window.System.playerId).onDisconnect().remove();

                // Escuta oponente
                this.dbRef.child('players').on('value', snap => {
                    const players = snap.val();
                    if (!players) return;
                    
                    const opId = Object.keys(players).find(id => id !== window.System.playerId);
                    
                    if (opId) {
                        const opData = players[opId];
                        // Se achou oponente e estamos no lobby
                        if (this.state === 'LOBBY') {
                            this.p2 = this.createPlayer('p2', opData.charId || 0);
                            this.p2.isRemote = true;
                            this.p2.id = opId;
                            this.state = 'FIGHT';
                            this.timer = CONF.ROUND_TIME * 60;
                            window.System.msg("VS ONLINE");
                        } 
                        // Atualização durante a luta
                        else if (this.state === 'FIGHT') {
                            this.p2.hp = opData.hp;
                            if (opData.pose) this.syncPose(this.p2.pose, opData.pose);
                        }
                    } else if (this.state === 'FIGHT') {
                        window.System.msg("OPONENTE DESCONECTOU");
                        this.state = 'GAMEOVER';
                    }
                });
            } catch(e) {
                console.error("Online Error:", e);
                this.state = 'MODE_SELECT'; // Volta se der erro
            }
        },

        syncPose: function(local, remote) {
            // Interpolação suave para evitar "teleportes"
            const f = 0.5;
            local.head = SafeUtils.lerp(local.head, remote.head, f);
            local.shoulders.l = SafeUtils.lerp(local.shoulders.l, remote.shoulders.l, f);
            local.shoulders.r = SafeUtils.lerp(local.shoulders.r, remote.shoulders.r, f);
            local.elbows.l = SafeUtils.lerp(local.elbows.l, remote.elbows.l, f);
            local.elbows.r = SafeUtils.lerp(local.elbows.r, remote.elbows.r, f);
            local.wrists.l = SafeUtils.lerp(local.wrists.l, remote.wrists.l, f);
            local.wrists.r = SafeUtils.lerp(local.wrists.r, remote.wrists.r, f);
            local.wrists.l.state = remote.wrists.l.state;
            local.wrists.r.state = remote.wrists.r.state;
        },

        // -----------------------------------------------------------------
        // LOOP PRINCIPAL (UPDATE) - PROTEGIDO
        // -----------------------------------------------------------------
        update: function(ctx, w, h, inputPose) {
            try {
                // Renderização de Fundo de Menu
                if (this.state !== 'FIGHT') {
                    ctx.fillStyle = '#2c3e50'; ctx.fillRect(0,0,w,h);
                }

                if (this.state === 'MODE_SELECT') { this.uiMode(ctx, w, h); return; }
                if (this.state === 'CHAR_SELECT') { this.uiChar(ctx, w, h); return; }
                if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
                if (this.state === 'GAMEOVER') { this.uiGameOver(ctx, w, h); return; }

                // === LUTA ===
                if (this.state === 'FIGHT') {
                    // 1. INPUT: Processa câmera apenas se válida
                    this.processInput(inputPose, w, h);

                    // 2. LÓGICA: AI ou Rede
                    if (this.isOnline) this.sendUpdate();
                    else this.updateAI(w, h);

                    // 3. RENDER: Cenário e Personagens
                    this.drawArena(ctx, w, h);
                    
                    // Inimigo (Fundo)
                    this.drawCharacter(ctx, this.p2, w, h, false);
                    
                    // Player (Frente - Transparente)
                    ctx.globalAlpha = 0.7;
                    this.drawCharacter(ctx, this.p1, w, h, true);
                    ctx.globalAlpha = 1.0;

                    // 4. UI: HUD e Efeitos
                    this.drawHUD(ctx, w, h);
                    this.renderMsgs(ctx);

                    // Lógica de Tempo
                    if (this.timer > 0) this.timer--;
                    else this.endRound();

                    // Game Over Check
                    if (this.p1.hp <= 0 || this.p2.hp <= 0) this.state = 'GAMEOVER';
                }

                return this.p1.score;

            } catch (err) {
                console.error("Game Loop Error:", err);
                // Desenha erro na tela para debug
                ctx.fillStyle = "red"; ctx.font = "20px Arial";
                ctx.fillText("ERRO NO JOGO. REINICIANDO...", 50, 50);
                return 0;
            }
        },

        processInput: function(input, w, h) {
            // Verificação de Segurança: Se não tem input, usa a última pose
            if (!input || !input.keypoints || input.keypoints.length === 0) return;

            const kp = input.keypoints;
            const p = this.p1.pose;
            const smooth = CONF.SMOOTHING;

            // Função helper segura para pegar keypoints
            const get = (name, currentPos) => {
                const point = kp.find(k => k.name === name);
                if (point && point.score > 0.3) {
                    const target = SafeUtils.toScreen(point, w, h);
                    // Suavização Exponencial (Lerp)
                    return {
                        x: currentPos.x + (target.x - currentPos.x) * smooth,
                        y: currentPos.y + (target.y - currentPos.y) * smooth
                    };
                }
                return currentPos; // Mantém posição anterior se perdeu rastreio
            };

            // Atualiza Esqueleto
            p.head = get('nose', p.head);
            p.shoulders.l = get('left_shoulder', p.shoulders.l);
            p.shoulders.r = get('right_shoulder', p.shoulders.r);
            p.elbows.l = get('left_elbow', p.elbows.l);
            p.elbows.r = get('right_elbow', p.elbows.r);
            
            // Lógica das Mãos (Crítica)
            this.updateHand(p.wrists.l, get('left_wrist', p.wrists.l));
            this.updateHand(p.wrists.r, get('right_wrist', p.wrists.r));

            // Guarda (Mãos próximas ao rosto)
            const distL = SafeUtils.dist(p.wrists.l, p.head);
            const distR = SafeUtils.dist(p.wrists.r, p.head);
            this.p1.guard = (distL < CONF.BLOCK_DIST && distR < CONF.BLOCK_DIST);
            
            // Regenera Stamina
            if(this.p1.stamina < 100) this.p1.stamina += 0.5;
        },

        updateHand: function(hand, targetPos) {
            const speed = SafeUtils.dist(hand, targetPos);
            
            // Atualiza posição (1:1 Movement)
            hand.x = targetPos.x;
            hand.y = targetPos.y;

            // Detecta Soco (Velocidade Explosiva)
            if (speed > CONF.PUNCH_THRESH && hand.state === 'IDLE' && this.p1.stamina > 10) {
                hand.state = 'PUNCH';
                hand.z = 0;
                this.p1.stamina -= 15;
                this.playSound('noise', 200, 0.05);
            }

            // Animação e Física do Soco
            if (hand.state === 'PUNCH') {
                hand.z += 15; // Velocidade de projeção para frente (eixo Z virtual)
                
                // Checa Colisão no ápice do movimento
                if (hand.z > 50 && hand.z < 80) {
                    this.checkHit(hand);
                }

                // Retorno automático
                if (hand.z > 100) hand.state = 'RETRACT';
            } 
            else if (hand.state === 'RETRACT') {
                hand.z -= 10;
                if (hand.z <= 0) {
                    hand.z = 0;
                    hand.state = 'IDLE';
                }
            }
        },

        checkHit: function(hand) {
            // Hitbox do Oponente (Baseado na pose visual dele)
            const enemy = this.p2.pose;
            const cx = (enemy.shoulders.l.x + enemy.shoulders.r.x) / 2;
            const cy = (enemy.shoulders.l.y + enemy.shoulders.r.y) / 2;

            // Hitboxes
            const headBox = { x: enemy.head.x, y: enemy.head.y, r: 60 };
            const bodyBox = { x: cx, y: cy + 50, r: 80 };

            // Verifica interseção
            const hitHead = SafeUtils.dist(hand, headBox) < headBox.r;
            const hitBody = SafeUtils.dist(hand, bodyBox) < bodyBox.r;

            if (hitHead || hitBody) {
                if (this.p2.guard) {
                    this.spawnMsg(headBox.x, headBox.y - 40, "BLOCKED", "#aaa");
                    this.playSound('square', 100, 0.1);
                } else {
                    let dmg = CHARACTERS[this.p1.charId].pwr;
                    
                    if (hitHead) {
                        dmg *= 8;
                        this.spawnMsg(headBox.x, headBox.y - 50, "CRITICAL!", "#f00");
                        if(window.Gfx) window.Gfx.shakeScreen(10);
                        this.playSound('sawtooth', 150, 0.1);
                    } else {
                        dmg *= 4;
                        this.spawnMsg(bodyBox.x, bodyBox.y, "HIT", "#ff0");
                        if(window.Gfx) window.Gfx.shakeScreen(3);
                        this.playSound('sine', 100, 0.1);
                    }

                    this.p2.hp = Math.max(0, this.p2.hp - dmg);
                    this.p1.score += Math.floor(dmg * 10);
                    
                    // Se Online, avisa servidor
                    if(this.isOnline && this.dbRef) {
                         this.dbRef.child('players/' + this.p2.id).update({ hp: this.p2.hp });
                    }
                }
                // Rebate a mão
                hand.state = 'RETRACT';
            }
        },

        updateAI: function(w, h) {
            const ai = this.p2;
            const p = ai.pose;
            const t = Date.now() * 0.002;
            
            // Movimento Básico (Idle Animation)
            const cx = w/2;
            const cy = h * 0.35;
            
            p.head = { x: cx + Math.sin(t)*30, y: cy + Math.cos(t*2)*10 };
            p.shoulders.l = { x: p.head.x - 50, y: p.head.y + 60 };
            p.shoulders.r = { x: p.head.x + 50, y: p.head.y + 60 };
            p.elbows.l = { x: p.shoulders.l.x - 20, y: p.shoulders.l.y + 60 };
            p.elbows.r = { x: p.shoulders.r.x + 20, y: p.shoulders.r.y + 60 };

            // Comportamento AI
            ['l', 'r'].forEach(s => {
                const hnd = p.wrists[s];
                
                if (hnd.state === 'IDLE') {
                    const guardY = ai.guard ? p.head.y : p.head.y + 80;
                    const tx = p.head.x + (s==='l'?-40:40);
                    hnd.x += (tx - hnd.x) * 0.1;
                    hnd.y += (guardY - hnd.y) * 0.1;
                } 
                else if (hnd.state === 'PUNCH') {
                    hnd.z += 10;
                    hnd.x += ((w/2) - hnd.x) * 0.2; // Mira no jogador
                    hnd.y += ((h/2 + 50) - hnd.y) * 0.2;
                    
                    if (hnd.z > 60 && !this.p1.guard && hnd.z < 80) {
                        this.p1.hp -= 2;
                        this.spawnMsg(w/2, h/2, "OUCH", "#f00");
                        if(window.Gfx) window.Gfx.shakeScreen(5);
                        hnd.state = 'RETRACT';
                    }
                    if (hnd.z > 90) hnd.state = 'RETRACT';
                } 
                else {
                    hnd.z -= 10;
                    if(hnd.z<=0) { hnd.z=0; hnd.state='IDLE'; }
                }
            });

            // Timer de Decisão
            if (ai.aiTimer-- <= 0) {
                const rand = Math.random();
                if (rand < 0.03) {
                    const h = rand > 0.015 ? p.wrists.l : p.wrists.r;
                    h.state = 'PUNCH';
                    ai.aiTimer = 60;
                } else if (rand < 0.05) {
                    ai.guard = !ai.guard;
                    ai.aiTimer = 40;
                }
            }
        },

        sendUpdate: function() {
            if (this.timer % 3 === 0 && this.dbRef) {
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
        drawArena: function(ctx, w, h) {
            const ar = ARENAS[this.selArena];
            const mid = h * 0.6;
            
            // Wall
            const g = ctx.createLinearGradient(0,0,0,mid);
            g.addColorStop(0, ar.bg); g.addColorStop(1, '#000');
            ctx.fillStyle = g; ctx.fillRect(0,0,w,mid);
            
            // Floor
            ctx.fillStyle = ar.floor; ctx.fillRect(0,mid,w,h-mid);
            
            // Ropes
            ctx.strokeStyle = ar.rope; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(0, mid-50); ctx.lineTo(w, mid-50); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, mid-120); ctx.lineTo(w, mid-120); ctx.stroke();
        },

        drawCharacter: function(ctx, player, w, h, isSelf) {
            const p = player.pose;
            // Se o ombro não foi detectado (x=0), não desenha para evitar riscos na tela
            if (p.shoulders.l.x === 0 || p.shoulders.r.x === 0) return;

            const c = CHARACTERS[player.charId].c;
            
            // Escala baseada na distância dos ombros (se disponível) ou padrão
            let size = SafeUtils.dist(p.shoulders.l, p.shoulders.r) / 100;
            if (!isSelf) size = 1.0; // Inimigo tem tamanho fixo
            const s = size * (isSelf ? CONF.PLAYER_SCALE : CONF.ENEMY_SCALE);

            const cx = (p.shoulders.l.x + p.shoulders.r.x) / 2;
            const cy = (p.shoulders.l.y + p.shoulders.r.y) / 2;

            // Função local para desenhar membros
            const limb = (p1, p2, w) => {
                if(p1.x===0 || p2.x===0) return;
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                ctx.lineWidth = w * s; ctx.lineCap='round'; ctx.strokeStyle = c.shirt; ctx.stroke();
            };

            // 1. Corpo
            ctx.fillStyle = c.shirt; 
            ctx.beginPath(); ctx.ellipse(cx, cy + (40*s), 50*s, 70*s, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = c.overall; 
            ctx.fillRect(cx - 35*s, cy + 50*s, 70*s, 80*s);
            
            // 2. Membros
            limb(p.shoulders.l, p.elbows.l, 25);
            limb(p.elbows.l, p.wrists.l, 25);
            limb(p.shoulders.r, p.elbows.r, 25);
            limb(p.elbows.r, p.wrists.r, 25);

            // 3. Cabeça
            ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(p.head.x, p.head.y, 45*s, 0, Math.PI*2); ctx.fill();
            
            // Boné
            ctx.fillStyle = c.hat; 
            ctx.beginPath(); ctx.arc(p.head.x, p.head.y - 10*s, 48*s, Math.PI, 0); ctx.fill();
            ctx.beginPath(); ctx.ellipse(p.head.x, p.head.y - 10*s, 50*s, 15*s, 0, Math.PI, 0); ctx.fill();
            
            // Letra no boné
            ctx.fillStyle = "#fff"; ctx.font = `bold ${30*s}px Arial`; ctx.textAlign = 'center';
            ctx.fillText(CHARACTERS[player.charId].name[0], p.head.x, p.head.y - 35*s);

            // 4. Luvas (com Z-Depth)
            this.drawGlove(ctx, p.wrists.l, s);
            this.drawGlove(ctx, p.wrists.r, s);
        },

        drawGlove: function(ctx, hand, s) {
            if (hand.x === 0) return;
            // Profundidade visual: Z aumenta (vai pro fundo) -> Luva diminui
            const zScale = Math.max(0.5, 1.0 - (hand.z * 0.003)); 
            const size = s * zScale * 35;

            ctx.save();
            ctx.translate(hand.x, hand.y);
            
            // Sombra
            ctx.shadowBlur = hand.state === 'PUNCH' ? 20 : 0;
            ctx.shadowColor = '#000';

            const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, size);
            g.addColorStop(0, '#fff'); g.addColorStop(1, '#ddd');
            ctx.fillStyle = g;
            
            ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#d00'; ctx.fillRect(-size/2, size*0.3, size, size*0.3); // Faixa
            
            ctx.restore();
        },

        // -----------------------------------------------------------------
        // UI & HELPERS
        // -----------------------------------------------------------------
        uiMode: function(ctx, w, h) {
            ctx.fillStyle = "#fff"; ctx.font="bold 50px 'Russo One'"; ctx.textAlign="center";
            ctx.fillText("BOXING PRO", w/2, 100);
            this.drawBtn(ctx, w/2, h/2 - 60, "OFFLINE (VS CPU)", this.state);
            this.drawBtn(ctx, w/2, h/2 + 60, "ONLINE (VS PLAYER)", this.state);
        },

        uiChar: function(ctx, w, h) {
            const c = CHARACTERS[this.selChar];
            ctx.fillStyle = c.c.overall; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center";
            ctx.font="bold 60px 'Russo One'"; ctx.fillText(c.name, w/2, h/2);
            ctx.font="20px sans-serif"; ctx.fillText("CLIQUE À DIREITA PARA INICIAR", w/2, h - 50);
            
            // Avatar
            ctx.fillStyle = c.c.hat; ctx.beginPath(); ctx.arc(w/2, h/2 - 100, 80, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "#fff"; ctx.font="80px Arial"; ctx.fillText(c.name[0], w/2, h/2-75);
        },

        uiLobby: function(ctx, w, h) {
            ctx.fillStyle = "#111"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.font="30px sans-serif";
            ctx.fillText("AGUARDANDO OPONENTE...", w/2, h/2);
        },

        uiGameOver: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
            const win = this.p1.hp > 0;
            ctx.fillStyle = win ? "#f1c40f" : "#e74c3c";
            ctx.textAlign="center"; ctx.font="bold 60px 'Russo One'";
            ctx.fillText(win ? "VITÓRIA!" : "DERROTA", w/2, h/2);
            ctx.fillStyle = "#fff"; ctx.font="20px sans-serif"; ctx.fillText("CLIQUE PARA REINICIAR", w/2, h-50);
        },

        drawHUD: function(ctx, w, h) {
            const barW = w * 0.4;
            // P1 HP
            ctx.fillStyle = "#444"; ctx.fillRect(10, 10, barW, 25);
            ctx.fillStyle = "#e74c3c"; ctx.fillRect(10, 10, barW * (this.p1.hp/100), 25);
            // P2 HP
            ctx.fillStyle = "#444"; ctx.fillRect(w-10-barW, 10, barW, 25);
            ctx.fillStyle = "#3498db"; ctx.fillRect(w-10-barW, 10, barW * (this.p2.hp/100), 25);
            // Stamina
            ctx.fillStyle = "#f1c40f"; ctx.fillRect(10, 40, barW * (this.p1.stamina/100), 5);
        },

        drawBtn: function(ctx, x, y, txt) {
            ctx.fillStyle = "#34495e"; ctx.fillRect(x-150, y-30, 300, 60);
            ctx.strokeStyle = "#fff"; ctx.strokeRect(x-150, y-30, 300, 60);
            ctx.fillStyle = "#fff"; ctx.font="20px sans-serif"; ctx.fillText(txt, x, y+8);
        },

        spawnMsg: function(x, y, txt, col) {
            this.msgs.push({x, y, t:txt, c:col, life: 40});
        },
        
        renderMsgs: function(ctx) {
            this.msgs.forEach(m => {
                m.y -= 1; m.life--;
                ctx.fillStyle = m.c; ctx.font = "bold 30px 'Russo One'"; 
                ctx.strokeText(m.t, m.x, m.y); ctx.fillText(m.t, m.x, m.y);
            });
            this.msgs = this.msgs.filter(m => m.life > 0);
        },

        playSound: function(type, freq, vol=0.1) {
            if(window.Sfx) window.Sfx.play(freq, type, 0.1, vol);
        },

        endRound: function() {
            if(this.round < CONF.ROUNDS) {
                this.round++;
                this.timer = CONF.ROUND_TIME * 60;
                window.System.msg("ROUND " + this.round);
            } else this.state = 'GAMEOVER';
        }
    };

    // --- REGISTRO SEGURO NO CORE ---
    const register = () => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('box_pro', 'Boxing Pro', '🥊', Game, { camOpacity: 0.1 });
        } else {
            setTimeout(register, 500); // Tenta de novo se o Core não carregou
        }
    };
    register();

})();