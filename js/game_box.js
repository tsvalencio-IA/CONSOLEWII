// =============================================================================
// PRO BOXING LEAGUE: PLAYSTATION 2 EDITION
// ARQUITETO: CODE 177
// VERSÃO: 2.1 (Fixed & Wii Core Adapted)
// =============================================================================

(function() {

    // --- UTILITÁRIOS MATEMÁTICOS ---
    const MathUtils = {
        lerp: (a, b, t) => a + (b - a) * t,
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
        clamp: (val, min, max) => Math.min(Math.max(val, min), max),
        getScale: (y, height) => 0.6 + (y / height) * 0.6
    };

    // Configurações Globais
    const CONF = {
        GAME_DURATION: 99,
        GRAVITY: 0.6,
        DRAG: 0.95,
        HIT_STOP_MS: 120,
        CAMERA_SMOOTH: 0.1,
        
        // Configuração de Detecção de Socos (Intenção)
        PUNCH: {
            MIN_VELOCITY: 12,
            MIN_ACCEL: 4,
            MAX_EXTENSION: 0.9,
            COOLDOWN: 15
        },

        // Arquétipos de Lutadores
        CHARS: {
            'balanced': { 
                name: 'RED PLUMBER', 
                color: '#e74c3c', hat: '#c0392b', skin: '#ffccaa', 
                mass: 1.0, power: 10, speed: 1.0, reach: 1.0, stamina_cost: 15 
            },
            'speed': { 
                name: 'GREEN GHOST', 
                color: '#2ecc71', hat: '#27ae60', skin: '#ffccaa', 
                mass: 0.8, power: 7, speed: 1.3, reach: 1.2, stamina_cost: 10 
            },
            'power': { 
                name: 'BAD GARLIC', 
                color: '#f1c40f', hat: '#f39c12', skin: '#eebefa', 
                mass: 1.5, power: 18, speed: 0.7, reach: 0.8, stamina_cost: 25 
            },
            'boss': { 
                name: 'KING TURTLE', 
                color: '#27ae60', hat: '#e67e22', skin: '#f1c40f', 
                mass: 2.0, power: 25, speed: 0.5, reach: 1.1, stamina_cost: 35 
            }
        }
    };

    // --- ENGINE PRINCIPAL ---
    const Logic = {
        // Estado Global
        state: 'INTRO', // INTRO, SELECT, FIGHT, RESULT
        mode: 'SOLO',
        
        // Variáveis de Jogo
        frame: 0,
        time: 99,
        hitStopTimer: 0,
        
        // Variáveis de Menu (Substituindo onclick por Hover/Dwell)
        selectionTimer: 0,
        hoverIdx: -1,

        // Câmera Virtual
        camera: { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0 },
        
        // Dados do Jogador Local
        myCharKey: 'balanced',
        player: {
            hp: 100, maxHp: 100,
            stamina: 100, maxStamina: 100,
            pose: null, // Pose atual suavizada
            rawPose: null, // Pose crua da câmera
            hands: { 
                l: { state: 'IDLE', vel: {x:0, y:0}, pos: {x:0, y:0} }, 
                r: { state: 'IDLE', vel: {x:0, y:0}, pos: {x:0, y:0} } 
            }
        },

        // Inimigo (AI, Saco ou Player Remoto)
        rival: {
            id: null,
            hp: 100,
            pose: null,
            charKey: 'balanced',
            lastHitId: 0
        },

        // Objeto Físico: Saco de Pancada
        bag: {
            x: 0, y: 0, 
            angle: 0, angVel: 0, 
            len: 200, mass: 20
        },

        // Sistema de Partículas e Efeitos
        effects: [],

        // Multiplayer
        roomId: 'pro_arena_01',
        isOnline: false,
        dbRef: null,

        // =========================================================================
        // CICLO DE VIDA (SYSTEM API)
        // =========================================================================
        init: function() {
            this.resetGame();
            if(window.System && window.System.msg) window.System.msg("PRO BOXING LEAGUE 2.0");
        },

        cleanup: function() {
            this.disconnect();
            this.effects = [];
        },

        resetGame: function() {
            this.state = 'SELECT';
            this.player.hp = 100;
            this.player.stamina = 100;
            this.effects = [];
            this.hitStopTimer = 0;
            this.selectionTimer = 0;
            this.disconnect();
            
            this.player.hands.l.pos = {x:0,y:0};
            this.player.hands.r.pos = {x:0,y:0};
        },

        disconnect: function() {
            if (this.dbRef && window.System.playerId && window.DB) {
                try {
                    window.DB.ref(`rooms/${this.roomId}/players/${window.System.playerId}`).remove();
                    window.DB.ref(`rooms/${this.roomId}`).off();
                } catch(e) { console.error(e); }
            }
            this.isOnline = false;
        },

        startGame: function(mode) {
            this.mode = mode;
            this.time = 99;
            this.player.hp = 100;
            this.rival.hp = 100;
            this.state = 'FIGHT';
            
            if (mode === 'VERSUS') {
                if (!window.DB) {
                    if(window.System.msg) window.System.msg("OFFLINE - MODO TREINO");
                    this.mode = 'SOLO';
                } else {
                    this.isOnline = true;
                    this.connectNet();
                }
            } else {
                // Configura Saco
                this.bag.x = 0; 
                this.bag.y = -100;
                this.bag.angle = 0;
                this.bag.angVel = 0;
            }
            if(window.Sfx) window.Sfx.click(); 
        },

        // =========================================================================
        // UPDATE LOOP (CHAMADO PELO CORE)
        // =========================================================================
        update: function(ctx, w, h, rawPose) {
            this.frame++;

            // 1. INPUT SMOOTHING
            if (rawPose && rawPose.keypoints) {
                this.player.rawPose = rawPose;
                if (!this.player.pose) {
                    this.player.pose = JSON.parse(JSON.stringify(rawPose));
                } else {
                    this.player.pose.keypoints.forEach((kp, i) => {
                        const raw = rawPose.keypoints[i];
                        if (raw.score > 0.3) {
                            kp.x = MathUtils.lerp(kp.x, raw.x, 0.4);
                            kp.y = MathUtils.lerp(kp.y, raw.y, 0.4);
                            kp.score = raw.score;
                        }
                    });
                }
            }

            // 2. STATE MACHINE
            if (this.state === 'SELECT') {
                this.updateSelect(w, h);
                this.drawSelect(ctx, w, h);
                return;
            }

            if (this.state === 'RESULT') {
                this.updateResult(w, h); // Lógica para reiniciar via pose
                this.drawResult(ctx, w, h);
                return;
            }

            // 3. HIT STOP
            if (this.hitStopTimer > 0) {
                this.hitStopTimer -= 16;
                this.camera.shakeX = (Math.random() - 0.5) * 15;
                this.camera.shakeY = (Math.random() - 0.5) * 15;
                this.drawGame(ctx, w, h);
                return;
            } else {
                this.camera.shakeX *= 0.8;
                this.camera.shakeY *= 0.8;
            }

            // 4. FÍSICA E LÓGICA
            this.updatePhysics(w, h);
            this.updateStamina();
            
            if (this.mode === 'SOLO') this.updateBagPhysics();
            if (this.isOnline) this.updateNet();

            // 5. RENDERIZAÇÃO
            this.updateCamera(w, h);
            this.drawGame(ctx, w, h);

            // Checa Fim
            if ((this.player.hp <= 0 || this.rival.hp <= 0) && this.state === 'FIGHT') {
                this.state = 'RESULT';
                const win = this.player.hp > 0;
                if(window.System.msg) window.System.msg(win ? "VITÓRIA!" : "K.O.");
                if (win) this.spawnConfetti(0, 0); // Coordenadas relativas ao centro
            }
        },

        // --- FÍSICA DE SOCO ---
        updatePhysics: function(w, h) {
            if (!this.player.pose) return;

            const charStats = CONF.CHARS[this.player.myCharKey];
            const getKp = (name) => {
                const k = this.player.pose.keypoints.find(p => p.name === name);
                // Mapeia 0-640 (Webcam) para -w/2 a w/2 (Canvas)
                return k ? { 
                    x: (1 - k.x/640) * w - w/2, 
                    y: (k.y/480) * h - h/2 
                } : {x:0,y:0};
            };

            const leftWr = getKp('left_wrist');
            const rightWr = getKp('right_wrist');
            const leftSh = getKp('left_shoulder');
            const rightSh = getKp('right_shoulder');

            ['l', 'r'].forEach(side => {
                const handObj = this.player.hands[side];
                const currPos = side === 'l' ? leftWr : rightWr;
                const shoulder = side === 'l' ? leftSh : rightSh;
                
                const dx = currPos.x - handObj.pos.x;
                const dy = currPos.y - handObj.pos.y;
                const velocity = Math.hypot(dx, dy); // px/frame
                const armLen = MathUtils.dist(shoulder, currPos);
                const isExtended = armLen > (100 * charStats.reach);

                if (handObj.state === 'IDLE') {
                    if (velocity > CONF.PUNCH.MIN_VELOCITY * charStats.speed && this.player.stamina > 5) {
                        handObj.state = 'PUNCHING';
                        this.player.stamina -= charStats.stamina_cost;
                        if(window.Sfx) window.Sfx.play(800, 'sine', 0.1, 0.1);
                    }
                } 
                else if (handObj.state === 'PUNCHING') {
                    this.checkCollision(side, currPos, velocity, w, h);
                    if (velocity < 2 || isExtended) {
                        handObj.state = 'RETRACT';
                    }
                } 
                else if (handObj.state === 'RETRACT') {
                    handObj.state = 'IDLE';
                }

                handObj.pos = currPos;
                handObj.vel = {x: dx, y: dy};
            });
        },

        checkCollision: function(side, handPos, velocity, w, h) {
            let hit = false;
            let damage = 0;
            const charStats = CONF.CHARS[this.player.myCharKey];
            const dmgBase = charStats.power * (velocity / 10);

            if (this.mode === 'SOLO') {
                // Saco de Pancada
                const bagWorldX = this.bag.x + Math.sin(this.bag.angle) * this.bag.len;
                const bagWorldY = this.bag.y + Math.cos(this.bag.angle) * this.bag.len;

                if (MathUtils.dist(handPos, {x: bagWorldX, y: bagWorldY}) < 60) {
                    hit = true;
                    const force = (handPos.x < bagWorldX ? 1 : -1) * (velocity * 0.02) * charStats.mass;
                    this.bag.angVel += force;
                    damage = dmgBase;
                }
            } 
            else if (this.mode === 'VERSUS' && this.rival.pose) {
                // Colisão com Rival
                const rNose = this.rival.pose.keypoints.find(k => k.name === 'nose');
                if (rNose) {
                     // Converter coord do rival (0-640) para o mundo atual (w, h)
                     const rX = (rNose.x/640) * w - w/2; 
                     const rY = (rNose.y/480) * h - h/2;
                     
                     if (MathUtils.dist(handPos, {x: rX, y: rY}) < 80) {
                        hit = true;
                        damage = dmgBase;
                     }
                }
            }

            if (hit) {
                this.hitStopTimer = CONF.HIT_STOP_MS;
                this.camera.zoom = 1.05;
                this.spawnParticles(handPos.x, handPos.y, 10, '#FFFF00');
                this.spawnPopText(Math.floor(damage), handPos.x, handPos.y - 50);
                if(window.Sfx) window.Sfx.hit();
                
                this.player.hands[side].state = 'RETRACT';

                if (this.mode === 'VERSUS') {
                    this.sendHit(damage);
                    this.rival.hp -= damage;
                } else {
                    this.rival.hp -= damage;
                }
            }
        },

        updateBagPhysics: function() {
            const accel = (-CONF.GRAVITY / (this.bag.len/10)) * Math.sin(this.bag.angle);
            this.bag.angVel += accel;
            this.bag.angVel *= CONF.DRAG;
            this.bag.angle += this.bag.angVel;
        },

        updateStamina: function() {
            if (this.player.stamina < this.player.maxStamina) {
                this.player.stamina += 0.3;
            }
        },

        updateCamera: function(w, h) {
            let targetX = 0;
            let targetY = 0;
            
            const nose = this.player.pose?.keypoints.find(k => k.name === 'nose');
            if (nose) {
                const px = (1 - nose.x/640) * w - w/2;
                targetX = px * 0.2; 
            }

            this.camera.x = MathUtils.lerp(this.camera.x, targetX + this.camera.shakeX, CONF.CAMERA_SMOOTH);
            this.camera.y = MathUtils.lerp(this.camera.y, targetY + this.camera.shakeY, CONF.CAMERA_SMOOTH);
            this.camera.zoom = MathUtils.lerp(this.camera.zoom, 1.0, 0.1);
        },
drawGame: function(ctx, w, h) {
            // Limpa e aplica câmera
            ctx.save();
            ctx.fillStyle = '#1a1a2e'; // Fundo Arcade Dark
            ctx.fillRect(0,0,w,h);
            
            ctx.translate(w/2, h/2);
            ctx.scale(this.camera.zoom, this.camera.zoom);
            ctx.translate(-this.camera.x, -this.camera.y);

            // 1. CHÃO (Grid de Perspectiva)
            this.drawFloor(ctx, w, h);

            // 2. OBJETOS DE FUNDO
            if (this.mode === 'SOLO') {
                this.drawBag(ctx);
            } else if (this.mode === 'VERSUS') {
                this.drawRival(ctx, w, h);
            }

            // 3. JOGADOR (Frente)
            this.drawPlayer(ctx, this.player.pose, this.player.myCharKey, true, w, h);

            // 4. EFEITOS
            this.drawEffects(ctx);

            ctx.restore();

            // 5. HUD
            this.drawHUD(ctx, w, h);
        },

        drawFloor: function(ctx, w, h) {
            ctx.strokeStyle = '#303a5e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            // Horizonte falso
            const floorY = 100; 
            for (let i = -500; i <= 500; i+=100) {
                // Linhas verticais convergindo
                ctx.moveTo(i, floorY);
                ctx.lineTo(i * 3, h);
            }
            // Linhas horizontais
            for (let i = 0; i < 5; i++) {
                const y = floorY + (i*80);
                ctx.moveTo(-w, y);
                ctx.lineTo(w, y);
            }
            ctx.stroke();

            // Sombra do ringue
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(0, 200, 300, 100, 0, 0, Math.PI*2);
            ctx.fill();
        },

        drawPlayer: function(ctx, pose, charKey, isSelf, w, h) {
            if (!pose) return;
            const c = CONF.CHARS[charKey];
            
            // Helper de coordenadas (Normalizado -> World Space)
            const getPos = (name) => {
                const k = pose.keypoints.find(p => p.name === name);
                if (!k) return {x:0, y:0};
                if (isSelf) {
                    return { 
                        x: (1 - k.x/640) * w - w/2, 
                        y: (k.y/480) * h - h/2 
                    };
                } else {
                    return { 
                        x: (k.x/640) * w - w/2, 
                        y: (k.y/480) * h - h/2 
                    };
                }
            };

            const head = getPos('nose');
            const lSh = getPos('left_shoulder');
            const rSh = getPos('right_shoulder');
            const lWr = getPos('left_wrist');
            const rWr = getPos('right_wrist');

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(head.x, 300, 60, 20, 0, 0, Math.PI*2);
            ctx.fill();

            // Função para desenhar Luva
            const drawGlove = (pos, color) => {
                const scale = MathUtils.getScale(pos.y, h/2);
                const size = 30 * scale * (isSelf ? 1.2 : 1);

                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, size, 0, Math.PI*2);
                ctx.fill();
                
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.beginPath();
                ctx.arc(pos.x - size*0.3, pos.y - size*0.3, size*0.4, 0, Math.PI*2);
                ctx.fill();

                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.stroke();
            };

            // Desenha Corpo (Abstrato)
            ctx.strokeStyle = c.color;
            ctx.lineWidth = 80;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(lSh.x, lSh.y + 20);
            ctx.lineTo(rSh.x, rSh.y + 20);
            ctx.stroke();

            // Macacão
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 60;
            ctx.beginPath();
            ctx.moveTo((lSh.x + rSh.x) / 2, lSh.y + 50);
            ctx.lineTo((lSh.x + rSh.x) / 2, lSh.y + 150);
            ctx.stroke();

            // Braços
            const armWidth = 25;
            const drawLimb = (p1, p2, color, width) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            };

            drawLimb(lSh, this.player.hands.l.pos, c.color, armWidth);
            drawLimb(this.player.hands.l.pos, lWr, c.color, armWidth);
            drawLimb(rSh, this.player.hands.r.pos, c.color, armWidth);
            drawLimb(this.player.hands.r.pos, rWr, c.color, armWidth);

            // Cabeça
            ctx.fillStyle = c.skin;
            ctx.fillRect(head.x - 15, head.y - 30, 30, 40);

            if (head.x !== 0) {
                ctx.fillStyle = c.skin;
                ctx.beginPath();
                ctx.arc(head.x, head.y, 45, 0, Math.PI*2);
                ctx.fill();
                
                // Bigode
                ctx.fillStyle = '#000';
                ctx.beginPath();
                const my = head.y + 10;
                ctx.moveTo(head.x, my);
                ctx.bezierCurveTo(head.x - 20, my - 10, head.x - 30, my + 20, head.x, my + 10);
                ctx.bezierCurveTo(head.x + 30, my + 20, head.x + 20, my - 10, head.x, my);
                ctx.fill();

                // Detalhes Rosto
                ctx.fillStyle = '#ffaaaa';
                ctx.beginPath(); ctx.arc(head.x, head.y, 10, 0, Math.PI*2); ctx.fill();

                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(head.x - 12, head.y - 15, 4, 8, 0, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(head.x + 12, head.y - 15, 4, 8, 0, 0, Math.PI*2); ctx.fill();
                
                // Boné
                ctx.fillStyle = c.hat;
                ctx.beginPath();
                ctx.arc(head.x, head.y - 10, 46, Math.PI, 0); 
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(head.x, head.y - 12, 50, 15, 0, Math.PI, 0);
                ctx.fill();
                
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(head.x, head.y - 35, 12, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = c.hat;
                ctx.font = "bold 16px Arial"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(c.name[0], head.x, head.y - 34);
            }

            // Luvas na frente
            drawGlove(lWr, '#fff'); 
            drawGlove(rWr, '#fff');
        },

        drawBag: function(ctx) {
            ctx.save();
            ctx.translate(0, -200);
            ctx.rotate(this.bag.angle);

            // Corrente
            ctx.strokeStyle = '#bdc3c7';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, this.bag.len);
            ctx.stroke();

            // O Saco
            ctx.translate(0, this.bag.len);
            ctx.fillStyle = '#c0392b';
            ctx.beginPath();
            // Compatibilidade para roundRect
            if(ctx.roundRect) ctx.roundRect(-40, 0, 80, 160, 20);
            else ctx.fillRect(-40, 0, 80, 160);
            ctx.fill();
            
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#922b21';
            ctx.stroke();
            
            // Fita
            ctx.fillStyle = '#95a5a6';
            ctx.fillRect(-42, 100, 84, 20);

            ctx.restore();
        },

        drawRival: function(ctx, w, h) {
            if (this.rival.pose) {
                ctx.save();
                this.drawPlayer(ctx, this.rival.pose, this.rival.charKey, false, w, h);
                ctx.restore();
            } else {
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.fillText("AGUARDANDO SINAL...", 0, -100);
            }
        },

        drawEffects: function(ctx) {
            for (let i = this.effects.length - 1; i >= 0; i--) {
                const p = this.effects[i];
                p.life--;
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.5;

                if (p.type === 'text') {
                    ctx.fillStyle = `rgba(255, 255, 255, ${p.life / 30})`;
                    ctx.font = "bold 40px Impact";
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 3;
                    ctx.strokeText(p.val, p.x, p.y);
                    ctx.fillText(p.val, p.x, p.y);
                } else {
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = p.life / 20;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                if (p.life <= 0) this.effects.splice(i, 1);
            }
        },

        drawHUD: function(ctx, w, h) {
            ctx.font = "bold 24px Arial";
            const barW = w * 0.4;
            const barH = 30;
            
            // Player HP
            ctx.fillStyle = '#333'; ctx.fillRect(20, 20, barW, barH);
            ctx.fillStyle = '#e74c3c'; 
            ctx.fillRect(22, 22, (barW - 4) * (this.player.hp / 100), barH - 4);
            ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
            ctx.fillText(CONF.CHARS[this.player.myCharKey].name, 20, 18);

            // Stamina
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(22, 22 + barH, (barW - 4) * (this.player.stamina / 100), 6);

            // Rival HP
            const rX = w - barW - 20;
            ctx.fillStyle = '#333'; ctx.fillRect(rX, 20, barW, barH);
            ctx.fillStyle = '#3498db'; 
            ctx.fillRect(rX + 2, 22, (barW - 4) * (this.rival.hp / 100), barH - 4);
            ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
            ctx.fillText(this.mode === 'SOLO' ? "TRAINING BAG" : "RIVAL", w - 20, 18);

            // Tempo
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.font = "bold 60px Impact";
            ctx.fillText(Math.ceil(this.time), w / 2, 60);
        },

        // --- SISTEMAS AUXILIARES ---
        spawnParticles: function(x, y, count, color) {
            for (let i = 0; i < count; i++) {
                this.effects.push({
                    type: 'part',
                    x: x, y: y,
                    vx: (Math.random() - 0.5) * 15,
                    vy: (Math.random() - 0.5) * 15,
                    life: 20 + Math.random() * 10,
                    size: 3 + Math.random() * 5,
                    color: color
                });
            }
        },

        spawnPopText: function(text, x, y) {
            this.effects.push({
                type: 'text', val: text,
                x: x, y: y, vx: 0, vy: -2, life: 40
            });
        },

        // --- NETCODE (Firebase) ---
        connectNet: function() {
            if (!this.isOnline || !window.DB) return;
            
            const myId = window.System.playerId || 'p_' + Math.floor(Math.random()*1000);
            const roomRef = window.DB.ref(`rooms/${this.roomId}`);
            this.dbRef = roomRef;

            // Registra
            roomRef.child(`players/${myId}`).set({
                charKey: this.player.myCharKey,
                hp: 100,
                joined: Date.now()
            });
            roomRef.child(`players/${myId}`).onDisconnect().remove();

            // Escuta
            roomRef.child('players').on('value', snap => {
                const players = snap.val();
                if (!players) return;

                Object.keys(players).forEach(key => {
                    if (key !== myId) {
                        const r = players[key];
                        this.rival.id = key;
                        this.rival.charKey = r.charKey || 'balanced';
                        this.rival.pose = r.pose;
                        if (r.hp !== undefined) this.rival.hp = r.hp;
                    }
                });
            });

            // Hits
            roomRef.child('hits').on('child_added', snap => {
                const hit = snap.val();
                if (hit.target === myId) {
                    this.player.hp -= hit.damage;
                    this.hitStopTimer = CONF.HIT_STOP_MS;
                    this.camera.shakeX = 20;
                    if(window.Sfx) window.Sfx.play(100, 'sawtooth', 0.1, 0.4);
                    this.spawnPopText("OUCH!", 0, 0);
                }
            });
        },

        updateNet: function() {
            if (!this.isOnline || !this.dbRef) return;
            if (this.frame % 3 === 0) {
                const myId = window.System.playerId || 'unknown';
                this.dbRef.child(`players/${myId}`).update({
                    pose: this.player.pose, // Envia pose
                    hp: this.player.hp
                });
            }
        },

        sendHit: function(dmg) {
            if (!this.isOnline || !this.rival.id || !this.dbRef) return;
            const myId = window.System.playerId || 'unknown';
            this.dbRef.child('hits').push({
                attacker: myId,
                target: this.rival.id,
                damage: dmg,
                timestamp: Date.now()
            });
        },

        // --- MENUS (Hover Input) ---
        updateSelect: function(w, h) {
            // Cursor controlado pelo nariz
            if (!this.player.pose) return;
            const nose = this.player.pose.keypoints.find(k => k.name === 'nose');
            if (!nose) return;

            // Mapeia coordenadas 0-640 (webcam) para a largura da tela w
            // Inverte X (espelho)
            const cursorX = (1 - nose.x/640) * w;
            
            const keys = Object.keys(CONF.CHARS);
            const slotW = w / keys.length;
            
            // Qual card está selecionado?
            const idx = Math.floor(cursorX / slotW);
            
            if (idx >= 0 && idx < keys.length) {
                if (this.hoverIdx === idx) {
                    this.selectionTimer++;
                    // 60 frames = 1 segundo de hover para confirmar
                    if (this.selectionTimer > 60) {
                        this.player.myCharKey = keys[idx];
                        this.startGame('SOLO'); // Default Solo
                        this.hoverIdx = -1;
                        this.selectionTimer = 0;
                    }
                } else {
                    this.hoverIdx = idx;
                    this.selectionTimer = 0;
                }
            } else {
                this.hoverIdx = -1;
                this.selectionTimer = 0;
            }
        },
        
        drawSelect: function(ctx, w, h) {
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
            ctx.font = "40px Arial";
            ctx.fillText("MOVA A CABEÇA PARA ESCOLHER", w / 2, 80);

            const keys = Object.keys(CONF.CHARS);
            const slotW = w / keys.length;

            keys.forEach((k, i) => {
                const char = CONF.CHARS[k];
                const x = i * slotW + slotW / 2;
                const y = h / 2;
                
                // Barra de carregamento (Hover)
                if (this.hoverIdx === i) {
                    ctx.fillStyle = 'rgba(255,255,255,0.1)';
                    const progress = this.selectionTimer / 60;
                    const rectH = h - 200;
                    // Enche de baixo para cima
                    ctx.fillRect(i * slotW + 10, 150 + (rectH * (1-progress)), slotW - 20, rectH * progress);
                }

                // Card Fundo
                ctx.fillStyle = k === this.player.myCharKey ? '#fff' : '#34495e';
                if (k === this.player.myCharKey) ctx.globalAlpha = 0.2;
                ctx.fillRect(i * slotW + 10, 150, slotW - 20, h - 200);
                ctx.globalAlpha = 1.0;

                // Avatar
                ctx.fillStyle = char.color;
                ctx.beginPath(); ctx.arc(x, y, 60, 0, Math.PI * 2); ctx.fill();
                
                // Infos
                ctx.fillStyle = k === this.player.myCharKey ? '#f1c40f' : '#bdc3c7';
                ctx.font = "bold 20px Arial";
                ctx.fillText(char.name, x, y + 100);
                
                ctx.font = "14px Arial";
                ctx.fillStyle = '#fff';
                ctx.fillText(`PWR: ${char.power}`, x, y + 130);
                ctx.fillText(`SPD: ${char.speed}`, x, y + 150);
            });
        },

        updateResult: function(w, h) {
            // Reiniciar se levantar as mãos (Gestural Input)
            if (!this.player.pose) return;
            const lWr = this.player.pose.keypoints.find(k => k.name === 'left_wrist');
            const rWr = this.player.pose.keypoints.find(k => k.name === 'right_wrist');
            
            // Se pulsos estiverem no topo da tela (y raw < 200)
            if (lWr && lWr.y < 200 && rWr && rWr.y < 200) {
                 this.resetGame();
            }
        },

        drawResult: function(ctx, w, h) {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.font = "bold 80px Impact";
            ctx.fillText(this.player.hp > 0 ? "VENCEDOR!" : "DERROTADO", w / 2, h / 2);
            ctx.font = "30px Arial";
            ctx.fillText("Levante as mãos para voltar", w / 2, h / 2 + 60);
        },
        
        spawnConfetti: function(x, y) {
            for (let i = 0; i < 50; i++) {
                this.effects.push({
                    type: 'part', x: x, y: y,
                    vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 1) * 20,
                    life: 100, size: 8, color: `hsl(${Math.random() * 360}, 100%, 50%)`
                });
            }
        }
    };

    // REGISTRO NO SISTEMA CORE
    window.System.registerGame('box_pro', 'Pro Boxing', '🥊', Logic, {
        camOpacity: 0.1, // Câmera quase invisível para imersão
        smooth: true     // Ativa suavização nativa
    });

})();