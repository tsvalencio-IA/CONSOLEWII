// =============================================================================
// PRO BOXING LEAGUE: PLATINUM EDITION (MULTIPLAYER + CPU AI)
// ARQUITETO: ENGENHARIA SÊNIOR V4.0 - FULL GAMEPLAY UPDATE
// =============================================================================

(function() {
    let particles = [];

    // --- CONFIGURAÇÕES DE ALTO NÍVEL ---
    const CONF = {
        GRAVITY: 0.8,
        DRAG: 0.92,          
        HIT_STOP_HEAVY: 150, 
        HIT_STOP_LIGHT: 60,
        CAMERA_SMOOTH: 0.08, 
        
        // Física de Soco
        PUNCH: {
            MIN_VEL: 15,     
            COOLDOWN: 12
        },

        // Lutadores (Estilo Mario Strikers / PS2)
        CHARS: {
            'balanced': { 
                name: 'RED PLUMBER', 
                colors: { main: '#c0392b', sub: '#e74c3c', skin: '#ffccaa', glow: '#ff5555' },
                stats: { mass: 1.0, power: 12, speed: 1.0 }
            },
            'speed': { 
                name: 'GREEN GHOST', 
                colors: { main: '#27ae60', sub: '#2ecc71', skin: '#ffccaa', glow: '#55ff55' },
                stats: { mass: 0.8, power: 8, speed: 1.4 }
            },
            'power': { 
                name: 'BAD GARLIC', 
                colors: { main: '#f39c12', sub: '#f1c40f', skin: '#eebefa', glow: '#ffff55' },
                stats: { mass: 1.6, power: 22, speed: 0.6 }
            }
        }
    };

    // --- MATH UTILS ---
    const M = {
        lerp: (a, b, t) => a + (b - a) * t,
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y)
    };

    const Logic = {
        state: 'SELECT', // SELECT, FIGHT, KO
        mode: 'SOLO',
        
        frame: 0,
        hitStop: 0,
        
        // Câmera
        cam: { x: 0, y: 0, z: 1, shake: 0 },
        
        // Jogador Local
        myChar: 'balanced',
        player: {
            hp: 100, maxHp: 100,
            pose: null, 
            hands: { l: {x:0,y:0,state:0}, r: {x:0,y:0,state:0} }
        },

        // Oponente (CPU ou Rede)
        rival: {
            id: null,
            hp: 100,
            pose: null, // Pose real ou simulada
            char: 'power',
            visX: 0, visY: 0,
            // Variáveis da IA
            aiState: 0, aiTimer: 0, aiHands: { l:{x:0,y:0}, r:{x:0,y:0} }
        },

        // Multiplayer
        roomId: 'boxing_arena_v1',
        isOnline: false,
        dbRef: null,

        // =====================================================================
        // INIT & SETUP
        // =====================================================================
        init: function() {
            this.state = 'SELECT';
            this.player.hp = 100;
            particles = [];
            this.disconnect();
            window.System.msg("FIGHT NIGHT");
        },

        disconnect: function() {
            if (this.dbRef && window.System.playerId) {
                try {
                    window.DB.ref(`rooms/${this.roomId}/players/${window.System.playerId}`).remove();
                    window.DB.ref(`rooms/${this.roomId}`).off();
                } catch(e){}
            }
            this.isOnline = false;
        },

        startGame: function(mode) {
            this.mode = mode;
            this.player.hp = 100;
            this.rival.hp = 100;
            this.state = 'FIGHT';
            
            if (mode === 'VERSUS') {
                if (window.DB) {
                    this.isOnline = true;
                    this.connectNet();
                } else {
                    window.System.msg("OFFLINE - VS CPU");
                    this.mode = 'SOLO'; // Fallback para CPU
                }
            }
            
            if (this.mode === 'SOLO') {
                // Inicia Pose da IA
                this.rival.char = 'power'; // CPU é o vilão
            }
            
            window.Sfx.play(600, 'square', 0.5, 0.1); 
        },

        // =====================================================================
        // GAME LOOP (UPDATE)
        // =====================================================================
        update: function(ctx, w, h, rawPose) {
            this.frame++;

            // 1. INPUT & SMOOTHING 
            if (rawPose && rawPose.keypoints) {
                if (!this.player.pose) this.player.pose = rawPose;
                else {
                    this.player.pose.keypoints.forEach((kp, i) => {
                        const raw = rawPose.keypoints[i];
                        if (raw.score > 0.4) { 
                            kp.x = M.lerp(kp.x, raw.x, 0.5);
                            kp.y = M.lerp(kp.y, raw.y, 0.5);
                        }
                    });
                }
            }

            // 2. STATE MACHINE
            if (this.state === 'SELECT') { this.drawSelect(ctx, w, h); return 100; }
            if (this.state === 'KO') { this.drawKO(ctx, w, h); return 0; }

            // 3. HIT STOP
            if (this.hitStop > 0) {
                this.hitStop -= 16;
                this.cam.shake = (Math.random()-0.5) * 15; 
                this.drawGame(ctx, w, h);
                return this.player.hp;
            }
            this.cam.shake *= 0.8; 

            // 4. PHYSICS ENGINE
            this.updatePlayerPhysics(w, h);
            
            if (this.mode === 'SOLO') this.updateAI(w, h); // ATUALIZA A CPU
            if (this.isOnline) this.updateNet();

            // 5. RENDER
            this.updateCamera(w, h);
            this.drawGame(ctx, w, h);

            // Check End
            if (this.player.hp <= 0 || this.rival.hp <= 0) {
                this.state = 'KO';
                const win = this.player.hp > 0;
                window.System.msg(win ? "VENCEDOR!" : "NOCAUTEADO!");
            }

            return this.player.hp;
        },

        // --- LÓGICA DA IA (CPU) ---
        updateAI: function(w, h) {
            const r = this.rival;
            
            // Simula respiração (Idle animation)
            const t = this.frame * 0.05;
            const breathe = Math.sin(t) * 10;
            const sway = Math.cos(t * 0.5) * 20;

            // Gera uma pose falsa para a CPU baseada em matemática
            // Centralizada na tela, espelhada
            const cx = w/2 + sway; 
            const cy = h/2 + breathe;

            // Define posições base
            const head = { x: cx, y: cy - 100 };
            const lSh = { x: cx - 60, y: cy };
            const rSh = { x: cx + 60, y: cy };
            
            // Lógica de ataque da CPU
            r.aiTimer++;
            if (r.aiTimer > 60 && Math.random() < 0.05) {
                // Soco aleatório
                r.aiState = Math.random() > 0.5 ? 1 : 2; // 1=Esq, 2=Dir
                r.aiTimer = 0;
            }

            // Animação dos punhos da CPU
            const punchExt = 150; // Extensão do soco
            
            // Mão Esquerda (CPU)
            let targetLX = lSh.x; let targetLY = lSh.y + 80; // Guarda
            if (r.aiState === 1) { // Socando
                targetLX = lSh.x + 50; targetLY = lSh.y + punchExt; // Soco pra frente (na direção da câmera)
                // Verifica se acertou o player (Colisão simples)
                if (r.aiTimer === 10) this.damagePlayer(10); // Dano no frame 10
            }
            r.aiHands.l.x = M.lerp(r.aiHands.l.x, targetLX, 0.2);
            r.aiHands.l.y = M.lerp(r.aiHands.l.y, targetLY, 0.2);

            // Mão Direita (CPU)
            let targetRX = rSh.x; let targetRY = rSh.y + 80;
            if (r.aiState === 2) {
                targetRX = rSh.x - 50; targetRY = rSh.y + punchExt;
                if (r.aiTimer === 10) this.damagePlayer(15);
            }
            r.aiHands.r.x = M.lerp(r.aiHands.r.x, targetRX, 0.2);
            r.aiHands.r.y = M.lerp(r.aiHands.r.y, targetRY, 0.2);

            if (r.aiTimer > 20) r.aiState = 0; // Reset soco

            // Constroi objeto Pose compatível com o renderizador
            // Usamos coordenadas de tela direta aqui para simplificar
            this.rival.pose = {
                keypoints: [
                    {name:'nose', x: (head.x + w/2)/2 * (640/w) , y: head.y * (480/h)}, // Conversão inversa tosca só pra preencher
                    // O renderizador de Rival usa coordenadas normalizadas se isSelf=false, 
                    // mas aqui vamos injetar coordenadas de tela e flagar no render
                ],
                // Dados extras para o renderizador customizado da CPU
                cpuData: { head, lSh, rSh, lW: r.aiHands.l, rW: r.aiHands.r }
            };
        },

        damagePlayer: function(dmg) {
            // Chance de esquiva do player (se ele estiver se movendo muito)
            this.player.hp -= dmg;
            this.cam.shake = 20;
            window.Sfx.play(100, 'sawtooth', 0.1, 0.3);
            this.spawnFloat("OUCH!", this.cam.x, this.cam.y);
        },

        updatePlayerPhysics: function(w, h) {
            if (!this.player.pose) return;
            const stats = CONF.CHARS[this.myChar].stats;

            // Mapeia coordenadas para o centro da tela (0,0 no meio)
            const map = (p) => ({ x: (1 - p.x/640)*w - w/2, y: (p.y/480)*h - h/2 });
            
            const getPt = (n) => this.player.pose.keypoints.find(k => k.name === n) || {x:0,y:0};
            const lW = map(getPt('left_wrist'));
            const rW = map(getPt('right_wrist'));

            // Processa cada mão
            ['l', 'r'].forEach(side => {
                const hand = this.player.hands[side];
                const curr = side === 'l' ? lW : rW;
                
                // Calcula velocidade (Delta)
                const vx = curr.x - hand.x;
                const vy = curr.y - hand.y;
                const vel = Math.hypot(vx, vy);

                // Detecção de Soco (Aceleração súbita)
                if (vel > CONF.PUNCH.MIN_VEL * stats.speed && hand.state === 0) {
                    hand.state = 1; // Punching
                    window.Sfx.play(150 + Math.random()*50, 'sawtooth', 0.1, 0.05); // Swish sound
                }

                // Colisão
                if (hand.state === 1) {
                    this.checkHit(side, curr, vel, stats);
                    if (vel < 5) hand.state = 0; // Reset se parar
                } else {
                    hand.state = 0;
                }

                hand.x = curr.x; hand.y = curr.y;
            });
        },

        checkHit: function(side, pos, vel, stats) {
            let hit = false;
            let dmg = stats.power * (vel / 10);

            // Hitbox genérica do rival (centro da tela basicamente)
            // No modo SOLO (CPU), o rival está em coords de tela. 
            // No modo VERSUS, também desenhamos no centro.
            // Vamos assumir uma hitbox de "tronco/cabeça" no centro da tela 3D projetada.
            
            // A mão do player precisa estar "perto do centro" e "esticada" (z-depth simulado)
            // Como é 2D, checamos proximidade do centro (0, -50)
            if (M.dist(pos, {x: 0, y: -50}) < 100) {
                hit = true;
            }

            if (hit) {
                this.hitStop = dmg > 15 ? CONF.HIT_STOP_HEAVY : CONF.HIT_STOP_LIGHT;
                window.Sfx.play(100, 'square', 0.1, 0.3); // Impacto pesado
                this.spawnPart(pos.x, pos.y, 10, '#fff');
                this.spawnFloat(Math.floor(dmg), pos.x, pos.y - 50);
                this.rival.hp -= dmg;
                if (this.isOnline) this.sendHit(dmg);
                
                // Reset mão para não dar hit kill
                this.player.hands[side].state = 0;
            }
        },

        // =====================================================================
        // RENDERIZAÇÃO
        // =====================================================================
        updateCamera: function(w, h) {
            // Câmera segue a ação com "peso"
            let tx = 0;
            if (this.player.pose) {
                const nose = this.player.pose.keypoints.find(k => k.name === 'nose');
                if (nose) tx = (1 - nose.x/640)*w - w/2;
            }
            // Lerp suave
            this.cam.x = M.lerp(this.cam.x, tx * 0.3, CONF.CAMERA_SMOOTH);
            // Zoom dinâmico no impacto
            const tz = this.hitStop > 0 ? 1.1 : 1.0;
            this.cam.z = M.lerp(this.cam.z, tz, 0.2);
        },

        drawGame: function(ctx, w, h) {
            // 1. Limpeza e Setup de Câmera
            ctx.save();
            ctx.fillStyle = '#111'; ctx.fillRect(0,0,w,h); // Fundo escuro
            
            ctx.translate(w/2, h/2);
            ctx.scale(this.cam.z, this.cam.z);
            ctx.translate(-this.cam.x + this.cam.shake, this.cam.shake);

            // 2. Ambiente (Ringue 3D Falso)
            this.drawRing(ctx, w, h);

            // 3. Rival (CPU ou Player)
            this.drawRivalObj(ctx);

            // 4. Player (Você)
            this.drawPlayerObj(ctx, this.player.pose, this.myChar, true);

            // 5. FX
            this.drawParticles(ctx);

            ctx.restore();

            // 6. HUD
            this.drawHUD(ctx, w, h);
        },

        drawRing: function(ctx, w, h) {
            // Chão com grade de perspectiva para profundidade
            const horizon = -50;
            const bottom = h/2 + 100;
            
            // Gradiente do chão (Spotlight)
            const grad = ctx.createRadialGradient(0, 100, 50, 0, 100, 600);
            grad.addColorStop(0, '#333');
            grad.addColorStop(1, '#000');
            ctx.fillStyle = grad;
            ctx.beginPath(); 
            ctx.moveTo(-w, horizon); ctx.lineTo(w, horizon);
            ctx.lineTo(w, bottom); ctx.lineTo(-w, bottom);
            ctx.fill();

            // Cordas do Ringue (Linhas horizontais)
            ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4;
            for(let i=0; i<3; i++) {
                let y = horizon - 50 - (i*40);
                ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke();
            }
        },

        drawPlayerObj: function(ctx, pose, charType, isSelf) {
            if (!pose) return;
            const c = CONF.CHARS[charType];
            
            let nose, lW, rW, lS, rS;

            if (isSelf) {
                const kp = pose.keypoints;
                const get = (n) => {
                    const k = kp.find(p => p.name === n);
                    if (!k) return {x:0, y:0};
                    return { x: (1 - k.x/640)*ctx.canvas.width - ctx.canvas.width/2, y: (k.y/480)*ctx.canvas.height - ctx.canvas.height/2 };
                };
                nose = get('nose');
                lW = get('left_wrist'); rW = get('right_wrist');
                lS = get('left_shoulder'); rS = get('right_shoulder');
            } else {
                // Renderização da CPU (Usa os dados calculados em updateAI)
                if (pose.cpuData) {
                    nose = pose.cpuData.head;
                    lS = pose.cpuData.lSh; rS = pose.cpuData.rSh;
                    lW = pose.cpuData.lW; rW = pose.cpuData.rW;
                } else {
                    // Multiplayer render (similar a isSelf mas sem espelhamento X)
                    const kp = pose.keypoints;
                    const get = (n) => {
                        const k = kp.find(p => p.name === n);
                        if (!k) return {x:0, y:0};
                        return { x: (k.x/640)*ctx.canvas.width - ctx.canvas.width/2, y: (k.y/480)*ctx.canvas.height - ctx.canvas.height/2 };
                    };
                    nose = get('nose');
                    lW = get('left_wrist'); rW = get('right_wrist');
                    lS = get('left_shoulder'); rS = get('right_shoulder');
                }
            }

            // --- ESTILO VISUAL "PLAYSTATION 2" (SHADING VOLUMÉTRICO) ---
            
            // 1. Sombra no chão
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(nose.x, 250, 80, 20, 0, 0, Math.PI*2); ctx.fill();

            // 2. Conexões (Braços) - Grossos e com borda
            const drawLimb = (p1, p2) => {
                ctx.lineWidth = 35; 
                ctx.strokeStyle = '#2c3e50'; // Borda escura
                ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                
                ctx.lineWidth = 28;
                ctx.strokeStyle = c.colors.main; // Cor principal
                ctx.stroke();
            };
            drawLimb(lS, lW); drawLimb(rS, rW);

            // 3. Tronco (Abstrato)
            ctx.fillStyle = '#333';
            ctx.beginPath(); 
            ctx.moveTo(lS.x, lS.y); ctx.lineTo(rS.x, rS.y);
            ctx.lineTo((rS.x+lS.x)/2, rS.y + 150); 
            ctx.fill();

            // 4. Cabeça (Com volume)
            // Base
            ctx.fillStyle = c.colors.skin;
            ctx.beginPath(); ctx.arc(nose.x, nose.y, 50, 0, Math.PI*2); ctx.fill();
            // Boné/Cabelo
            ctx.fillStyle = c.colors.sub;
            ctx.beginPath(); ctx.arc(nose.x, nose.y-10, 52, Math.PI, 0); ctx.fill();
            
            // 5. Luvas (As estrelas do show)
            const drawGlove = (p, color) => {
                // Brilho de "material plástico/couro"
                const g = ctx.createRadialGradient(p.x-10, p.y-10, 5, p.x, p.y, 40);
                g.addColorStop(0, '#fff');
                g.addColorStop(0.3, color);
                g.addColorStop(1, '#000'); // Borda escura 3D
                
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(p.x, p.y, 45, 0, Math.PI*2); ctx.fill();
            };
            drawGlove(lW, '#ecf0f1');
            drawGlove(rW, '#ecf0f1');
        },

        drawRivalObj: function(ctx) {
            if (this.rival.pose) {
                // Desenha oponente
                this.drawPlayerObj(ctx, this.rival.pose, this.rival.char, false);
            } else {
                if(this.mode === 'VERSUS') {
                    ctx.fillStyle = '#666';
                    ctx.textAlign = 'center';
                    ctx.font = "20px 'Chakra Petch'";
                    ctx.fillText("BUSCANDO OPONENTE...", 0, -50);
                }
            }
        },

        drawParticles: function(ctx) {
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.life--;
                p.x += p.vx; p.y += p.vy;
                if (p.type === 'text') {
                    ctx.fillStyle = `rgba(255,255,0,${p.life/30})`;
                    ctx.font = "bold 50px Impact";
                    ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
                    ctx.strokeText(p.t, p.x, p.y);
                    ctx.fillText(p.t, p.x, p.y);
                } else {
                    ctx.fillStyle = p.c;
                    ctx.globalAlpha = p.life/20;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1;
                }
                if(p.life <= 0) particles.splice(i, 1);
            }
        },

        drawHUD: function(ctx, w, h) {
            // Estilo Barra de Luta Moderna
            const barW = 300;
            const barH = 30;
            const pad = 40;

            // Player Bar
            ctx.fillStyle = '#222';
            ctx.beginPath(); ctx.moveTo(pad, 30); ctx.lineTo(pad+barW, 30); ctx.lineTo(pad+barW-20, 30+barH); ctx.lineTo(pad, 30+barH); ctx.fill();
            
            const hpW = (this.player.hp / 100) * (barW-4);
            ctx.fillStyle = hpW > 50 ? '#2ecc71' : '#e74c3c';
            ctx.beginPath(); ctx.moveTo(pad+2, 32); ctx.lineTo(pad+2+hpW, 32); ctx.lineTo(pad+2+hpW-15, 30+barH-4); ctx.lineTo(pad+2, 30+barH-4); ctx.fill();

            // Nome
            ctx.fillStyle = '#fff'; ctx.font = "bold 20px 'Russo One'"; ctx.textAlign = 'left';
            ctx.fillText(CONF.CHARS[this.myChar].name, pad, 25);

            // Rival Bar (Espelhado)
            const rX = w - pad - barW;
            ctx.fillStyle = '#222';
            ctx.beginPath(); ctx.moveTo(rX+20, 30); ctx.lineTo(rX+barW, 30); ctx.lineTo(rX+barW, 30+barH); ctx.lineTo(rX, 30+barH); ctx.fill();
            
            const rHpW = (this.rival.hp / 100) * (barW-4);
            ctx.fillStyle = '#3498db';
            ctx.beginPath(); ctx.moveTo(w-pad-2-rHpW+15, 32); ctx.lineTo(w-pad-2, 32); ctx.lineTo(w-pad-2, 30+barH-4); ctx.lineTo(w-pad-2-rHpW, 30+barH-4); ctx.fill();

            ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
            ctx.fillText(this.mode==='SOLO'?'CPU BOT':'RIVAL', w-pad, 25);

            // VS Logo
            ctx.fillStyle = '#fff'; ctx.font = "bold 40px 'Russo One'"; ctx.textAlign = 'center';
            ctx.fillText("VS", w/2, 60);
        },

        drawSelect: function(ctx, w, h) {
            const grad = ctx.createLinearGradient(0,0,0,h);
            grad.addColorStop(0, '#1a1a2e'); grad.addColorStop(1, '#16213e');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);

            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; 
            ctx.font = "bold 50px 'Russo One'"; ctx.fillText("ESCOLHA SEU LUTADOR", w/2, 100);

            const list = Object.keys(CONF.CHARS);
            const slotW = w / list.length;
            
            // Hack para input de clique
            if(!this._clickBind) {
                this._clickBind = (e) => {
                    if(this.state !== 'SELECT') return;
                    const r = window.System.canvas.getBoundingClientRect();
                    const idx = Math.floor((e.clientX - r.left) / (r.width/list.length));
                    if(list[idx]) {
                        this.myChar = list[idx];
                        // Pergunta modo (Hack rápido: Clique na esquerda = Solo, Direita = Versus)
                        // Para simplificar, vamos padrão para SOLO, mas se tiver Firebase vai pra Versus depois
                        this.startGame('VERSUS'); // Tenta versus primeiro
                    }
                };
                window.System.canvas.addEventListener('mousedown', this._clickBind);
            }

            list.forEach((key, i) => {
                const c = CONF.CHARS[key];
                const cx = i * slotW + slotW/2;
                const cy = h/2;
                
                // Card
                ctx.fillStyle = key === this.myChar ? '#fff' : 'rgba(255,255,255,0.1)';
                if(key === this.myChar) ctx.globalAlpha = 0.2;
                ctx.roundRect(cx - 100, cy - 150, 200, 300, 20); ctx.fill();
                ctx.globalAlpha = 1;

                // Avatar Colorido
                ctx.fillStyle = c.colors.main;
                ctx.beginPath(); ctx.arc(cx, cy - 50, 60, 0, Math.PI*2); ctx.fill();
                
                ctx.fillStyle = '#fff'; ctx.font = "bold 24px 'Chakra Petch'";
                ctx.fillText(c.name, cx, cy + 50);
                
                // Stats Bars
                const drawStat = (l, v, y) => {
                    ctx.fillStyle = '#aaa'; ctx.font = "14px Arial"; ctx.textAlign='left';
                    ctx.fillText(l, cx - 80, y);
                    ctx.fillStyle = '#333'; ctx.fillRect(cx-30, y-10, 100, 10);
                    ctx.fillStyle = c.colors.sub; ctx.fillRect(cx-30, y-10, v*5, 10);
                };
                drawStat("PWR", c.stats.power, cy + 90);
                drawStat("SPD", c.stats.speed*10, cy + 110);
            });
        },

        drawKO: function(ctx, w, h) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = '#f1c40f'; ctx.textAlign = 'center';
            ctx.font = "bold 100px 'Russo One'";
            ctx.fillText(this.player.hp > 0 ? "VITÓRIA!" : "K.O.", w/2, h/2);
            ctx.font = "30px 'Chakra Petch'"; ctx.fillStyle = '#fff';
            ctx.fillText("Toque para reiniciar", w/2, h/2 + 80);
            
            // Hack restart
            if(!this._clickRestart) {
                this._clickRestart = () => { if(this.state === 'KO') this.init(); };
                window.System.canvas.addEventListener('mousedown', this._clickRestart, {once:true});
            }
        },

        spawnPart: function(x, y, n, c) {
            for(let i=0; i<n; i++) particles.push({
                x, y, vx:(Math.random()-0.5)*15, vy:(Math.random()-0.5)*15, 
                life: 20+Math.random()*20, s: 4+Math.random()*6, c, type:'p'
            });
        },
        spawnFloat: function(t, x, y) {
            particles.push({ x, y, vx:0, vy:-3, life:40, t, type:'text' });
        },

        // --- NETCODE ---
        connectNet: function() {
            if(!this.isOnline) return;
            const id = window.System.playerId;
            this.dbRef = window.DB.ref(`rooms/${this.roomId}`);
            
            // Join
            this.dbRef.child(`players/${id}`).set({ char: this.myChar, hp: 100, t: Date.now() });
            this.dbRef.child(`players/${id}`).onDisconnect().remove();

            // Listen Opponent
            this.dbRef.child('players').on('value', s => {
                const d = s.val(); if(!d) return;
                Object.keys(d).forEach(k => {
                    if(k !== id) {
                        this.rival.id = k;
                        this.rival.char = d[k].char;
                        // Smooth Pose Interpolation seria aqui
                        if(d[k].pose) this.rival.pose = d[k].pose; 
                        if(d[k].hp) this.rival.hp = d[k].hp;
                    }
                });
            });

            // Send Pose Loop (Throttle)
            if(!this._netLoop) {
                this._netLoop = setInterval(() => {
                    if(this.state === 'FIGHT' && this.player.pose) {
                        this.dbRef.child(`players/${id}`).update({ 
                            pose: this.player.pose, hp: this.player.hp 
                        });
                    }
                }, 100);
            }
        },
        
        sendHit: function(dmg) {
            this.dbRef.child('events').push({ t: 'hit', dmg, tgt: this.rival.id });
        }
    };

    // REGISTRO SEGURO
    if (window.System) {
        window.System.registerGame('box_pro', 'Pro Boxing', '🥊', Logic, {
            camOpacity: 0.15, 
            smooth: true
        });
    }
})();