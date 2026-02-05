// =============================================================================
// PRO BOXING LEAGUE: ARCADE EDITION (CORE COMPATIBLE)
// REWRITE: SENIOR ARCHITECT (INDEX-BASED POSE DETECTION)
// =============================================================================

(function() {

    // --- CONFIGURAÇÃO (CONSTANTES) ---
    const CFG = {
        ROUNDS: 3,
        ROUND_TIME: 60,      // Segundos
        PUNCH_THRESH: 18,    // Velocidade mínima para soco (px/frame)
        REACH_THRESH: 100,   // Distância do ombro para considerar extensão
        DAMAGE_PLAYER: 6,
        DAMAGE_RIVAL: 4,
        AI_AGGRESSION: 0.02, // Chance de soco da IA por frame
        HIT_COOLDOWN: 20     // Frames entre acertos
    };

    // --- UTILITÁRIOS INTERNOS ---
    const Utils = {
        // Mapeia coordenadas normalizadas (0-640) para a tela atual (w,h) com espelhamento X
        toScreen: (kp, w, h) => ({
            x: (1 - kp.x / 640) * w,
            y: (kp.y / 480) * h
        }),
        dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y)
    };

    // --- LÓGICA DO JOGO ---
    const BoxingGame = {
        // Estado
        state: 'MENU', // MENU, FIGHT, KO, WIN
        frame: 0,
        timer: 0,
        round: 1,

        // Entidades
        player: {
            hp: 100,
            maxHp: 100,
            score: 0,
            guard: false,
            hands: {
                left:  { x: 0, y: 0, px: 0, py: 0, state: 'IDLE', cooldown: 0 },
                right: { x: 0, y: 0, px: 0, py: 0, state: 'IDLE', cooldown: 0 }
            }
        },

        rival: {
            hp: 100,
            maxHp: 100,
            x: 0, // Posição X relativa ao centro
            state: 'IDLE', // IDLE, GUARD, PUNCH, HIT
            animTimer: 0,
            flash: 0 // Flash branco ao levar dano
        },

        // Feedback
        particles: [],
        msgs: [],
        menuTimer: 0,

        // =================================================================
        // API DO SISTEMA (INIT / CLEANUP)
        // =================================================================
        
        init: function() {
            this.resetMatch();
            this.state = 'MENU';
            this.menuTimer = 0;
            if(window.System && window.System.msg) window.System.msg("BOXE: USE A CABEÇA");
        },

        cleanup: function() {
            this.particles = [];
            this.msgs = [];
        },

        resetMatch: function() {
            this.player.hp = 100;
            this.player.score = 0;
            this.resetRound();
            this.round = 1;
        },

        resetRound: function() {
            this.rival.hp = 100;
            this.rival.x = 0;
            this.rival.state = 'IDLE';
            this.timer = CFG.ROUND_TIME * 60; // Convertendo para frames (aprox)
        },

        // =================================================================
        // LOOP PRINCIPAL (UPDATE)
        // =================================================================
        
        update: function(ctx, w, h, pose) {
            this.frame++;
            
            // 1. FUNDO E AMBIENTE
            this.drawArena(ctx, w, h);

            // 2. PROCESSAMENTO DE POSE (INDEX BASED - OBRIGATÓRIO)
            let nose = null, lWr = null, rWr = null, lSh = null, rSh = null;
            
            if (pose && pose.keypoints) {
                // Índices do MoveNet: 0:Nose, 5:L_Shoulder, 6:R_Shoulder, 9:L_Wrist, 10:R_Wrist
                const k = pose.keypoints;
                if (k[0] && k[0].score > 0.3) nose = Utils.toScreen(k[0], w, h);
                if (k[5] && k[5].score > 0.3) lSh  = Utils.toScreen(k[5], w, h);
                if (k[6] && k[6].score > 0.3) rSh  = Utils.toScreen(k[6], w, h);
                if (k[9] && k[9].score > 0.3) lWr  = Utils.toScreen(k[9], w, h);
                if (k[10] && k[10].score > 0.3) rWr = Utils.toScreen(k[10], w, h);
            }

            // 3. MÁQUINA DE ESTADOS
            if (this.state === 'MENU') {
                this.updateMenu(ctx, w, h, nose);
            } else if (this.state === 'FIGHT') {
                this.updateFight(ctx, w, h, nose, lWr, rWr, lSh, rSh);
            } else {
                this.drawEndScreen(ctx, w, h);
                // Reiniciar com gesto (mãos para cima)
                if (lWr && rWr && lWr.y < h*0.3 && rWr.y < h*0.3) {
                    this.init();
                }
            }

            // 4. UI GLOBAL
            this.drawParticles(ctx);
            this.drawMessages(ctx);
            if (this.state === 'FIGHT') this.drawHUD(ctx, w, h);

            return Math.floor(this.player.score);
        },

        // --- MENU ---
        updateMenu: function(ctx, w, h, nose) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0,0,w,h);
            
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.font = "bold 60px 'Russo One'";
            ctx.fillText("PRO BOXING", w/2, h*0.4);
            ctx.font = "20px Roboto";
            ctx.fillText("Mantenha a cabeça no círculo verde para começar", w/2, h*0.5);

            // Botão Start
            const btnX = w/2, btnY = h*0.7, btnR = 50;
            ctx.beginPath(); ctx.arc(btnX, btnY, btnR, 0, Math.PI*2);
            ctx.strokeStyle = '#0f0'; ctx.lineWidth = 4; ctx.stroke();

            if (nose) {
                // Desenha cursor do nariz
                ctx.fillStyle = '#0f0';
                ctx.beginPath(); ctx.arc(nose.x, nose.y, 10, 0, Math.PI*2); ctx.fill();

                if (Utils.dist(nose, {x: btnX, y: btnY}) < btnR) {
                    this.menuTimer++;
                    ctx.fillStyle = `rgba(0,255,0,${this.menuTimer/60})`;
                    ctx.fill(); // Preenche o botão
                    
                    if (this.menuTimer > 60) {
                        this.state = 'FIGHT';
                        this.spawnMsg(w/2, h/2, "FIGHT!", "#ff0", 60);
                        if(window.Sfx) window.Sfx.play(600, 'square', 0.5);
                    }
                } else {
                    this.menuTimer = 0;
                }
            }
        },

        // --- LUTA ---
        updateFight: function(ctx, w, h, nose, lWr, rWr, lSh, rSh) {
            // Timer
            if (this.timer > 0) this.timer--;
            else {
                if (this.round < CFG.ROUNDS) {
                    this.round++;
                    this.resetRound();
                    this.spawnMsg(w/2, h/2, "ROUND " + this.round, "#0ff", 90);
                } else {
                    this.finishGame(this.player.hp > this.rival.hp);
                    return;
                }
            }

            // --- IA RIVAL ---
            // Movimento lateral (Senoide)
            this.rival.x = Math.sin(this.frame * 0.03) * (w * 0.15);
            
            // Decisão da IA
            if (this.rival.animTimer > 0) {
                this.rival.animTimer--;
            } else {
                this.rival.state = 'IDLE';
                // Ataque Aleatório
                if (Math.random() < CFG.AI_AGGRESSION) {
                    this.rival.state = 'PUNCH';
                    this.rival.animTimer = 30;
                    // Dano no player se não defender
                    setTimeout(() => {
                        if (this.state === 'FIGHT' && !this.player.guard) {
                            this.player.hp -= CFG.DAMAGE_RIVAL;
                            if(window.Gfx) window.Gfx.shakeScreen(5);
                            if(window.Sfx) window.Sfx.play(150, 'sawtooth', 0.2);
                            this.spawnMsg(w/2, h*0.8, "OUCH!", "#f00", 30);
                        } else if (this.state === 'FIGHT') {
                            if(window.Sfx) window.Sfx.play(100, 'sine', 0.1);
                            this.spawnMsg(w/2, h*0.8, "BLOCK", "#aaa", 20);
                        }
                    }, 400); // Delay do soco
                }
                // Guarda Aleatória
                else if (Math.random() < 0.01) {
                    this.rival.state = 'GUARD';
                    this.rival.animTimer = 60;
                }
            }

            // Desenhar Rival
            this.drawRival(ctx, w, h);

            // --- FÍSICA DO JOGADOR ---
            // 1. Guarda (Mãos perto do nariz)
            this.player.guard = false;
            if (nose && lWr && rWr) {
                if (Utils.dist(lWr, nose) < 80 && Utils.dist(rWr, nose) < 80) {
                    this.player.guard = true;
                }
            }

            // 2. Processar Mãos (Socos)
            this.processHand(ctx, 'left', lWr, lSh, w, h);
            this.processHand(ctx, 'right', rWr, rSh, w, h);

            // Checar K.O.
            if (this.player.hp <= 0) this.finishGame(false);
            if (this.rival.hp <= 0) this.finishGame(true);
        },

        processHand: function(ctx, side, pos, shoulder, w, h) {
            const hand = this.player.hands[side];
            const color = side === 'left' ? '#3498db' : '#e74c3c';

            if (pos) {
                // Velocidade
                const speed = Utils.dist(pos, {x: hand.px, y: hand.py});
                
                // Atualiza posições
                hand.px = hand.x; hand.py = hand.y;
                hand.x = pos.x;   hand.y = pos.y;

                if (hand.cooldown > 0) hand.cooldown--;

                // DETECÇÃO DE SOCO
                // Se velocidade alta E (não está em cooldown) E (está estendido longe do ombro OU movimento rápido Y)
                if (speed > CFG.PUNCH_THRESH && hand.cooldown === 0 && hand.state === 'IDLE') {
                    hand.state = 'PUNCH';
                    hand.cooldown = CFG.HIT_COOLDOWN;
                    if(window.Sfx) window.Sfx.play(300, 'noise', 0.1); // Som de 'woosh'
                    
                    // Checar colisão com rival
                    this.checkHit(pos, w, h);
                }

                if (hand.cooldown < 10) hand.state = 'IDLE';
            }

            // Renderização da Luva
            ctx.save();
            ctx.translate(hand.x, hand.y);
            
            // Efeito visual no soco
            if (hand.state === 'PUNCH') {
                ctx.scale(1.4, 1.4);
                ctx.shadowBlur = 20;
                ctx.shadowColor = color;
            }

            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(0, 0, 35, 0, Math.PI*2); ctx.fill();
            
            // Brilho
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath(); ctx.arc(-10, -10, 12, 0, Math.PI*2); ctx.fill();
            
            ctx.restore();
        },

        checkHit: function(handPos, w, h) {
            // Hitbox do rival (Centro da tela + offset X)
            const rx = (w/2) + this.rival.x;
            const ry = (h/3) + 50; // Altura aproximada do rosto
            
            // Distância do soco ao rosto do rival
            if (Utils.dist(handPos, {x: rx, y: ry}) < 150) {
                if (this.rival.state === 'GUARD') {
                    this.spawnMsg(handPos.x, handPos.y, "BLOCKED", "#aaa", 30);
                    if(window.Sfx) window.Sfx.play(100, 'square', 0.1);
                } else {
                    // ACERTOU
                    const dmg = CFG.DAMAGE_PLAYER;
                    this.rival.hp -= dmg;
                    this.rival.flash = 6;
                    this.player.score += 100;
                    
                    this.spawnMsg(handPos.x, handPos.y, "HIT!", "#ff0", 40);
                    this.spawnParticles(handPos.x, handPos.y, '#ff0');
                    
                    if(window.Gfx) window.Gfx.shakeScreen(8);
                    if(window.Sfx) window.Sfx.hit();
                }
            }
        },

        finishGame: function(win) {
            this.state = win ? 'WIN' : 'KO';
            if(window.System) window.System.gameOver(this.player.score);
        },

        // --- RENDER ---
        drawArena: function(ctx, w, h) {
            // Gradiente fundo
            const g = ctx.createLinearGradient(0,0,0,h);
            g.addColorStop(0, '#111'); g.addColorStop(1, '#2c3e50');
            ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

            // Cordas
            ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(0, h*0.4); ctx.lineTo(w, h*0.4);
            ctx.moveTo(0, h*0.55); ctx.lineTo(w, h*0.55);
            ctx.moveTo(0, h*0.7); ctx.lineTo(w, h*0.7);
            ctx.stroke();
        },

        drawRival: function(ctx, w, h) {
            const rx = (w/2) + this.rival.x;
            const ry = (h/3) + 50;

            ctx.save();
            ctx.translate(rx, ry);

            // Flash de dano
            if (this.rival.flash > 0) {
                this.rival.flash--;
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = '#fff';
            } else {
                ctx.fillStyle = this.rival.state === 'GUARD' ? '#2ecc71' : '#f1c40f';
            }

            // Corpo
            ctx.beginPath(); ctx.arc(0, -60, 50, 0, Math.PI*2); ctx.fill(); // Cabeça
            ctx.fillRect(-40, -10, 80, 140); // Torso

            // Luvas do Rival
            ctx.fillStyle = '#e74c3c';
            let lx = -60, ly = 60, rx_g = 60, ry_g = 60;
            
            if (this.rival.state === 'PUNCH') {
                lx = -80; ly = 160; // Soco vindo na direção da tela
                ctx.scale(1.1, 1.1); // Zoom hit effect
            } else if (this.rival.state === 'GUARD') {
                lx = -30; ly = 0;
                rx_g = 30; ry_g = 0;
            }

            ctx.beginPath(); ctx.arc(lx, ly, 40, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(rx_g, ry_g, 40, 0, Math.PI*2); ctx.fill();

            // Rosto
            ctx.fillStyle = '#000';
            if (this.rival.flash > 0) {
                ctx.font = "30px Arial"; ctx.textAlign = 'center'; ctx.fillText("X  X", 0, -50);
            } else {
                ctx.beginPath(); ctx.arc(-20, -60, 5, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(20, -60, 5, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.moveTo(-10, -40); ctx.lineTo(10, -40); ctx.stroke();
            }

            ctx.restore();
        },

        drawHUD: function(ctx, w, h) {
            // Barras de vida
            const barW = w * 0.35;
            const drawBar = (x, y, val, max, color, align) => {
                ctx.fillStyle = '#444';
                const bx = align === 'right' ? x - barW : x;
                ctx.fillRect(bx, y, barW, 20);
                
                ctx.fillStyle = color;
                const fill = (val/max) * barW;
                const fx = align === 'right' ? x - fill : x;
                ctx.fillRect(fx, y, fill, 20);
            };

            drawBar(20, 20, this.player.hp, 100, '#3498db', 'left');
            drawBar(w-20, 20, this.rival.hp, 100, '#e74c3c', 'right');

            // Timer
            const sec = Math.ceil(this.timer / 60);
            ctx.fillStyle = '#fff';
            ctx.font = "bold 40px 'Russo One'";
            ctx.textAlign = 'center';
            ctx.fillText(sec, w/2, 50);

            // Score
            ctx.font = "20px Arial";
            ctx.textAlign = 'left';
            ctx.fillText("SCORE: " + this.player.score, 20, 60);
        },

        drawEndScreen: function(ctx, w, h) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(0,0,w,h);
            ctx.fillStyle = this.state === 'WIN' ? '#0f0' : '#f00';
            ctx.textAlign = 'center';
            ctx.font = "bold 60px 'Russo One'";
            ctx.fillText(this.state === 'WIN' ? "YOU WIN!" : "KNOCKOUT", w/2, h/2);
            
            ctx.fillStyle = '#fff';
            ctx.font = "30px Roboto";
            ctx.fillText("Levante as mãos para reiniciar", w/2, h/2 + 60);
        },

        // --- SISTEMA DE PARTÍCULAS ---
        spawnParticles: function(x, y, color) {
            for(let i=0; i<8; i++) {
                this.particles.push({
                    x, y, color,
                    vx: (Math.random() - 0.5) * 15,
                    vy: (Math.random() - 0.5) * 15,
                    life: 1.0
                });
            }
        },

        drawParticles: function(ctx) {
            this.particles.forEach((p, i) => {
                p.x += p.vx; p.y += p.vy; p.life -= 0.05;
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill();
            });
            ctx.globalAlpha = 1;
            this.particles = this.particles.filter(p => p.life > 0);
        },

        spawnMsg: function(x, y, txt, c, l) {
            this.msgs.push({x, y, txt, c, l, max: l});
        },

        drawMessages: function(ctx) {
            this.msgs.forEach(m => {
                ctx.fillStyle = m.c;
                ctx.font = "bold 40px 'Russo One'";
                ctx.textAlign = 'center';
                ctx.fillText(m.txt, m.x, m.y);
                m.y -= 1; m.l--;
            });
            this.msgs = this.msgs.filter(m => m.l > 0);
        }
    };

    // REGISTRO NO CORE
    if(window.System) {
        window.System.registerGame('box_pro', 'Pro Boxing', '🥊', BoxingGame, {
            camOpacity: 0.3 // Jogador vê a si mesmo translúcido
        });
    }

})();