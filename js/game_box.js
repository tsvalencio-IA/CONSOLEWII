// =============================================================================
// PRO BOXING: SMASH EDITION (MARIO STYLE + REAL SKELETON PHYSICS)
// ARQUITETO: SENIOR DEV - VISUAL PS2 "BLACK" & NINTENDO CHARS
// =============================================================================

(function() {
    let particles = [];
    
    // --- CONFIGURAÇÃO VISUAL & GAMEPLAY ---
    const CONF = {
        GRAVITY: 0.8,
        HIT_FREEZE: 8, // Frames congelados no impacto
        CAM_DAMP: 0.1,
        
        // Estilo Gráfico "Black PS2"
        VIGNE_STRENGTH: 0.7, // Escuridão nos cantos
        BLOOM: 15,           // Brilho das luzes
        
        // Personagens (Estilo Mario)
        CHARS: {
            'mario': { 
                name: 'RED HERO', 
                colors: { hat: '#d00', skin: '#ffccaa', shirt: '#d00', over: '#00d', glove: '#fff' },
                letter: 'M',
                stats: { pwr: 1.0, spd: 1.0 }
            },
            'luigi': { 
                name: 'GREEN BRO', 
                colors: { hat: '#0a0', skin: '#ffccaa', shirt: '#0a0', over: '#009', glove: '#fff' },
                letter: 'L',
                stats: { pwr: 0.8, spd: 1.2 }
            },
            'wario': { 
                name: 'BAD GREEDY', 
                colors: { hat: '#ec0', skin: '#eebefa', shirt: '#ec0', over: '#909', glove: '#fff' },
                letter: 'W',
                stats: { pwr: 1.4, spd: 0.7 }
            }
        }
    };

    // --- MATH & PHYSICS CORE ---
    const M = {
        lerp: (a, b, t) => a + (b - a) * t,
        dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
        angle: (a, b) => Math.atan2(b.y - a.y, b.x - a.x)
    };

    const Logic = {
        state: 'MENU', // MENU, FIGHT, WIN
        mode: 'SOLO',
        
        frame: 0,
        freeze: 0,
        
        // Câmera Dinâmica
        cam: { x:0, y:0, z:1, shake:0 },

        // Jogador Local
        charId: 'mario',
        player: {
            hp: 100, maxHp: 100,
            pose: null, // Skeleton Data
            hands: { l:{x:0,y:0,vx:0,vy:0,state:0}, r:{x:0,y:0,vx:0,vy:0,state:0} }
        },

        // Rival (Rede ou CPU)
        rival: {
            id: null,
            hp: 100,
            pose: null, // Skeleton Data do Inimigo
            charId: 'wario',
            // CPU Brain
            aiTimer: 0, aiState: 0, aiHands: { l:{x:0,y:0}, r:{x:0,y:0} }
        },

        // Networking
        roomId: 'smash_ring_01',
        isOnline: false,
        dbRef: null,

        // =====================================================================
        // 1. SYSTEM INIT
        // =====================================================================
        init: function() {
            this.state = 'MENU';
            this.setupInput();
            this.disconnect();
            window.System.msg("SMASH BOXING");
        },

        disconnect: function() {
            if (this.dbRef) try { this.dbRef.off(); } catch(e){}
            this.isOnline = false;
        },

        setupInput: function() {
            // Detector de Clique para Menu
            window.System.canvas.onclick = (e) => {
                if (this.state === 'MENU') {
                    const r = window.System.canvas.getBoundingClientRect();
                    const cx = e.clientX - r.left;
                    if (cx < r.width/2) this.start('SOLO');
                    else this.start('VERSUS');
                } else if (this.state === 'WIN') {
                    this.init();
                }
            };
        },

        start: function(mode) {
            this.mode = mode;
            this.state = 'FIGHT';
            this.player.hp = 100;
            this.rival.hp = 100;
            
            if (mode === 'VERSUS') {
                if (window.DB) {
                    this.isOnline = true;
                    this.connect();
                    window.System.msg("CONNECTING...");
                } else {
                    this.mode = 'SOLO';
                    window.System.msg("OFFLINE MODE");
                }
            } else {
                this.rival.charId = 'wario'; // CPU é o Wario
                window.System.msg("VS CPU");
            }
            window.Sfx.play(400, 'square', 0.5, 0.2);
        },

        // =====================================================================
        // 2. MAIN LOOP
        // =====================================================================
        update: function(ctx, w, h, rawPose) {
            this.frame++;

            // --- POSE TRACKING (SUAVIZADO) ---
            if (rawPose && rawPose.keypoints) {
                // Se for a primeira vez, clona. Se não, interpola (lerp) para não tremer
                if (!this.player.pose) this.player.pose = JSON.parse(JSON.stringify(rawPose));
                else {
                    this.player.pose.keypoints.forEach((kp, i) => {
                        const raw = rawPose.keypoints[i];
                        if (raw.score > 0.3) {
                            kp.x = M.lerp(kp.x, raw.x, 0.5);
                            kp.y = M.lerp(kp.y, raw.y, 0.5);
                            kp.score = raw.score;
                        }
                    });
                }
            }

            // --- STATE HANDLER ---
            if (this.state === 'MENU') { this.drawMenu(ctx, w, h); return 100; }
            if (this.state === 'WIN') { this.drawWin(ctx, w, h); return 0; }

            // --- IMPACT FREEZE (GAME FEEL) ---
            if (this.freeze > 0) {
                this.freeze--;
                this.cam.shake = (Math.random()-0.5)*20;
                this.drawGame(ctx, w, h); // Desenha frame estático
                return this.player.hp;
            }
            this.cam.shake *= 0.8;

            // --- PHYSICS ---
            this.processPlayer(w, h);
            
            if (this.mode === 'SOLO') this.processAI(w, h);
            else this.syncNet();

            // --- RENDER ---
            this.updateCam(w, h);
            this.drawGame(ctx, w, h);

            // Check Game Over
            if (this.player.hp <= 0 || this.rival.hp <= 0) {
                this.state = 'WIN';
                const win = this.player.hp > 0;
                window.System.msg(win ? "YOU WIN!" : "YOU LOSE!");
            }

            return this.player.hp;
        },

        // =====================================================================
        // 3. FÍSICA & COMBATE
        // =====================================================================
        processPlayer: function(w, h) {
            if (!this.player.pose) return;
            const pose = this.player.pose;
            
            // Mapeia para coordenadas de jogo (Centralizado 0,0)
            const map = (p) => ({ 
                x: (1 - p.x/640)*w - w/2, 
                y: (p.y/480)*h - h/2 
            });
            const get = (n) => pose.keypoints.find(k => k.name === n) || {x:0, y:0};

            const lWr = map(get('left_wrist'));
            const rWr = map(get('right_wrist'));

            // Lógica de Soco
            ['l', 'r'].forEach(s => {
                const hand = this.player.hands[s];
                const curr = s === 'l' ? lWr : rWr;
                
                // Calcula velocidade do golpe
                const vel = M.dist(hand, curr);
                
                // Gatilho de Soco (Aceleração Alta)
                if (vel > 25 && hand.state === 0) {
                    hand.state = 1; // Atacando
                    window.Sfx.play(150, 'sawtooth', 0.1, 0.1); // Woosh sound
                }

                // Colisão
                if (hand.state === 1) {
                    this.checkHit(curr, vel);
                    if (vel < 5) hand.state = 0; // Reset
                } else {
                    hand.state = 0;
                }

                // Atualiza pos anterior
                hand.x = curr.x; hand.y = curr.y;
            });
        },

        processAI: function(w, h) {
            const r = this.rival;
            // Respiração Procedural
            const t = this.frame * 0.08;
            const breath = Math.sin(t) * 15;
            
            // Posição base da CPU (Espelhada)
            const cx = w/2; 
            const cy = h/2 + breath;

            // IA Simples
            r.aiTimer++;
            if (r.aiTimer > 40 && Math.random() < 0.08) {
                r.aiState = Math.random() > 0.5 ? 1 : 2; // Soco Esq ou Dir
                r.aiTimer = 0;
            }

            // Cinemática Inversa Falsa para os braços da CPU
            let txL = cx - 60, tyL = cy + 50; // Guarda Esq
            let txR = cx + 60, tyR = cy + 50; // Guarda Dir

            // Ataques
            if (r.aiState === 1) { // Soco Esq
                txL += 80; tyL += 150; 
                if (r.aiTimer === 8) this.hitPlayer(8); 
            }
            if (r.aiState === 2) { // Soco Dir
                txR -= 80; tyR += 150; 
                if (r.aiTimer === 8) this.hitPlayer(12);
            }

            // Suavização do movimento da mão
            r.aiHands.l.x = M.lerp(r.aiHands.l.x, txL, 0.2);
            r.aiHands.l.y = M.lerp(r.aiHands.l.y, tyL, 0.2);
            r.aiHands.r.x = M.lerp(r.aiHands.r.x, txR, 0.2);
            r.aiHands.r.y = M.lerp(r.aiHands.r.y, tyR, 0.2);

            if (r.aiTimer > 15) r.aiState = 0;

            // Cria esqueleto fake para renderizar
            this.rival.pose = {
                isCPU: true,
                head: {x: cx, y: cy - 120},
                lS: {x: cx-70, y: cy-20}, rS: {x: cx+70, y: cy-20}, // Ombros
                lE: {x: cx-90, y: cy+40}, rE: {x: cx+90, y: cy+40}, // Cotovelos
                lW: r.aiHands.l, rW: r.aiHands.r // Pulsos
            };
        },

        checkHit: function(pos, vel) {
            // Hitbox no "meio" da tela (onde está o oponente virtual)
            if (M.dist(pos, {x:0, y:-50}) < 90) {
                const dmg = 5 + (vel/4);
                this.rival.hp -= dmg;
                this.freeze = CONF.HIT_FREEZE; // Stop motion effect
                
                // FX
                this.spawnSpark(pos.x, pos.y, 8);
                window.Sfx.play(100, 'square', 0.1, 0.3); // Hit sound
                
                if (this.isOnline) this.sendHit(dmg);
            }
        },

        hitPlayer: function(dmg) {
            this.player.hp -= dmg;
            this.cam.shake = 25;
            window.Sfx.play(80, 'sawtooth', 0.2, 0.4);
        },

        // =====================================================================
        // 4. NETCODE (FIREBASE)
        // =====================================================================
        connect: function() {
            if(!this.isOnline) return;
            const id = window.System.playerId;
            this.dbRef = window.DB.ref(`rooms/${this.roomId}`);
            
            // Join
            this.dbRef.child(`p/${id}`).set({ c: this.charId, hp: 100 });
            this.dbRef.child(`p/${id}`).onDisconnect().remove();

            // Listen
            this.dbRef.child('p').on('value', s => {
                const d = s.val(); if(!d) return;
                Object.keys(d).forEach(k => {
                    if(k !== id) {
                        this.rival.id = k;
                        this.rival.charId = d[k].c;
                        if(d[k].pose) this.rival.pose = d[k].pose;
                        if(d[k].hp) this.rival.hp = d[k].hp;
                    }
                });
            });

            // Send Loop (20fps)
            if(!this._netInt) {
                this._netInt = setInterval(() => {
                    if(this.state === 'FIGHT' && this.player.pose) {
                        this.dbRef.child(`p/${id}`).update({ 
                            pose: this.player.pose, hp: this.player.hp 
                        });
                    }
                }, 50);
            }
        },

        sendHit: function(d) {
            if(this.dbRef) this.dbRef.child('ev').push({ t:'hit', d });
        },
        syncNet: function() {}, // Placeholder

        // =====================================================================
        // 5. RENDERIZAÇÃO "BLACK PS2" + MARIO STYLE
        // =====================================================================
        updateCam: function(w, h) {
            // Câmera segue o nariz do player
            let tx=0, ty=0;
            if (this.player.pose && this.player.pose.keypoints) {
                const n = this.player.pose.keypoints.find(k=>k.name==='nose');
                if(n) {
                    tx = (1 - n.x/640)*w - w/2;
                    ty = (n.y/480)*h - h/2;
                }
            }
            this.cam.x = M.lerp(this.cam.x, tx*0.2, CONF.CAM_DAMP);
            this.cam.y = M.lerp(this.cam.y, ty*0.1, CONF.CAM_DAMP);
            
            // Zoom no impacto
            const tz = this.freeze > 0 ? 1.1 : 1.0;
            this.cam.z = M.lerp(this.cam.z, tz, 0.2);
        },

        drawGame: function(ctx, w, h) {
            ctx.save();
            
            // Fundo Gritty (Preto com noise simulado)
            ctx.fillStyle = '#050505'; ctx.fillRect(0,0,w,h);
            
            // Aplica Câmera
            ctx.translate(w/2, h/2);
            ctx.scale(this.cam.z, this.cam.z);
            ctx.translate(-this.cam.x + this.cam.shake, -this.cam.y + this.cam.shake);

            // Ringue Volumétrico
            this.drawRing(ctx, w, h);

            // Rival (Fundo)
            if (this.rival.pose) this.drawChar(ctx, this.rival.pose, this.rival.charId, false);
            
            // Player (Frente)
            if (this.player.pose) this.drawChar(ctx, this.player.pose, this.charId, true);

            // Partículas
            this.drawParticles(ctx);

            ctx.restore();

            // Pós-Processamento (Scanlines/Vignette) e HUD
            this.drawPostFX(ctx, w, h);
            this.drawHUD(ctx, w, h);
        },

        drawRing: function(ctx, w, h) {
            // Chão com reflexo falso
            const g = ctx.createRadialGradient(0, 200, 10, 0, 200, 800);
            g.addColorStop(0, '#333'); g.addColorStop(1, '#000');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.ellipse(0, 200, 800, 300, 0, 0, Math.PI*2); ctx.fill();
            
            // Cordas iluminadas
            ctx.shadowBlur = 20; ctx.shadowColor = '#d00';
            ctx.strokeStyle = '#a00'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(-w, -50); ctx.lineTo(w, -50); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(w, 0); ctx.stroke();
            ctx.shadowBlur = 0;
        },

        drawChar: function(ctx, pose, charId, isSelf) {
            const c = CONF.CHARS[charId];
            let nose, lS, rS, lE, rE, lW, rW;

            if (pose.isCPU) {
                // Dados diretos da CPU
                nose=pose.head; lS=pose.lS; rS=pose.rS; lE=pose.lE; rE=pose.rE; lW=pose.lW; rW=pose.rW;
            } else {
                // Dados do TensorFlow (Precisa converter)
                const kp = pose.keypoints;
                const get = (n) => {
                    const k = kp.find(p=>p.name===n);
                    if(!k) return {x:0,y:0};
                    let xx = k.x; if (isSelf) xx = 640 - xx; // Espelha se for player
                    return {
                        x: (xx/640)*ctx.canvas.width - ctx.canvas.width/2,
                        y: (k.y/480)*ctx.canvas.height - ctx.canvas.height/2
                    };
                };
                nose=get('nose'); lS=get('left_shoulder'); rS=get('right_shoulder');
                lE=get('left_elbow'); rE=get('right_elbow'); lW=get('left_wrist'); rW=get('right_wrist');
            }

            // --- DESENHO DO CORPO (MARIO STYLE) ---
            
            // 1. Corpo/Macacão
            ctx.fillStyle = c.colors.over;
            ctx.beginPath(); 
            ctx.moveTo(lS.x, lS.y); ctx.lineTo(rS.x, rS.y);
            ctx.lineTo((rS.x+lS.x)/2, rS.y+150); 
            ctx.fill();
            
            // Camisa (Embaixo do macacão)
            ctx.fillStyle = c.colors.shirt;
            ctx.beginPath(); ctx.arc((lS.x+rS.x)/2, (lS.y+rS.y)/2 - 10, 40, 0, Math.PI*2); ctx.fill();

            // Botões do Macacão
            ctx.fillStyle = '#ff0';
            ctx.beginPath(); ctx.arc(lS.x+10, lS.y+20, 8, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(rS.x-10, rS.y+20, 8, 0, Math.PI*2); ctx.fill();

            // 2. Braços (Tubulares)
            const drawArm = (p1, p2, p3) => {
                ctx.lineWidth = 25; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.strokeStyle = c.colors.shirt;
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.stroke();
            };
            drawArm(lS, lE, lW);
            drawArm(rS, rE, rW);

            // 3. Cabeça
            ctx.fillStyle = c.colors.skin;
            ctx.beginPath(); ctx.arc(nose.x, nose.y, 45, 0, Math.PI*2); ctx.fill();

            // Bigode (Essencial!)
            ctx.fillStyle = '#000';
            ctx.beginPath(); 
            ctx.ellipse(nose.x, nose.y+15, 25, 8, 0, 0, Math.PI*2); 
            ctx.fill();

            // Nariz
            ctx.fillStyle = c.colors.skin; // Nariz batatão
            ctx.beginPath(); ctx.arc(nose.x, nose.y+5, 12, 0, Math.PI*2); ctx.fill();

            // Boné
            ctx.fillStyle = c.colors.hat;
            ctx.beginPath(); ctx.arc(nose.x, nose.y-15, 48, Math.PI, 0); ctx.fill(); // Domo
            ctx.beginPath(); ctx.ellipse(nose.x, nose.y-15, 50, 10, 0, 0, Math.PI*2); ctx.fill(); // Aba
            
            // Letra
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(nose.x, nose.y-35, 15, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = c.colors.hat; ctx.font="bold 20px Arial"; ctx.textAlign="center";
            ctx.fillText(c.letter, nose.x, nose.y-28);

            // 4. Luvas
            const drawGlove = (p) => {
                const g = ctx.createRadialGradient(p.x-5, p.y-5, 2, p.x, p.y, 40);
                g.addColorStop(0, '#fff'); g.addColorStop(1, '#ddd');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(p.x, p.y, 40, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
            };
            drawGlove(lW); drawGlove(rW);

            // --- SKELETON OVERLAY (PEDIDO DO USUÁRIO) ---
            // Desenha as linhas de "arame" por cima para mostrar o tracking real
            if (isSelf) {
                ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)'; ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(lS.x, lS.y); ctx.lineTo(lE.x, lE.y); ctx.lineTo(lW.x, lW.y);
                ctx.moveTo(rS.x, rS.y); ctx.lineTo(rE.x, rE.y); ctx.lineTo(rW.x, rW.y);
                ctx.moveTo(lS.x, lS.y); ctx.lineTo(rS.x, rS.y); // Clavícula
                ctx.moveTo((lS.x+rS.x)/2, (lS.y+rS.y)/2); ctx.lineTo(nose.x, nose.y); // Pescoço
                ctx.stroke();
                
                // Pontos nas juntas
                ctx.fillStyle = '#0f0';
                [lS, rS, lE, rE, lW, rW, nose].forEach(p => {
                    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2); ctx.fill();
                });
            }
        },

        drawHUD: function(ctx, w, h) {
            const barW = w * 0.35;
            const y = 30;
            
            // Player HP
            ctx.fillStyle = '#300'; ctx.fillRect(20, y, barW, 20);
            ctx.fillStyle = '#f00'; ctx.fillRect(20, y, barW * (this.player.hp/100), 20);
            ctx.strokeStyle = '#fff'; ctx.lineWidth=2; ctx.strokeRect(20, y, barW, 20);
            
            // Rival HP
            ctx.fillStyle = '#030'; ctx.fillRect(w-20-barW, y, barW, 20);
            ctx.fillStyle = '#0f0'; ctx.fillRect(w-20-barW, y, barW * (this.rival.hp/100), 20);
            ctx.strokeRect(w-20-barW, y, barW, 20);

            // Avatar Circles
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(60, 80, 40, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#d00'; ctx.font="bold 40px Arial"; ctx.textAlign="center";
            ctx.fillText("M", 60, 95);

            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(w-60, 80, 40, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = this.mode==='SOLO'?'#ec0':'#0a0'; 
            ctx.fillText(this.mode==='SOLO'?'W':'L', w-60, 95);
        },

        drawPostFX: function(ctx, w, h) {
            // Vignette (Escuridão nos cantos)
            const g = ctx.createRadialGradient(w/2, h/2, w/3, w/2, h/2, w);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,0.8)');
            ctx.fillStyle = g;
            ctx.fillRect(0,0,w,h);

            // Scanlines (Estilo TV antiga)
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            for(let i=0; i<h; i+=4) ctx.fillRect(0, i, w, 2);
        },

        drawMenu: function(ctx, w, h) {
            // Fundo Split
            ctx.fillStyle = '#d00'; ctx.fillRect(0,0,w/2,h);
            ctx.fillStyle = '#00d'; ctx.fillRect(w/2,0,w/2,h);
            
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; 
            ctx.font = "bold 80px Impact";
            ctx.fillText("SMASH", w/2, 100);
            ctx.fillText("BOXING", w/2, 180);

            ctx.font = "bold 40px Arial";
            ctx.fillText("TREINO VS CPU", w/4, h/2);
            ctx.fillText("ONLINE PVP", w*0.75, h/2);
            
            ctx.font = "20px Arial";
            ctx.fillText("(Clique Esquerda)", w/4, h/2+40);
            ctx.fillText("(Clique Direita)", w*0.75, h/2+40);
        },

        drawWin: function(ctx, w, h) {
            ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = this.player.hp > 0 ? '#ff0' : '#f00';
            ctx.textAlign = 'center'; ctx.font = "bold 80px Impact";
            ctx.fillText(this.player.hp > 0 ? "VICTORY!" : "K.O.", w/2, h/2);
            ctx.fillStyle = '#fff'; ctx.font = "30px Arial";
            ctx.fillText("Clique para Voltar", w/2, h/2+60);
        },

        spawnSpark: function(x, y, n) {
            for(let i=0; i<n; i++) particles.push({
                x, y, vx:(Math.random()-0.5)*20, vy:(Math.random()-0.5)*20, 
                life: 15, c: '#ffaa00'
            });
        },
        
        drawParticles: function(ctx) {
            particles.forEach((p, i) => {
                p.x+=p.vx; p.y+=p.vy; p.life--;
                ctx.fillStyle = p.c; ctx.globalAlpha = p.life/15;
                ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill();
                ctx.globalAlpha = 1;
                if(p.life<=0) particles.splice(i,1);
            });
        },

        connect: function() {
            if(!this.isOnline) return;
            const id = window.System.playerId;
            this.dbRef = window.DB.ref(`rooms/${this.roomId}`);
            this.dbRef.child(`p/${id}`).set({ hp:100 });
            this.dbRef.child(`p/${id}`).onDisconnect().remove();
            
            this.dbRef.child('p').on('value', s => {
                const d = s.val(); if(!d) return;
                Object.keys(d).forEach(k => {
                    if(k!==id) {
                        this.rival.id = k;
                        if(d[k].pose) this.rival.pose = d[k].pose;
                        if(d[k].hp) this.rival.hp = d[k].hp;
                    }
                });
            });
            
            this.dbRef.child('ev').on('child_added', s => {
                const ev = s.val();
                if(ev.t==='hit' && ev.tgt===id) this.hitPlayer(ev.d);
            });

            setInterval(() => {
                if(this.state==='FIGHT') this.dbRef.child(`p/${id}`).update({pose:this.player.pose, hp:this.player.hp});
            }, 100);
        },
        
        sendHit: function(d) {
            if(this.dbRef && this.rival.id) this.dbRef.child('ev').push({t:'hit', d, tgt:this.rival.id});
        }
    };

    if(window.System) window.System.registerGame('box_smash', 'Smash Box', '🥊', Logic, {camOpacity: 0.2});
})();