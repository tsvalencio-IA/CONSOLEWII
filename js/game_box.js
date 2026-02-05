// =============================================================================
// PRO BOXING LEAGUE: PLATINUM EDITION (FINAL FIXED VERSION)
// ARQUITETO: CODE 177 - CORREÇÃO DE MENU E LOOP
// =============================================================================

(function() {
    // Variáveis locais de módulo
    let particles = [];
    let clickHandler = null;

    // --- CONFIGURAÇÕES ---
    const CONF = {
        GRAVITY: 0.8,
        HIT_STOP: 120, 
        CAM_SMOOTH: 0.1,
        
        // Lutadores
        CHARS: {
            'balanced': { 
                name: 'RED FIGHTER', 
                colors: { main: '#c0392b', skin: '#ffccaa' },
                stats: { power: 12, speed: 1.0 }
            },
            'boss': { 
                name: 'CPU BOSS', 
                colors: { main: '#2c3e50', skin: '#f1c40f' },
                stats: { power: 15, speed: 0.8 }
            }
        }
    };

    // --- MATH HELPER ---
    const M = {
        lerp: (a, b, t) => a + (b - a) * t,
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y)
    };

    const Logic = {
        state: 'MENU', // MENU, FIGHT, END
        mode: 'SOLO',
        
        frame: 0,
        hitStopTimer: 0,
        
        // Câmera
        cam: { x: 0, y: 0, z: 1, shake: 0 },
        
        // Player Local
        player: {
            hp: 100,
            pose: null,
            hands: { l: {x:0,y:0,state:0}, r: {x:0,y:0,state:0} }
        },

        // Rival (CPU ou Online)
        rival: {
            id: null,
            hp: 100,
            pose: null,
            // IA Vars
            aiTimer: 0, aiAction: 0, aiHands: {l:{x:0,y:0}, r:{x:0,y:0}}
        },

        roomId: 'box_arena_01',
        isOnline: false,
        dbRef: null,

        // =====================================================================
        // 1. INICIALIZAÇÃO E LIMPEZA
        // =====================================================================
        init: function() {
            this.state = 'MENU';
            this.cleanup(); // Remove listeners antigos
            this.setupMenuInput(); // Ativa clique do menu
            window.System.msg("SELECIONE O MODO");
        },

        cleanup: function() {
            // Remove listeners de clique para não bugar outros jogos
            if (window.System.canvas) {
                window.System.canvas.onclick = null;
            }
            if (this.dbRef) {
                try { this.dbRef.off(); } catch(e){}
            }
            particles = [];
        },

        // =====================================================================
        // 2. MENU E INPUT
        // =====================================================================
        setupMenuInput: function() {
            // Define o clique APENAS quando estamos no estado MENU
            window.System.canvas.onclick = (e) => {
                if (this.state !== 'MENU') return;

                const rect = window.System.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const width = rect.width;

                // Lógica Simples: Esquerda = Solo, Direita = Online
                if (x < width / 2) {
                    this.startGame('SOLO');
                } else {
                    this.startGame('VERSUS');
                }
                
                // Remove o clique após escolher para não atrapalhar o jogo
                window.System.canvas.onclick = null; 
            };
        },

        startGame: function(mode) {
            this.mode = mode;
            this.state = 'FIGHT';
            this.player.hp = 100;
            this.rival.hp = 100;
            this.frame = 0;

            if (mode === 'VERSUS') {
                if (window.DB) {
                    this.isOnline = true;
                    this.connectNet();
                    window.System.msg("BUSCANDO OPONENTE...");
                } else {
                    window.System.msg("OFFLINE - JOGANDO SOLO");
                    this.mode = 'SOLO';
                }
            } else {
                this.isOnline = false;
                window.System.msg("ROUND 1 - FIGHT!");
            }
            
            // Som de Gongo
            window.Sfx.play(400, 'square', 0.8, 0.2); 
        },

        // =====================================================================
        // 3. LOOP PRINCIPAL (UPDATE)
        // =====================================================================
        update: function(ctx, w, h, rawPose) {
            this.frame++;

            // --- INPUT DA CÂMERA (SUAVIZADO) ---
            if (rawPose && rawPose.keypoints) {
                if (!this.player.pose) this.player.pose = JSON.parse(JSON.stringify(rawPose));
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

            // --- MÁQUINA DE ESTADOS ---
            if (this.state === 'MENU') {
                this.drawMenu(ctx, w, h);
                return 100;
            }

            if (this.state === 'END') {
                this.drawEnd(ctx, w, h);
                // Reinicia ao clicar (Hack rápido)
                if(!window.System.canvas.onclick) {
                    window.System.canvas.onclick = () => this.init();
                }
                return 0;
            }

            // --- HIT STOP (Congelamento) ---
            if (this.hitStopTimer > 0) {
                this.hitStopTimer -= 16;
                this.cam.shake = (Math.random()-0.5) * 15;
                this.drawGame(ctx, w, h);
                return this.player.hp;
            }
            this.cam.shake *= 0.8;

            // --- FÍSICA ---
            this.updatePlayer(w, h);
            
            if (this.mode === 'SOLO') this.updateCPU(w, h);
            else this.updateNet();

            // --- RENDER ---
            this.updateCam(w, h);
            this.drawGame(ctx, w, h);

            // Verifica Fim
            if (this.player.hp <= 0 || this.rival.hp <= 0) {
                this.state = 'END';
                const win = this.player.hp > 0;
                window.System.msg(win ? "VITÓRIA!" : "DERROTA!");
            }

            return this.player.hp;
        },

        // =====================================================================
        // 4. LÓGICA DE COMBATE E IA
        // =====================================================================
        updatePlayer: function(w, h) {
            if (!this.player.pose) return;
            
            // Mapeia coordenadas para centro da tela (0,0)
            const map = (p) => ({ x: (1 - p.x/640)*w - w/2, y: (p.y/480)*h - h/2 });
            const get = (n) => this.player.pose.keypoints.find(k => k.name===n) || {x:0,y:0};

            const lW = map(get('left_wrist'));
            const rW = map(get('right_wrist'));

            ['l', 'r'].forEach(s => {
                const hand = this.player.hands[s];
                const curr = s === 'l' ? lW : rW;
                
                // Velocidade
                const vel = M.dist(hand, curr);
                
                // Detecta soco (Velocidade alta)
                if (vel > 20 && hand.state === 0) {
                    hand.state = 1; // Socando
                    window.Sfx.play(100 + Math.random()*50, 'sawtooth', 0.1, 0.05);
                }

                if (hand.state === 1) {
                    // Checa colisão
                    this.checkHit(curr, vel);
                    if (vel < 5) hand.state = 0; // Reset
                } else {
                    hand.state = 0;
                }

                hand.x = curr.x; hand.y = curr.y;
            });
        },

        updateCPU: function(w, h) {
            const r = this.rival;
            
            // Animação Idle (Respiração)
            const t = this.frame * 0.05;
            const swayX = Math.cos(t) * 30;
            const swayY = Math.sin(t*2) * 10;

            // Cria pose virtual para a CPU
            const cx = w/2 + swayX;
            const cy = h/2 + swayY;

            // IA Ataca aleatoriamente
            r.aiTimer++;
            if (r.aiTimer > 50 && Math.random() < 0.05) {
                r.aiAction = Math.random() > 0.5 ? 1 : 2; // 1=Esq, 2=Dir
                r.aiTimer = 0;
            }

            // Move mãos da IA
            let txL = cx - 50, tyL = cy + 50;
            let txR = cx + 50, tyR = cy + 50;

            if (r.aiAction === 1) { txL += 50; tyL += 150; if(r.aiTimer===10) this.damagePlayer(10); } // Soco Esq
            if (r.aiAction === 2) { txR -= 50; tyR += 150; if(r.aiTimer===10) this.damagePlayer(15); } // Soco Dir

            r.aiHands.l.x = M.lerp(r.aiHands.l.x, txL, 0.2);
            r.aiHands.l.y = M.lerp(r.aiHands.l.y, tyL, 0.2);
            r.aiHands.r.x = M.lerp(r.aiHands.r.x, txR, 0.2);
            r.aiHands.r.y = M.lerp(r.aiHands.r.y, tyR, 0.2);

            if (r.aiTimer > 20) r.aiAction = 0;

            // Empacota para renderizar
            this.rival.pose = {
                cpu: true,
                head: {x: cx, y: cy - 100},
                lW: r.aiHands.l, rW: r.aiHands.r,
                lS: {x: cx-60, y: cy}, rS: {x: cx+60, y: cy}
            };
        },

        checkHit: function(pos, vel) {
            // Hitbox simples no centro da tela (onde estaria o oponente)
            if (M.dist(pos, {x: 0, y: -50}) < 80) {
                const dmg = 5 + (vel / 5);
                this.rival.hp -= dmg;
                this.hitStopTimer = 100; // Congela
                window.Sfx.play(100, 'square', 0.1, 0.2); // Som Hit
                this.spawnPart(pos.x, pos.y, 10, '#fff');
                
                if (this.isOnline) this.sendHit(dmg);
            }
        },

        damagePlayer: function(dmg) {
            this.player.hp -= dmg;
            this.cam.shake = 20;
            window.Sfx.play(80, 'sawtooth', 0.2, 0.4);
        },

        // =====================================================================
        // 5. NETCODE (MULTIPLAYER)
        // =====================================================================
        connectNet: function() {
            if(!this.isOnline) return;
            const id = window.System.playerId;
            this.dbRef = window.DB.ref(`rooms/${this.roomId}`);
            
            // Entra na sala
            this.dbRef.child(`players/${id}`).set({ hp: 100, t: Date.now() });
            this.dbRef.child(`players/${id}`).onDisconnect().remove();

            // Escuta Oponente
            this.dbRef.child('players').on('value', s => {
                const d = s.val(); if(!d) return;
                Object.keys(d).forEach(k => {
                    if(k !== id) {
                        this.rival.id = k;
                        if (d[k].pose) this.rival.pose = d[k].pose;
                        if (d[k].hp) this.rival.hp = d[k].hp;
                    }
                });
            });

            // Loop de envio (Throttle)
            if(!this._netLoop) {
                this._netLoop = setInterval(() => {
                    if(this.state === 'FIGHT' && this.player.pose) {
                        this.dbRef.child(`players/${id}`).update({ pose: this.player.pose });
                    }
                }, 100);
            }
        },

        updateNet: function() {
            // Placeholder para lógica extra de rede se necessário
        },

        sendHit: function(dmg) {
            if(this.dbRef) this.dbRef.child('hits').push({ t: Date.now(), dmg });
        },

        // =====================================================================
        // 6. RENDERIZAÇÃO E VISUAL
        // =====================================================================
        updateCam: function(w, h) {
            let tx = 0;
            if (this.player.pose && this.player.pose.keypoints) {
                const nose = this.player.pose.keypoints.find(k => k.name==='nose');
                if(nose) tx = (1 - nose.x/640)*w - w/2;
            }
            this.cam.x = M.lerp(this.cam.x, tx * 0.2, CONF.CAM_SMOOTH);
            const tz = this.hitStopTimer > 0 ? 1.05 : 1.0;
            this.cam.z = M.lerp(this.cam.z, tz, 0.2);
        },

        drawMenu: function(ctx, w, h) {
            // Fundo dividido
            ctx.fillStyle = '#c0392b'; ctx.fillRect(0,0,w/2,h); // Vermelho (Solo)
            ctx.fillStyle = '#2980b9'; ctx.fillRect(w/2,0,w/2,h); // Azul (Online)
            
            // Linha divisória
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(w/2,h); ctx.stroke();

            // Texto
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; 
            ctx.font = "bold 60px 'Russo One'";
            
            // Lado Solo
            ctx.fillText("SOLO", w/4, h/2 - 20);
            ctx.font = "30px sans-serif";
            ctx.fillText("(VS CPU)", w/4, h/2 + 30);

            // Lado Online
            ctx.font = "bold 60px 'Russo One'";
            ctx.fillText("ONLINE", w*0.75, h/2 - 20);
            ctx.font = "30px sans-serif";
            ctx.fillText("(VS PLAYER)", w*0.75, h/2 + 30);

            ctx.font = "20px sans-serif";
            ctx.fillText("CLIQUE NO LADO DESEJADO PARA INICIAR", w/2, h - 50);
        },

        drawGame: function(ctx, w, h) {
            ctx.save();
            ctx.fillStyle = '#111'; ctx.fillRect(0,0,w,h);
            
            ctx.translate(w/2, h/2);
            ctx.scale(this.cam.z, this.cam.z);
            ctx.translate(-this.cam.x + this.cam.shake, this.cam.shake);

            // Ringue
            this.drawRing(ctx, w, h);

            // Rival (Fundo)
            if (this.rival.pose) this.drawChar(ctx, this.rival.pose, false);
            else if (this.mode === 'VERSUS') {
                ctx.fillStyle = '#666'; ctx.textAlign='center'; ctx.font="20px sans-serif";
                ctx.fillText("AGUARDANDO CONEXÃO...", 0, -50);
            }

            // Player (Frente)
            if (this.player.pose) this.drawChar(ctx, this.player.pose, true);

            // Partículas
            this.drawPart(ctx);

            ctx.restore();
            this.drawHUD(ctx, w, h);
        },

        drawRing: function(ctx, w, h) {
            const bot = h/2 + 100;
            const top = -50;
            const grad = ctx.createRadialGradient(0, 100, 50, 0, 100, 600);
            grad.addColorStop(0, '#444'); grad.addColorStop(1, '#000');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.moveTo(-w, top); ctx.lineTo(w, top); ctx.lineTo(w, bot); ctx.lineTo(-w, bot); ctx.fill();
            
            // Cordas
            ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4;
            for(let i=0; i<3; i++) {
                let y = top - 50 - (i*40);
                ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke();
            }
        },

        drawChar: function(ctx, pose, isSelf) {
            // Extrai coordenadas (se for CPU ou Player Real)
            let nose, lW, rW, lS, rS;
            
            if (pose.cpu) { // Dados da CPU já vêm processados
                nose = pose.head; lW = pose.lW; rW = pose.rW; lS = pose.lS; rS = pose.rS;
            } else { // Dados do TensorFlow
                const kp = pose.keypoints;
                const get = (n) => {
                    const k = kp.find(p => p.name === n);
                    if (!k) return {x:0, y:0};
                    let xx = k.x; if(isSelf) xx = 640 - xx; // Espelha se for eu
                    return { 
                        x: (xx/640)*ctx.canvas.width - ctx.canvas.width/2, 
                        y: (k.y/480)*ctx.canvas.height - ctx.canvas.height/2 
                    };
                };
                nose = get('nose'); lW = get('left_wrist'); rW = get('right_wrist');
                lS = get('left_shoulder'); rS = get('right_shoulder');
            }

            // Visual PS2 Style (Membros grossos e sombreamento)
            const color = isSelf ? '#c0392b' : '#2980b9'; // Vermelho vs Azul
            
            // Sombra Chão
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(nose.x, 200, 60, 15, 0, 0, Math.PI*2); ctx.fill();

            // Braços
            ctx.lineWidth = 30; ctx.lineCap = 'round'; ctx.strokeStyle = color;
            ctx.beginPath(); ctx.moveTo(lS.x, lS.y); ctx.lineTo(lW.x, lW.y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rS.x, rS.y); ctx.lineTo(rW.x, rW.y); ctx.stroke();

            // Corpo
            ctx.fillStyle = '#333';
            ctx.beginPath(); ctx.moveTo(lS.x, lS.y); ctx.lineTo(rS.x, rS.y); ctx.lineTo((rS.x+lS.x)/2, rS.y+120); ctx.fill();

            // Cabeça
            ctx.fillStyle = '#ffccaa';
            ctx.beginPath(); ctx.arc(nose.x, nose.y, 40, 0, Math.PI*2); ctx.fill();

            // Luvas (Gradiente 3D)
            const drawGlove = (p) => {
                const g = ctx.createRadialGradient(p.x-10, p.y-10, 5, p.x, p.y, 40);
                g.addColorStop(0, '#fff'); g.addColorStop(0.5, color); g.addColorStop(1, '#000');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(p.x, p.y, 45, 0, Math.PI*2); ctx.fill();
            };
            drawGlove(lW); drawGlove(rW);
        },

        drawHUD: function(ctx, w, h) {
            const barW = 300; const hH = 30;
            
            // Player
            ctx.fillStyle = '#333'; ctx.fillRect(20, 20, barW, hH);
            ctx.fillStyle = '#c0392b'; ctx.fillRect(22, 22, (barW-4)*(this.player.hp/100), hH-4);
            
            // Rival
            ctx.fillStyle = '#333'; ctx.fillRect(w-20-barW, 20, barW, hH);
            ctx.fillStyle = '#2980b9'; ctx.fillRect(w-20-barW+2, 22, (barW-4)*(this.rival.hp/100), hH-4);

            ctx.fillStyle = '#fff'; ctx.font="bold 30px sans-serif"; ctx.textAlign='center';
            ctx.fillText("VS", w/2, 45);
        },

        drawEnd: function(ctx, w, h) {
            ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = this.player.hp > 0 ? '#2ecc71' : '#e74c3c';
            ctx.textAlign = 'center'; ctx.font="bold 80px 'Russo One'";
            ctx.fillText(this.player.hp > 0 ? "VITÓRIA!" : "DERROTA", w/2, h/2);
            ctx.fillStyle = '#fff'; ctx.font="30px sans-serif";
            ctx.fillText("Toque para voltar ao menu", w/2, h/2+60);
        },

        spawnPart: function(x, y, n, c) {
            for(let i=0; i<n; i++) particles.push({
                x, y, vx:(Math.random()-0.5)*15, vy:(Math.random()-0.5)*15, 
                life: 20, c
            });
        },
        drawPart: function(ctx) {
            particles.forEach((p, i) => {
                p.x+=p.vx; p.y+=p.vy; p.life--;
                ctx.fillStyle = p.c; ctx.globalAlpha = p.life/20;
                ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill();
                ctx.globalAlpha = 1;
                if(p.life<=0) particles.splice(i,1);
            });
        }
    };

    // REGISTRO
    if(window.System) {
        window.System.registerGame('box_pro', 'Pro Boxing', '🥊', Logic, {camOpacity: 0.15});
    }
})();