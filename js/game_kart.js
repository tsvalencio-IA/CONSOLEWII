// =============================================================================
// KART LEGENDS: MARIO GP EDITION (GOLD MASTER - PHYSICS & GFX FINAL)
// ENGENHARIA SÊNIOR *177: CORREÇÃO TOTAL DE INPUT, MAPA, EFEITOS E FÍSICA
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E CONFIGURAÇÕES
    // -----------------------------------------------------------------
    
    const CHARACTERS = [
        { id: 0, name: 'MARIO',  color: '#e74c3c', hat: '#d32f2f', speedInfo: 1.00, turnInfo: 1.00, weight: 1.0, accel: 0.040 },
        { id: 1, name: 'LUIGI',  color: '#2ecc71', hat: '#27ae60', speedInfo: 1.05, turnInfo: 0.90, weight: 1.0, accel: 0.038 },
        { id: 2, name: 'PEACH',  color: '#ff9ff3', hat: '#fd79a8', speedInfo: 0.95, turnInfo: 1.15, weight: 0.8, accel: 0.055 },
        { id: 3, name: 'BOWSER', color: '#f1c40f', hat: '#e67e22', speedInfo: 1.10, turnInfo: 0.70, weight: 1.4, accel: 0.025 },
        { id: 4, name: 'TOAD',   color: '#3498db', hat: '#ecf0f1', speedInfo: 0.90, turnInfo: 1.25, weight: 0.6, accel: 0.070 }
    ];

    const TRACKS = [
        { id: 0, name: 'COGUMELO CUP', theme: 'grass', sky: 0, curveMult: 1.0 },
        { id: 1, name: 'DESERTO KALIMARI', theme: 'sand', sky: 1, curveMult: 0.8 },
        { id: 2, name: 'MONTANHA GELADA', theme: 'snow', sky: 2, curveMult: 1.3 }
    ];

    const CONF = {
        MAX_SPEED: 220,
        TURBO_MAX_SPEED: 330,
        FRICTION: 0.98,
        OFFROAD_DECEL: 0.92,
        ROAD_WIDTH: 2000,
        SEGMENT_LENGTH: 200,
        DRAW_DISTANCE: 250, 
        RUMBLE_LENGTH: 3
    };

    const PHYSICS = {
        gripAsphalt: 0.98,
        gripZebra: 0.85,
        gripOffroad: 0.35,
        centrifugalForce: 0.22,
        momentumTransfer: 1.6,
        steerSensitivity: 0.10, // Reduzido para maior responsividade
        lateralInertiaDecay: 0.95 // Aumentado para maior suavização
    };

    let segments = [];
    let trackLength = 0;
    let minimapPath = [];
    let minimapBounds = {minX:0, maxX:0, minZ:0, maxZ:0, w:1, h:1};
    let hudMessages = [];
    let particles = [];
    let nitroBtn = null;
    
    // Fallback seguro
    const DUMMY_SEG = { curve: 0, y: 0, color: 'light', obs: [], theme: 'grass' };

    function getSegment(index) {
        if (!segments || segments.length === 0) return DUMMY_SEG;
        const len = segments.length;
        const i = ((Math.floor(index) % len) + len) % len;
        return segments[i] || DUMMY_SEG;
    }

    // --- CORREÇÃO 3: MINIMAPA FIEL (SINAL INVERTIDO PARA CORRIGIR DIREÇÃO) ---
    function buildMiniMap(segments) {
        minimapPath = [];
        let x = 0, z = 0, angle = 0;
        segments.forEach(seg => {
            // Ajuste fino do coeficiente para melhorar a precisão visual do traçado
            angle -= seg.curve * 0.04; 
            x += Math.sin(angle) * 8; 
            z -= Math.cos(angle) * 8;
            minimapPath.push({ x, z });
        });

        let minX=Infinity, maxX=-Infinity, minZ=Infinity, maxZ=-Infinity;
        minimapPath.forEach(p => {
            if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x;
            if(p.z < minZ) minZ = p.z; if(p.z > maxZ) maxZ = p.z;
        });
        minimapBounds = { minX, maxX, minZ, maxZ, w: maxX-minX || 1, h: maxZ-minZ || 1 };
    }

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT',
        roomId: 'mario_arena_final_v1',
        selectedChar: 0,
        selectedTrack: 0,
        isReady: false,
        isOnline: false,
        dbRef: null,
        lastSync: 0,

        // Física
        speed: 0, pos: 0, playerX: 0, steer: 0, targetSteer: 0,
        nitro: 100, turboLock: false, gestureTimer: 0,
        spinAngle: 0, spinTimer: 0, lateralInertia: 0, vibration: 0,
        
        lap: 1, totalLaps: 3, rank: 1, score: 0,
        visualTilt: 0, bounce: 0, skyColor: 0,
        inputActive: false, 
        
        virtualWheel: { x:0, y:0, r:60, opacity:0, isHigh: false },
        rivals: [], 

        init: function() { 
            this.cleanup(); 
            this.state = 'MODE_SELECT';
            this.setupUI();
            this.resetPhysics();
            window.System.msg("SELECIONE O MODO");
        },

        cleanup: function() {
            if (this.dbRef) try { this.dbRef.child('players').off(); } catch(e){}
            if(nitroBtn) nitroBtn.remove();
            window.System.canvas.onclick = null;
        },

        resetPhysics: function() {
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.lap = 1; this.score = 0; this.nitro = 100;
            this.spinAngle = 0; this.spinTimer = 0;
            this.lateralInertia = 0; this.vibration = 0;
            this.inputActive = false;
            // Limpeza total para evitar "Cenários Misturados"
            segments = []; minimapPath = [];
            this.rivals = []; particles = []; hudMessages = [];
        },

        pushMsg: function(text, color='#fff', size=40) {
            hudMessages.push({ text, color, size, life: 60, scale: 0.1 });
        },

        setupUI: function() {
            if(nitroBtn) nitroBtn.remove();
            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn-kart';
            nitroBtn.innerHTML = "NITRO";
            Object.assign(nitroBtn.style, {
                position: 'absolute', bottom: '15%', right: '30px', width: '85px', height: '85px',
                borderRadius: '50%', background: 'radial-gradient(#ffcc00, #ff6600)', border: '4px solid #fff',
                color: '#fff', display: 'none', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Russo One', sans-serif", fontWeight: "bold", fontSize: '14px', zIndex: '100',
                cursor: 'pointer', userSelect: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
            });

            const handleNitro = (e) => {
                if(e && e.cancelable) e.preventDefault();
                if(this.state === 'RACE' && this.nitro > 15) {
                    this.turboLock = !this.turboLock;
                    window.Sfx.play(600, 'square', 0.1, 0.1);
                    this.pushMsg(this.turboLock ? "TURBO ON" : "TURBO OFF", "#0ff");
                }
            };
            nitroBtn.addEventListener('mousedown', handleNitro);
            nitroBtn.addEventListener('touchstart', handleNitro);
            document.getElementById('game-ui').appendChild(nitroBtn);

            window.System.canvas.onclick = (e) => {
                const rect = window.System.canvas.getBoundingClientRect();
                const y = (e.clientY - rect.top) / rect.height;
                if (this.state === 'MODE_SELECT') {
                    if (y < 0.5) this.selectMode('OFFLINE'); else this.selectMode('ONLINE');
                    window.Sfx.click();
                } else if (this.state === 'LOBBY') {
                    if (y > 0.7) this.toggleReady();
                    else if (y < 0.35) { this.selectedChar = (this.selectedChar + 1) % CHARACTERS.length; window.Sfx.hover(); }
                    else { this.selectedTrack = (this.selectedTrack + 1) % TRACKS.length; window.Sfx.hover(); }
                    if(this.isOnline) this.syncLobby();
                } else if (this.state === 'GAMEOVER') {
                    // Clique para reiniciar após fim de jogo
                     this.state = 'LOBBY';
                     this.resetPhysics();
                     window.Sfx.click();
                }
            };
        },

        buildTrack: function(trackId) {
            segments = []; // Limpeza crítica (Correção 1)
            const trk = TRACKS[trackId];
            this.skyColor = trk.sky; // Garante cor correta do céu
            const mult = trk.curveMult;
            
            const addRoad = (len, curve) => {
                for(let i=0; i<len; i++) segments.push({ 
                    curve: curve * mult, 
                    color: Math.floor(segments.length / CONF.RUMBLE_LENGTH) % 2 ? 'dark' : 'light',
                    theme: trk.theme, // Força o tema da pista atual
                    obs: []
                });
            };
            
            if (trackId === 0) { // Cogumelo
                addRoad(50, 0); addRoad(40, 2); addRoad(40, 0); addRoad(60, -3); 
                addRoad(40, 0); addRoad(60, 4); addRoad(50, -2); addRoad(80, 0);
            } else if (trackId === 1) { // Deserto
                addRoad(80, 0); addRoad(60, -1); addRoad(40, -4); addRoad(100, 0);
                addRoad(60, 2); addRoad(40, 0); addRoad(30, 5); addRoad(100, 0);
            } else { // Neve
                addRoad(40, 0); addRoad(30, 3); addRoad(30, -3); addRoad(30, 3);
                addRoad(20, -5); addRoad(100, 0); addRoad(50, 2); addRoad(50, 0);
            }

            trackLength = segments.length * CONF.SEGMENT_LENGTH;
            buildMiniMap(segments);
        },

        selectMode: function(mode) {
            this.resetPhysics();
            this.isOnline = (mode === 'ONLINE' && !!window.DB);
            if (!this.isOnline) {
                // Bots iniciais - Ajustados para garantir que corram
                this.rivals = [
                    { id:'cpu1', charId:3, pos: 0, x:-0.6, speed:0, color: CHARACTERS[3].color, name:'Bowser', lap: 1, errorTimer: 0 },
                    { id:'cpu2', charId:4, pos: 0, x:0.6, speed:0, color: CHARACTERS[4].color, name:'Toad', lap: 1, errorTimer: 0 }
                ];
            } else {
                this.connectMultiplayer();
            }
            this.state = 'LOBBY';
        },

        connectMultiplayer: function() {
            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            myRef.set({ name: 'Player', charId: this.selectedChar, ready: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
            myRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', (snap) => {
                const data = snap.val(); if (!data) return;
                const now = Date.now();
                this.rivals = Object.keys(data)
                    .filter(id => id !== window.System.playerId && (now - data[id].lastSeen < 15000))
                    .map(id => ({ id, ...data[id], isRemote: true, color: CHARACTERS[data[id].charId]?.color || '#fff' }));
                if(this.state === 'WAITING' && Object.values(data).every(p => p.ready)) this.startRace(this.selectedTrack);
            });
        },

        toggleReady: function() {
            this.isReady = !this.isReady;
            window.Sfx.click();
            if(!this.isOnline) { this.startRace(this.selectedTrack); return; }
            this.state = this.isReady ? 'WAITING' : 'LOBBY';
            this.syncLobby();
        },

        syncLobby: function() {
            if(this.dbRef) this.dbRef.child('players/' + window.System.playerId).update({
                charId: this.selectedChar, ready: this.isReady, lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        },

        startRace: function(trackId) {
            this.state = 'RACE';
            this.buildTrack(trackId); 
            nitroBtn.style.display = 'flex';
            this.pushMsg("LARGADA!", "#0f0", 60);
            window.Sfx.play(600, 'square', 0.5, 0.2);
            
            // Garante que os rivais comecem do zero na nova pista
            if (!this.isOnline) {
                 this.rivals.forEach(r => { r.pos = 0; r.speed = 0; r.lap = 1; });
            }
        },

        spawnParticle: function(x, y, type) {
            let color = '#fff';
            let vx = (Math.random() - 0.5) * 6;
            let vy = -Math.random() * 4;
            let life = 20;

            if(type === 'smoke') { color = 'rgba(240,240,240,0.6)'; life = 25; vy = -2; } 
            else if(type === 'dust') { color = 'rgba(139,69,19,0.6)'; life = 20; }
            else if(type === 'turbo') { 
                color = (Math.random() > 0.5) ? '#00ffff' : '#ffffff';
                vx = (Math.random() - 0.5) * 3;
                vy = 4 + Math.random() * 4; 
                life = 15; 
            }

            particles.push({ x, y, vx, vy, l: life, maxL: life, c: color });
        },

        update: function(ctx, w, h, pose) {
            if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return; }
            
            this.updatePhysics(w, h, pose);
            this.renderWorld(ctx, w, h);
            this.renderUI(ctx, w, h);
            
            if (this.isOnline) this.syncMultiplayer();
            return Math.floor(this.score);
        },

        syncMultiplayer: function() {
            if (Date.now() - this.lastSync > 100) {
                this.lastSync = Date.now();
                this.dbRef.child('players/' + window.System.playerId).update({
                    pos: Math.floor(this.pos), x: this.playerX, speed: this.speed,
                    steer: this.steer, lap: this.lap, charId: this.selectedChar, lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            }
        },

        updatePhysics: function(w, h, pose) {
            const d = Logic;
            
            // Se o jogo acabou, não atualiza física de movimento
            if (d.state === 'GAMEOVER') return;

            const char = CHARACTERS[this.selectedChar];

            // 1. INPUT E PARADA AUTOMÁTICA
            let detected = false;
            if(pose && pose.keypoints) {
                const map = (pt) => ({ x: (1 - pt.x/640)*w, y: (pt.y/480)*h });
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                const nose = pose.keypoints.find(k => k.name === 'nose');

                if (lw?.score > 0.2 && rw?.score > 0.2) {
                    const pl = map(lw); const pr = map(rw);
                    d.targetSteer = Math.atan2(pr.y - pl.y, pr.x - pl.x) * 3.0;
                    d.virtualWheel = { x: (pl.x+pr.x)/2, y: (pl.y+pr.y)/2, r: Math.hypot(pr.x-pl.x, pr.y-pl.y)/2, opacity: 1 };
                    detected = true;

                    if (nose && lw.y < nose.y && rw.y < nose.y) {
                        d.gestureTimer++;
                        d.virtualWheel.isHigh = true;
                        if (d.gestureTimer > 25 && d.nitro > 20 && !d.turboLock) {
                            d.turboLock = true;
                            d.pushMsg("TURBO GESTURE!", "#0ff");
                            window.Sfx.play(800, 'square', 0.1, 0.1);
                        }
                    } else { d.gestureTimer = 0; d.virtualWheel.isHigh = false; }
                }
            }
            
            d.inputActive = detected; 

            if (!detected) { 
                d.targetSteer = 0; 
                d.virtualWheel.opacity *= 0.9; 
                d.turboLock = false;
            }
            // Suavização do Steer
            d.steer += (d.targetSteer - d.steer) * (PHYSICS.steerSensitivity / Math.sqrt(char.weight));

            // 2. FÍSICA DE TERRENO
            const absX = Math.abs(d.playerX);
            let currentGrip = PHYSICS.gripAsphalt;
            let currentDrag = CONF.FRICTION;
            d.vibration = 0;

            if (absX > 1.45) { 
                currentGrip = PHYSICS.gripOffroad; currentDrag = CONF.OFFROAD_DECEL;
                d.vibration = 5; 
                if(d.speed > 50) d.speed *= 0.98; 
                if(d.speed > 10) this.spawnParticle(w/2 + (Math.random()-0.5)*60, h*0.9, 'dust');
            } else if (absX > 1.0) { 
                currentGrip = PHYSICS.gripZebra; d.vibration = 2;
            }

            // 3. VELOCIDADE E ACELERAÇÃO
            let max = CONF.MAX_SPEED * char.speedInfo;
            if (d.turboLock && d.nitro > 0) { 
                max = CONF.TURBO_MAX_SPEED; d.nitro -= 0.6;
                this.spawnParticle(w/2 - 25, h*0.95, 'turbo');
                this.spawnParticle(w/2 + 25, h*0.95, 'turbo');
            } else { d.nitro = Math.min(100, d.nitro + 0.15); if(d.nitro < 5) d.turboLock = false; }

            const isAccelerating = (d.inputActive || d.turboLock);
            
            if(d.state === 'RACE' && d.spinTimer <= 0 && isAccelerating) {
                d.speed += (max - d.speed) * char.accel;
            } else {
                d.speed *= 0.96; 
            }
            d.speed *= currentDrag;

            const seg = getSegment(d.pos / CONF.SEGMENT_LENGTH);
            const ratio = d.speed / CONF.MAX_SPEED;
            const centrifugal = -(seg.curve * (ratio ** 2)) * PHYSICS.centrifugalForce * char.weight;
            const turnForce = d.steer * char.turnInfo * currentGrip * ratio;

            d.lateralInertia = (d.lateralInertia * PHYSICS.lateralInertiaDecay) + (turnForce + centrifugal) * 0.08;
            d.playerX += d.lateralInertia;

            if(Math.abs(d.lateralInertia) > 0.12 && d.speed > 60 && absX < 1.4) {
                this.spawnParticle(w/2 - 45, h*0.92, 'smoke');
                this.spawnParticle(w/2 + 45, h*0.92, 'smoke');
            }

            // --- CORREÇÃO 2: IA ADVERSÁRIA HUMANIZADA (MODO OFFLINE) ---
            if (d.state === 'RACE' && !d.isOnline) {
                d.rivals.forEach(r => {
                    const rChar = CHARACTERS[r.charId];
                    const rSeg = getSegment((r.pos + 300) / CONF.SEGMENT_LENGTH); // Olha à frente

                    // Controle de erro (IA comete erros humanos)
                    if (Math.random() < 0.01) r.errorTimer = 20;
                    if (r.errorTimer > 0) {
                        r.errorTimer--;
                        r.x += (Math.random() - 0.5) * 0.15; // Variação instável
                    } else {
                        // Comportamento normal
                        const targetSpeed = (CONF.MAX_SPEED * rChar.speedInfo) - (Math.abs(rSeg.curve) * 15); 
                        
                        // CORREÇÃO IA PARADA: Launch Control / Boost inicial se estiver muito lento
                        if (r.speed < 50 && r.pos < 2000) r.speed += rChar.accel * 3; // Arrancada forte
                        else if (r.speed < targetSpeed) r.speed += rChar.accel * 0.85;
                        
                        // Traçado ideal (Ligeiramente fora do centro nas curvas)
                        const idealX = -(rSeg.curve * 0.45); 
                        r.x += (idealX - r.x) * 0.07;
                        
                        // Agressividade (Fecha o player)
                        if (Math.abs(r.pos - d.pos) < 200 && Math.abs(r.x - d.playerX) < 1.5) {
                           r.x += (d.playerX - r.x) * 0.02; 
                        }
                    }
                    
                    r.speed *= 0.99;
                    r.x = Math.max(-1.8, Math.min(1.8, r.x)); // Limites

                    // Colisão simples IA
                    d.rivals.forEach(other => {
                        if (r !== other && Math.abs(r.pos - other.pos) < 100 && Math.abs(r.x - other.x) < 0.8) {
                            if (r.x < other.x) r.x -= 0.05; else r.x += 0.05;
                        }
                    });

                    r.pos += r.speed;
                    if (r.pos >= trackLength) { r.pos -= trackLength; r.lap++; }
                });
            }

            // 4. SPIN E COLISÃO
            if (d.spinTimer > 0) { d.spinTimer--; d.spinAngle += 0.4; d.speed *= 0.95; }
            else if (absX > 1.5 && ratio > 0.82 && Math.abs(d.lateralInertia) > 0.15) {
                d.spinTimer = 45; window.Sfx.play(200, 'sawtooth', 0.2, 0.1); d.pushMsg("DERRAPOU!");
            }

            d.rivals.forEach(r => {
                let dZ = Math.abs(r.pos - d.pos); let dX = Math.abs(r.x - d.playerX);
                if (Math.abs((r.pos - trackLength) - d.pos) < 160) dZ = Math.abs((r.pos - trackLength) - d.pos);
                if (Math.abs(r.pos - (d.pos - trackLength)) < 160) dZ = Math.abs(r.pos - (d.pos - trackLength));

                if (dZ < 160 && dX < 0.7) {
                    const rChar = CHARACTERS[r.charId] || char;
                    d.lateralInertia += (d.playerX > r.x ? 0.18 : -0.18) * (rChar.weight / char.weight);
                    d.speed *= 0.88; window.Sfx.crash();
                }
            });

            // 5. RANKING
            let ahead = 0;
            d.rivals.forEach(r => {
                if(!r.lap) r.lap = 1;
                const rDist = r.lap * trackLength + r.pos;
                const pDist = d.lap * trackLength + d.pos;
                if(rDist > pDist) ahead++;
            });
            d.rank = ahead + 1;

            d.playerX = Math.max(-3.5, Math.min(3.5, d.playerX));
            d.pos += d.speed;

            // --- CORREÇÃO FINALIZAÇÃO DE CORRIDA ---
            if (d.pos >= trackLength) { 
                d.pos -= trackLength; 
                d.lap++; 
                if (d.lap > d.totalLaps) {
                    d.lap = d.totalLaps;
                    d.state = 'GAMEOVER';
                    window.Sfx.play(1000, 'sine', 1, 0.5);
                    this.pushMsg(d.rank === 1 ? "VITÓRIA!" : "FIM DE JOGO", "#ff0", 80);
                    nitroBtn.style.display = 'none';
                } else {
                    this.pushMsg(`VOLTA ${d.lap}/${d.totalLaps}`, "#fff", 60); 
                }
            }
            
            // --- CORREÇÃO 4: KART TOMBANDO E NÃO VIRANDO ---
            const targetTilt = (d.steer * 8) + (d.spinAngle * 10); 
            d.visualTilt += (targetTilt - d.visualTilt) * 0.15; 
            d.visualTilt = Math.max(-12, Math.min(12, d.visualTilt)); 

            d.bounce = (Math.random() - 0.5) * d.vibration;
            d.score += d.speed * 0.01;

            particles.forEach((p, i) => {
                p.x += p.vx; p.y += p.vy; p.l--;
                if(p.l <= 0) particles.splice(i, 1);
            });
        },

        // =================================================================
        // RENDERIZAÇÃO
        // =================================================================

        renderWorld: function(ctx, w, h) {
            const d = Logic; const cx = w / 2; const horizon = h * 0.40 + d.bounce;
            const currentSegIndex = Math.floor(d.pos / CONF.SEGMENT_LENGTH);
            const isOffRoad = Math.abs(d.playerX) > 1.2;

            // Céu
            const skyGrads = [['#3388ff', '#88ccff'], ['#e67e22', '#f1c40f'], ['#0984e3', '#74b9ff']];
            const currentSky = skyGrads[this.skyColor] || skyGrads[0];
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, currentSky[0]); gradSky.addColorStop(1, currentSky[1]);
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // Montanhas
            const bgOffset = (getSegment(currentSegIndex).curve * 30) + (d.steer * 20);
            ctx.fillStyle = this.skyColor === 0 ? '#44aa44' : (this.skyColor===1 ? '#d35400' : '#fff'); 
            ctx.beginPath(); ctx.moveTo(0, horizon);
            for(let i=0; i<=12; i++) { ctx.lineTo((w/12 * i) - (bgOffset * 0.5), horizon - 50 - Math.abs(Math.sin(i + d.pos*0.0001))*40); }
            ctx.lineTo(w, horizon); ctx.fill();

            // Correção 1: Garantia do tema correto (Mistura de Cenários)
            // Usa o tema global da pista selecionada para o chão infinito, ignorando bugs de segmentação
            const themes = { 'grass': ['#55aa44', '#448833'], 'sand':  ['#f1c40f', '#e67e22'], 'snow':  ['#ffffff', '#dfe6e9'] };
            const globalThemeName = TRACKS[d.selectedTrack].theme; // Força o tema da pista inteira
            const theme = themes[globalThemeName] || themes['grass']; 
            
            ctx.fillStyle = isOffRoad ? '#336622' : theme[1]; ctx.fillRect(0, horizon, w, h-horizon);

            let dx = 0; let camX = d.playerX * (w * 0.4);
            let segmentCoords = [];

            for(let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const seg = getSegment(currentSegIndex + n);
                dx += (seg.curve * 0.8);
                const scale = 1 / (1 + (n * 20 * 0.05));
                const nextScale = 1 / (1 + ((n+1) * 20 * 0.05));
                const sy = horizon + ((h - horizon) * scale);
                const nsy = horizon + ((h - horizon) * nextScale);
                const sx = cx - (camX * scale) - (dx * n * 20 * scale * 2);
                const nsx = cx - (camX * nextScale) - ((dx + seg.curve*0.8) * (n+1) * 20 * nextScale * 2);
                
                segmentCoords.push({ x: sx, y: sy, scale });

                // CORREÇÃO CENÁRIOS MISTURADOS: Força o tema global em todos os segmentos
                const drawTheme = theme; 
                
                ctx.fillStyle = (seg.color === 'dark') ? (isOffRoad?'#336622':drawTheme[1]) : (isOffRoad?'#336622':drawTheme[0]);
                ctx.fillRect(0, nsy, w, sy - nsy);
                
                ctx.fillStyle = (seg.color === 'dark') ? '#f33' : '#fff'; 
                ctx.beginPath(); 
                ctx.moveTo(sx - (w*3*scale)*0.6, sy); ctx.lineTo(sx + (w*3*scale)*0.6, sy); 
                ctx.lineTo(nsx + (w*3*nextScale)*0.6, nsy); ctx.lineTo(nsx - (w*3*nextScale)*0.6, nsy); 
                ctx.fill();
                
                ctx.fillStyle = (seg.color === 'dark') ? '#444' : '#494949'; 
                ctx.beginPath(); ctx.moveTo(sx - (w*3*scale)*0.5, sy); ctx.lineTo(sx + (w*3*scale)*0.5, sy); 
                ctx.lineTo(nsx + (w*3*nextScale)*0.5, nsy); ctx.lineTo(nsx - (w*3*nextScale)*0.5, nsy); ctx.fill();
            }

            // Renderiza Rivais
            for(let n = CONF.DRAW_DISTANCE - 1; n >= 0; n--) {
                const coord = segmentCoords[n]; if(!coord) continue;
                d.rivals.forEach(r => {
                    let relPos = r.pos - d.pos; if(relPos < -trackLength/2) relPos += trackLength;
                    if (Math.abs(Math.floor(relPos / CONF.SEGMENT_LENGTH) - n) < 2.0 && n > 0) {
                        this.drawKartSprite(ctx, coord.x + (r.x * (w*1.5) * coord.scale), coord.y, w*0.0055*coord.scale, 0, 0, 0, r.color, r.charId);
                    }
                });
            }

            particles.forEach(p => {
                ctx.fillStyle = p.c; ctx.globalAlpha = p.l / p.maxL;
                ctx.beginPath(); ctx.arc(p.x, p.y, 4 + (p.maxL - p.l)*0.5, 0, Math.PI*2); ctx.fill();
            }); ctx.globalAlpha = 1;

            this.drawKartSprite(ctx, cx, h*0.85 + d.bounce, w * 0.0055, d.steer, d.visualTilt, d.spinAngle, CHARACTERS[d.selectedChar].color, d.selectedChar);
        },

        drawKartSprite: function(ctx, cx, y, carScale, steer, tilt, spinAngle, color, charId) {
            ctx.save(); ctx.translate(cx, y); ctx.scale(carScale, carScale); 
            
            // Correção 4: Ajuste do pivô para não parecer que está capotando
            ctx.rotate(tilt * 0.03 + spinAngle); 
            
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 35, 60, 15, 0, 0, Math.PI*2); ctx.fill();
            
            const stats = CHARACTERS[charId] || CHARACTERS[0];
            const gradBody = ctx.createLinearGradient(-30, 0, 30, 0); 
            gradBody.addColorStop(0, color); gradBody.addColorStop(0.5, '#fff'); gradBody.addColorStop(1, color);
            ctx.fillStyle = gradBody; 
            ctx.beginPath(); ctx.moveTo(-25, -30); ctx.lineTo(25, -30); ctx.lineTo(40, 10); ctx.lineTo(10, 35); ctx.lineTo(-10, 35); ctx.lineTo(-40, 10); ctx.fill();
            
            const dw = (wx, wy) => { 
                ctx.save(); ctx.translate(wx, wy); ctx.rotate(steer * 0.8); 
