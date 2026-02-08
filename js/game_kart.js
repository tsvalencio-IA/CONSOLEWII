// =============================================================================
// KART LEGENDS: MARIO GP EDITION (FINAL GOLD MASTER)
// ARQUITETO: SENIOR DEV (CODE 177)
// PATCH: HOST AUTHORITY, SECURE LAPS, GLOBAL SYNC, SCALABLE MULTIPLAYER
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
        { id: 4, name: 'TOAD',   color: '#3498db', hat: '#ecf0f1', speedInfo: 0.90, turnInfo: 1.25, weight: 0.6, accel: 0.070 },
        { id: 5, name: 'YOSHI',  color: '#76ff03', hat: '#64dd17', speedInfo: 1.02, turnInfo: 1.10, weight: 0.9, accel: 0.045 },
        { id: 6, name: 'DK',     color: '#795548', hat: '#5d4037', speedInfo: 1.08, turnInfo: 0.80, weight: 1.6, accel: 0.030 },
        { id: 7, name: 'WARIO',  color: '#ffeb3b', hat: '#fbc02d', speedInfo: 1.06, turnInfo: 0.85, weight: 1.5, accel: 0.032 }
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
        RUMBLE_LENGTH: 3,
        TOTAL_LAPS: 3
    };

    const PHYSICS = {
        gripAsphalt: 0.98,
        gripZebra: 0.85,
        gripOffroad: 0.35,
        centrifugalForce: 0.22,
        momentumTransfer: 1.6,
        steerSensitivity: 0.10,
        lateralInertiaDecay: 0.95
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

    function buildMiniMap(segments) {
        minimapPath = [];
        let x = 0, z = 0, angle = 0;
        segments.forEach(seg => {
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
        state: 'MODE_SELECT', // MODE_SELECT, LOBBY, RACE, SPECTATE, GAMEOVER
        roomId: 'mario_arena_pro_vFinal',
        selectedChar: 0,
        selectedTrack: 0,
        isReady: false,
        isOnline: false,
        isHost: false,
        dbRef: null,
        roomRef: null,
        lastSync: 0,
        
        // Dados brutos dos outros jogadores para lógica de host
        remotePlayersData: {},

        // Física e Estado Local
        speed: 0, pos: 0, playerX: 0, steer: 0, targetSteer: 0,
        nitro: 100, turboLock: false, gestureTimer: 0,
        spinAngle: 0, spinTimer: 0, lateralInertia: 0, vibration: 0,
        
        // Corrida
        lap: 1, 
        maxLapPos: 0, // Checkpoint interno para validar volta
        status: 'RACING', // RACING, FINISHED
        finishTime: 0,
        finalRank: 0,
        
        score: 0,
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
            if (this.roomRef) try { this.roomRef.off(); } catch(e){}
            if(nitroBtn) nitroBtn.remove();
            window.System.canvas.onclick = null;
        },

        resetPhysics: function() {
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.lap = 1; this.maxLapPos = 0;
            this.status = 'RACING'; this.finishTime = 0; this.finalRank = 0;
            this.score = 0; this.nitro = 100;
            this.spinAngle = 0; this.spinTimer = 0;
            this.lateralInertia = 0; this.vibration = 0;
            this.inputActive = false;
            
            this.rivals = []; particles = []; hudMessages = [];
            this.remotePlayersData = {};
        },

        pushMsg: function(text, color='#fff', size=40) {
            hudMessages.push({ text, color, size, life: 90, scale: 0.1 });
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
                if((this.state === 'RACE') && this.nitro > 15) {
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
                    if (y > 0.7) {
                        this.toggleReady();
                    }
                    else if (y < 0.35) { 
                        this.selectedChar = (this.selectedChar + 1) % CHARACTERS.length; 
                        window.Sfx.hover(); 
                        if(this.isOnline) this.syncLobby();
                    }
                    else { 
                        // Apenas Host muda a pista
                        if(!this.isOnline || this.isHost) {
                            this.selectedTrack = (this.selectedTrack + 1) % TRACKS.length; 
                            window.Sfx.hover(); 
                            if(this.isOnline && this.isHost) this.roomRef.update({ trackId: this.selectedTrack });
                        }
                    }
                } else if (this.state === 'GAMEOVER') {
                     this.state = 'LOBBY';
                     this.isReady = false;
                     this.resetPhysics();
                     if(this.isOnline) {
                         this.syncLobby();
                         if(this.isHost && this.roomRef) {
                             this.roomRef.update({ raceState: 'LOBBY' });
                         }
                     }
                     window.Sfx.click();
                }
            };
        },

        buildTrack: function(trackId) {
            segments = [];
            const trk = TRACKS[trackId];
            this.skyColor = trk.sky;
            const mult = trk.curveMult;
            
            const addRoad = (len, curve) => {
                for(let i=0; i<len; i++) segments.push({ 
                    curve: curve * mult, 
                    color: Math.floor(segments.length / CONF.RUMBLE_LENGTH) % 2 ? 'dark' : 'light',
                    theme: trk.theme,
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
                // Bots Offline - Simulação local
                this.rivals = [
                    { id:'cpu1', charId:3, pos: 0, x:-0.6, speed:0, color: CHARACTERS[3].color, name:'Bowser', lap: 1, status:'RACING', finishTime:0, errorTimer: 0 },
                    { id:'cpu2', charId:4, pos: 0, x:0.6, speed:0, color: CHARACTERS[4].color, name:'Toad', lap: 1, status:'RACING', finishTime:0, errorTimer: 0 },
                    { id:'cpu3', charId:6, pos: 0, x:-0.3, speed:0, color: CHARACTERS[6].color, name:'DK', lap: 1, status:'RACING', finishTime:0, errorTimer: 0 },
                    { id:'cpu4', charId:7, pos: 0, x:0.3, speed:0, color: CHARACTERS[7].color, name:'Wario', lap: 1, status:'RACING', finishTime:0, errorTimer: 0 }
                ];
            } else {
                this.connectMultiplayer();
            }
            this.state = 'LOBBY';
        },

        connectMultiplayer: function() {
            this.roomRef = window.DB.ref('rooms/' + this.roomId);
            this.dbRef = this.roomRef;
            
            // Registra jogador
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            myRef.set({ 
                name: 'Player', charId: this.selectedChar, ready: false, 
                lastSeen: firebase.database.ServerValue.TIMESTAMP,
                status: 'LOBBY',
                pos: 0, lap: 1, finishTime: 0
            });
            myRef.onDisconnect().remove();

            // Sincronização de Estado da Sala (Host Authority para Game Over/Start)
            this.roomRef.child('raceState').on('value', (snap) => {
                const globalState = snap.val();
                
                // Start
                if(globalState === 'RACING' && (this.state === 'LOBBY' || this.state === 'WAITING')) {
                    this.roomRef.child('trackId').once('value').then(tSnap => {
                        const tId = tSnap.val() || 0;
                        this.startRace(tId);
                    });
                }
                
                // Global Game Over (Patch 3)
                if(globalState === 'GAMEOVER' && (this.state === 'RACE' || this.state === 'SPECTATE')) {
                    this.state = 'GAMEOVER';
                    window.Sfx.play(1000, 'sine', 1, 0.5);
                }
                
                // Reset to Lobby
                if(globalState === 'LOBBY' && this.state === 'GAMEOVER') {
                    this.state = 'LOBBY';
                    this.resetPhysics();
                }
            });
            
            // Sincronização de Pista no Lobby
            this.roomRef.child('trackId').on('value', (snap) => {
                if(snap.exists() && !this.isHost) {
                    this.selectedTrack = snap.val();
                }
            });

            // Sincronização de Jogadores e Determinação de Host
            this.dbRef.child('players').on('value', (snap) => {
                const data = snap.val(); if (!data) return;
                this.remotePlayersData = data; // Armazena dados brutos para lógica do host
                const now = Date.now();
                const ids = Object.keys(data).sort(); 

                // Lógica de Host: O ID mais antigo (menor string) é o host
                if (ids[0] === window.System.playerId) {
                    this.isHost = true;
                    if(this.state === 'LOBBY') {
                        // Garante que a pista no DB é a que o host vê
                        this.roomRef.update({ trackId: this.selectedTrack });
                    }
                } else {
                    this.isHost = false;
                }

                // Patch 5: Sincronização correta de CharID e filtragem de inativos
                this.rivals = ids
                    .filter(id => id !== window.System.playerId && (now - data[id].lastSeen < 15000))
                    .map(id => ({ 
                        id, 
                        ...data[id], 
                        isRemote: true, 
                        color: CHARACTERS[data[id].charId]?.color || '#fff' 
                    }));

                // Auto-Start pelo Host se todos estiverem prontos
                if(this.isHost && this.state === 'WAITING') {
                    const allReady = Object.values(data).every(p => p.ready);
                    const playerCount = Object.keys(data).length;
                    if(allReady && playerCount >= 2) { 
                        this.roomRef.update({ raceState: 'RACING' });
                    }
                }
            });
        },

        toggleReady: function() {
            this.isReady = !this.isReady;
            window.Sfx.click();
            if(!this.isOnline) { 
                this.startRace(this.selectedTrack); 
                return; 
            }
            this.state = this.isReady ? 'WAITING' : 'LOBBY';
            this.syncLobby();
        },

        syncLobby: function() {
            if(this.dbRef) {
                const updates = {
                    charId: this.selectedChar, 
                    ready: this.isReady, 
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                };
                this.dbRef.child('players/' + window.System.playerId).update(updates);
            }
        },

        startRace: function(trackId) {
            this.state = 'RACE';
            this.status = 'RACING';
            this.buildTrack(trackId); 
            nitroBtn.style.display = 'flex';
            this.pushMsg("LARGADA!", "#0f0", 60);
            window.Sfx.play(600, 'square', 0.5, 0.2);
            
            // Reset local crítico
            this.pos = 0; this.lap = 1; this.maxLapPos = 0; this.speed = 0; this.finishTime = 0;
            
            if (!this.isOnline) {
                 this.rivals.forEach(r => { r.pos = 0; r.speed = 0; r.lap = 1; r.status = 'RACING'; r.finishTime = 0; });
            }
        },

        update: function(ctx, w, h, pose) {
            if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return; }
            
            // Se estado é GAMEOVER (global), renderiza tela final
            if (this.state === 'GAMEOVER') {
                this.checkRaceStatus(); // Mantém o ranking atualizado caso chegue update atrasado
                this.renderWorld(ctx, w, h); 
                this.renderUI(ctx, w, h);
                return;
            }

            this.updatePhysics(w, h, pose);
            this.checkRaceStatus();
            this.renderWorld(ctx, w, h);
            this.renderUI(ctx, w, h);
            
            if (this.isOnline) this.syncMultiplayer();
            return Math.floor(this.score);
        },

        syncMultiplayer: function() {
            // Patch 1 & 4: Sincronia de progresso e Status para cálculo do Host
            if (Date.now() - this.lastSync > 100) {
                this.lastSync = Date.now();
                this.dbRef.child('players/' + window.System.playerId).update({
                    pos: Math.floor(this.pos), 
                    x: this.playerX, 
                    speed: this.speed,
                    steer: this.steer, 
                    lap: this.lap, 
                    status: this.status, 
                    finishTime: this.finishTime,
                    charId: this.selectedChar, 
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            }
        },

        // --- CORE: LÓGICA DE CLASSIFICAÇÃO NINTENDO (PATCH 1, 3, 4) ---
        checkRaceStatus: function() {
            // Lista consolidada de todos os pilotos
            const allRacers = [
                { id: 'me', lap: this.lap, pos: this.pos, status: this.status, finishTime: this.finishTime, name: CHARACTERS[this.selectedChar].name },
                ...this.rivals.map(r => ({ 
                    id: r.id, 
                    lap: r.lap || 1, 
                    pos: r.pos || 0, 
                    status: r.status || 'RACING', 
                    finishTime: r.finishTime || 0,
                    name: r.name || 'P' + r.id
                }))
            ];

            // Patch 4: Critério de Ordenação Robusto
            // 1. Status 'FINISHED' vem primeiro
            // 2. Se ambos FINISHED, menor finishTime vence
            // 3. Se ambos RACING, maior distância total vence (Lap * TamanhoPista + Posição)
            allRacers.sort((a, b) => {
                const aFinished = a.status === 'FINISHED';
                const bFinished = b.status === 'FINISHED';

                if (aFinished && bFinished) return (a.finishTime || 0) - (b.finishTime || 0);
                if (aFinished) return -1;
                if (bFinished) return 1;

                const distA = (a.lap * 100000) + a.pos;
                const distB = (b.lap * 100000) + b.pos;
                return distB - distA; // Decrescente
            });

            // Atualiza ranking local
            const myRankIndex = allRacers.findIndex(r => r.id === 'me');
            this.finalRank = myRankIndex + 1;

            // --- LÓGICA DO HOST PARA ENCERRAR A CORRIDA (PATCH 1 & 3) ---
            if (this.isOnline && this.isHost && this.state !== 'GAMEOVER') {
                const totalPlayers = Object.keys(this.remotePlayersData).length;
                
                // Verifica se todos no banco de dados estão FINISHED
                let finishedCount = 0;
                let activeCount = 0;
                
                for(let pid in this.remotePlayersData) {
                    // Ignora jogadores muito antigos (desconectados)
                    if(Date.now() - this.remotePlayersData[pid].lastSeen < 15000) {
                        activeCount++;
                        if(this.remotePlayersData[pid].status === 'FINISHED') finishedCount++;
                    }
                }

                // Se todos os ativos terminaram, Host decreta Game Over Global
                if (finishedCount >= activeCount && activeCount > 0) {
                    this.roomRef.update({ raceState: 'GAMEOVER' });
                }
            } else if (!this.isOnline && this.state !== 'GAMEOVER') {
                // Modo Offline: Verifica se todos os bots terminaram
                const finishedCount = allRacers.filter(r => r.status === 'FINISHED').length;
                const totalCount = allRacers.length;
                
                if (finishedCount === totalCount) {
                     setTimeout(() => {
                         this.state = 'GAMEOVER';
                         window.Sfx.play(1000, 'sine', 1, 0.5);
                     }, 1500);
                }
            }
        },

        updatePhysics: function(w, h, pose) {
            const d = Logic;
            const char = CHARACTERS[this.selectedChar];
            const canControl = (d.status === 'RACING');

            // 1. INPUT
            let detected = false;
            if(canControl && pose && pose.keypoints) {
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
                            d.pushMsg("TURBO ON!", "#0ff");
                            window.Sfx.play(800, 'square', 0.1, 0.1);
                        }
                    } else { d.gestureTimer = 0; d.virtualWheel.isHigh = false; }
                }
            }
            d.inputActive = detected; 
            if (!detected) { d.targetSteer = 0; d.virtualWheel.opacity *= 0.9; d.turboLock = false; }
            d.steer += (d.targetSteer - d.steer) * (PHYSICS.steerSensitivity / Math.sqrt(char.weight));

            // 2. TERRENO E FÍSICA
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

            // 3. MOVIMENTO
            let max = CONF.MAX_SPEED * char.speedInfo;
            if (d.turboLock && d.nitro > 0) { 
                max = CONF.TURBO_MAX_SPEED; d.nitro -= 0.6;
                this.spawnParticle(w/2 - 25, h*0.95, 'turbo');
                this.spawnParticle(w/2 + 25, h*0.95, 'turbo');
            } else { d.nitro = Math.min(100, d.nitro + 0.15); if(d.nitro < 5) d.turboLock = false; }

            const isAccelerating = (d.inputActive || d.turboLock);
            if(d.status === 'RACING' && d.spinTimer <= 0 && isAccelerating) {
                d.speed += (max - d.speed) * char.accel;
            } else {
                d.speed *= 0.96; 
            }
            d.speed *= currentDrag;

            const seg = getSegment(d.pos / CONF.SEGMENT_LENGTH);
            const ratio = d.speed / CONF.MAX_SPEED;
            const centrifugal = -(seg.curve * (ratio ** 2)) * PHYSICS.centrifugalForce * char.weight;
            const turnForce = d.steer * char.turnInfo * currentGrip * ratio;

            d.lateralInertia = (d.lateralInertia * PHYSICS.lateralInertiaDecay) + (turnForce) * 0.08;
            d.playerX += d.lateralInertia;

            if(Math.abs(d.lateralInertia) > 0.12 && d.speed > 60 && absX < 1.4) {
                this.spawnParticle(w/2 - 45, h*0.92, 'smoke');
                this.spawnParticle(w/2 + 45, h*0.92, 'smoke');
            }

            // 4. IA (Offline Only)
            if (!d.isOnline && d.state !== 'GAMEOVER') {
                d.rivals.forEach(r => {
                    if (r.status === 'FINISHED') return;
                    const rChar = CHARACTERS[r.charId];
                    const rSeg = getSegment((r.pos + 300) / CONF.SEGMENT_LENGTH); 
                    if (Math.random() < 0.01) r.errorTimer = 20;
                    if (r.errorTimer > 0) { r.errorTimer--; r.x += (Math.random() - 0.5) * 0.15; } 
                    else {
                        const targetSpeed = (CONF.MAX_SPEED * rChar.speedInfo) - (Math.abs(rSeg.curve) * 8); 
                        if (r.speed < 50 && r.pos < 6000) r.speed += rChar.accel * 3; 
                        else if (r.speed < targetSpeed) r.speed += rChar.accel * 0.85;
                        const idealX = -(rSeg.curve * 0.35); r.x += (idealX - r.x) * 0.07;
                    }
                    r.speed *= 0.995; r.x = Math.max(-1.8, Math.min(1.8, r.x)); r.pos += r.speed;

                    // Lógica de Volta IA
                    if (r.pos >= trackLength) { 
                        r.pos -= trackLength; r.lap++; 
                        if (r.lap > CONF.TOTAL_LAPS) {
                            r.status = 'FINISHED'; r.finishTime = Date.now(); r.speed = 0; r.lap = CONF.TOTAL_LAPS;
                        }
                    }
                });
            }

            // 5. COLISÃO E SPIN
            if (d.spinTimer > 0) { d.spinTimer--; d.spinAngle += 0.4; d.speed *= 0.95; }
            else if (absX > 1.5 && ratio > 0.82 && Math.abs(d.lateralInertia) > 0.15) {
                d.spinTimer = 45; window.Sfx.play(200, 'sawtooth', 0.2, 0.1); d.pushMsg("DERRAPOU!");
            }

            d.rivals.forEach(r => {
                let dZ = Math.abs(r.pos - d.pos); let dX = Math.abs(r.x - d.playerX);
                if (Math.abs((r.pos - trackLength) - d.pos) < 160) dZ = Math.abs((r.pos - trackLength) - d.pos);
                if (Math.abs(r.pos - (d.pos - trackLength)) < 160) dZ = Math.abs(r.pos - (d.pos - trackLength));
                if (dZ < 160 && dX < 0.7 && r.status === 'RACING' && d.status === 'RACING') {
                    const rChar = CHARACTERS[r.charId] || char;
                    d.lateralInertia += (d.playerX > r.x ? 0.18 : -0.18) * (rChar.weight / char.weight);
                    d.speed *= 0.88; window.Sfx.crash();
                }
            });

            d.playerX = Math.max(-3.5, Math.min(3.5, d.playerX));
            d.pos += d.speed;
            
            // PATCH 2: CONTROLE REAL DE VOLTAS (CHECKPOINT OBRIGATÓRIO)
            if (d.pos > trackLength * 0.60 && d.pos < trackLength * 0.95) {
                d.maxLapPos = Math.max(d.maxLapPos, d.pos);
            }

            // VOLTA COMPLETA (Validada)
            if (d.pos >= trackLength) { 
                // Se passou pelo checkpoint interno (70% da pista)
                if (d.maxLapPos > trackLength * 0.70) {
                    d.pos -= trackLength;
                    d.lap++; 
                    d.maxLapPos = 0; // Reseta checkpoint para nova volta
                    
                    if (d.lap > CONF.TOTAL_LAPS) {
                        // FINAL DE CORRIDA INDIVIDUAL
                        d.lap = CONF.TOTAL_LAPS;
                        d.status = 'FINISHED';
                        d.state = 'SPECTATE';
                        d.finishTime = Date.now(); // Marca tempo local
                        d.speed = 0;
                        window.Sfx.play(1000, 'sine', 1, 0.5);
                        this.pushMsg("FINALIZADO!", "#ff0", 80);
                        nitroBtn.style.display = 'none';
                        // Sincroniza imediatamente o estado FINISHED
                        if(this.isOnline) this.syncMultiplayer();
                    } else {
                        window.Sfx.play(700, 'square', 0.3, 0.1);
                        this.pushMsg(`VOLTA ${d.lap}/${CONF.TOTAL_LAPS}`, "#fff", 60); 
                    }
                } else {
                    // Volta Falsa: Jogador tentou recuar na linha de chegada ou glitch
                    d.pos = trackLength - 1; // Mantém antes da linha
                    d.speed = 0; // Penalidade
                    this.pushMsg("SENTIDO ERRADO!", "#f00");
                }
            }
            
            const targetTilt = (d.steer * 8); 
            d.visualTilt += (targetTilt - d.visualTilt) * 0.15; 
            d.visualTilt = Math.max(-12, Math.min(12, d.visualTilt)); 
            d.bounce = (Math.random() - 0.5) * d.vibration;
            d.score += d.speed * 0.01;

            particles.forEach((p, i) => {
                p.x += p.vx; p.y += p.vy; p.l--;
                if(p.l <= 0) particles.splice(i, 1);
            });
        },

        spawnParticle: function(x, y, type) {
            if(Math.random() > 0.5) return;
            particles.push({ 
                x, y, 
                vx: (Math.random()-0.5)*4, vy: (Math.random())*4, 
                l: 20, maxL: 20, 
                c: type==='turbo'?'#ffaa00':(type==='dust'?'#95a5a6':'#ecf0f1') 
            });
        },

        // =================================================================
        // RENDERIZAÇÃO
        // =================================================================
        renderWorld: function(ctx, w, h) {
            const d = Logic; const cx = w / 2; const horizon = h * 0.40 + d.bounce;
            const currentSegIndex = Math.floor(d.pos / CONF.SEGMENT_LENGTH);
            const isOffRoad = Math.abs(d.playerX) > 1.2;
            const skyGrads = [['#3388ff', '#88ccff'], ['#e67e22', '#f1c40f'], ['#0984e3', '#74b9ff']];
            const currentSky = skyGrads[this.skyColor] || skyGrads[0];
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, currentSky[0]); gradSky.addColorStop(1, currentSky[1]);
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            const bgOffset = (getSegment(currentSegIndex).curve * 30) + (d.steer * 20);
            ctx.fillStyle = this.skyColor === 0 ? '#44aa44' : (this.skyColor===1 ? '#d35400' : '#fff'); 
            ctx.beginPath(); ctx.moveTo(0, horizon);
            for(let i=0; i<=12; i++) { ctx.lineTo((w/12 * i) - (bgOffset * 0.5), horizon - 50 - Math.abs(Math.sin(i + d.pos*0.0001))*40); }
            ctx.lineTo(w, horizon); ctx.fill();

            const themes = { 'grass': ['#55aa44', '#448833'], 'sand':  ['#f1c40f', '#e67e22'], 'snow':  ['#ffffff', '#dfe6e9'] };
            const globalThemeName = TRACKS[d.selectedTrack].theme; 
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

                ctx.fillStyle = (seg.color === 'dark') ? (isOffRoad?'#336622':theme[1]) : (isOffRoad?'#336622':theme[0]);
                ctx.fillRect(0, nsy, w, sy - nsy);
                ctx.fillStyle = (seg.color === 'dark') ? '#f33' : '#fff'; 
                ctx.beginPath(); ctx.moveTo(sx - (w*3*scale)*0.6, sy); ctx.lineTo(sx + (w*3*scale)*0.6, sy); 
                ctx.lineTo(nsx + (w*3*nextScale)*0.6, nsy); ctx.lineTo(nsx - (w*3*nextScale)*0.6, nsy); ctx.fill();
                ctx.fillStyle = (seg.color === 'dark') ? '#444' : '#494949'; 
                ctx.beginPath(); ctx.moveTo(sx - (w*3*scale)*0.5, sy); ctx.lineTo(sx + (w*3*scale)*0.5, sy); 
                ctx.lineTo(nsx + (w*3*nextScale)*0.5, nsy); ctx.lineTo(nsx - (w*3*nextScale)*0.5, nsy); ctx.fill();
            }

            for(let n = CONF.DRAW_DISTANCE - 1; n >= 0; n--) {
                const coord = segmentCoords[n]; if(!coord) continue;
                d.rivals.forEach(r => {
                    let relPos = r.pos - d.pos; if(relPos < -trackLength/2) relPos += trackLength;
                    if (Math.abs(Math.floor(relPos / CONF.SEGMENT_LENGTH) - n) < 2.0 && n > 0) {
                        this.drawKartSprite(ctx, coord.x + (r.x * (w*1.5) * coord.scale), coord.y, w*0.0055*coord.scale, 0, 0, 0, r.color, r.charId);
                        if (r.status === 'FINISHED') {
                            ctx.fillStyle = "#ff0"; ctx.font = `bold ${20*coord.scale}px Arial`;
                            ctx.fillText("🏁", coord.x + (r.x * (w*1.5) * coord.scale), coord.y - 80*coord.scale);
                        }
                    }
                });
            }

            particles.forEach(p => {
                ctx.fillStyle = p.c; ctx.globalAlpha = p.l / p.maxL;
                ctx.beginPath(); ctx.arc(p.x, p.y, 4 + (p.maxL - p.l)*0.5, 0, Math.PI*2); ctx.fill();
            }); ctx.globalAlpha = 1;

            if (d.state !== 'SPECTATE') {
                this.drawKartSprite(ctx, cx, h*0.85 + d.bounce, w * 0.0055, d.steer, d.visualTilt, d.spinAngle, CHARACTERS[d.selectedChar].color, d.selectedChar);
            }
        },

        drawKartSprite: function(ctx, cx, y, carScale, steer, tilt, spinAngle, color, charId) {
            ctx.save(); ctx.translate(cx, y); ctx.scale(carScale, carScale); 
            ctx.rotate(tilt * 0.03 + spinAngle); 
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 35, 60, 15, 0, 0, Math.PI*2); ctx.fill();
            
            const stats = CHARACTERS[charId] || CHARACTERS[0];
            const gradBody = ctx.createLinearGradient(-30, 0, 30, 0); 
            gradBody.addColorStop(0, color); gradBody.addColorStop(0.5, '#fff'); gradBody.addColorStop(1, color);
            ctx.fillStyle = gradBody; 
            ctx.beginPath(); ctx.moveTo(-25, -30); ctx.lineTo(25, -30); ctx.lineTo(40, 10); ctx.lineTo(10, 35); ctx.lineTo(-10, 35); ctx.lineTo(-40, 10); ctx.fill();
            
            const dw = (wx, wy) => { 
                ctx.save(); ctx.translate(wx, wy); ctx.rotate(steer * 0.8); 
                ctx.fillStyle = '#111'; ctx.fillRect(-12, -15, 24, 30); ctx.fillStyle = '#666'; ctx.fillRect(-5, -5, 10, 10); ctx.restore(); 
            };
            dw(-45, 15); dw(45, 15); ctx.fillStyle='#111'; ctx.fillRect(-50, -25, 20, 30); ctx.fillRect(30, -25, 20, 30);
            
            ctx.save(); ctx.translate(0, -10); ctx.rotate(steer * 0.3); 
            ctx.fillStyle = '#ffccaa'; ctx.beginPath(); ctx.arc(0, -20, 18, 0, Math.PI*2); ctx.fill(); 
            ctx.fillStyle = stats.hat; ctx.beginPath(); ctx.arc(0, -25, 18, Math.PI, 0); ctx.fill();
            ctx.beginPath(); ctx.ellipse(0, -25, 22, 5, 0, Math.PI, 0); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -32, 6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.font='bold 8px Arial'; ctx.textAlign='center'; ctx.fillText(stats.name[0], 0, -30);
            ctx.restore(); ctx.restore(); 
        },

        renderUI: function(ctx, w, h) {
            const d = Logic;
            
            hudMessages = hudMessages.filter(m => m.life > 0);
            hudMessages.forEach((m, i) => {
                ctx.save(); ctx.translate(w/2, h/2 - i*45); if(m.scale < 1) m.scale += 0.1;
                ctx.scale(m.scale, m.scale); ctx.fillStyle = m.color; 
                ctx.font = `bold ${m.size}px 'Russo One'`; ctx.textAlign = 'center';
                ctx.shadowColor = 'black'; ctx.shadowBlur = 10;
                ctx.fillText(m.text, 0, 0); ctx.restore(); m.life--;
            });

            if (d.state === 'GAMEOVER') {
                ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0,0,w,h);
                ctx.fillStyle = '#fff'; ctx.font = "bold 50px 'Russo One'"; ctx.textAlign = 'center';
                ctx.fillText("RESULTADO FINAL", w/2, 100);
                
                const allRacers = [
                    { name: CHARACTERS[d.selectedChar].name, time: d.finishTime, id: 'me', status: d.status, pos: d.pos, lap: d.lap },
                    ...d.rivals.map(r => ({ name: r.name || 'CPU', time: r.finishTime || 0, id: r.id, status: r.status, pos: r.pos, lap: r.lap }))
                ];
                
                // Classificação consistente para exibição final
                allRacers.sort((a, b) => {
                    if (a.status === 'FINISHED' && b.status === 'FINISHED') return (a.time) - (b.time);
                    if (a.status === 'FINISHED') return -1;
                    if (b.status === 'FINISHED') return 1;
                    const distA = (a.lap * 100000) + a.pos;
                    const distB = (b.lap * 100000) + b.pos;
                    return distB - distA;
                });

                allRacers.forEach((r, i) => {
                    const y = 200 + (i * 50);
                    ctx.fillStyle = r.id === 'me' ? '#ff0' : '#fff';
                    ctx.font = "30px Arial";
                    ctx.textAlign = 'left';
                    ctx.fillText(`${i+1}. ${r.name}`, w/2 - 150, y);
                    ctx.textAlign = 'right';
                    ctx.fillText(r.status === 'FINISHED' ? "🏁" : "DNF", w/2 + 150, y);
                });
                ctx.fillStyle = '#aaa'; ctx.font = "20px 'Russo One'"; ctx.textAlign = 'center'; 
                ctx.fillText("Toque para voltar ao menu", w/2, h - 50);
                return;
            }

            if (d.state === 'SPECTATE') {
                ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, h/2 - 50, w, 100);
                ctx.fillStyle = '#0f0'; ctx.font = "bold 40px 'Russo One'"; ctx.textAlign = 'center';
                ctx.fillText("CORRIDA FINALIZADA!", w/2, h/2 - 10);
                ctx.font = "20px 'Russo One'"; ctx.fillStyle = '#fff';
                ctx.fillText(`POSIÇÃO: ${d.finalRank}º | AGUARDANDO PILOTOS...`, w/2, h/2 + 30);
                return;
            }

            const hudX = w - 80; const hudY = h - 60; 
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(hudX, hudY, 55, 0, Math.PI * 2); ctx.fill();
            const rpm = Math.min(1, d.speed / CONF.TURBO_MAX_SPEED); 
            ctx.beginPath(); ctx.arc(hudX, hudY, 50, Math.PI, Math.PI + Math.PI * rpm); 
            ctx.lineWidth = 6; ctx.strokeStyle = d.turboLock ? '#0ff' : '#f33'; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = "bold 36px 'Russo One'"; ctx.textAlign = 'center'; ctx.fillText(Math.floor(d.speed), hudX, hudY + 10);
            
            ctx.font = "bold 24px 'Russo One'"; ctx.fillStyle = '#ff0';
            ctx.fillText(`${d.finalRank}º`, hudX, hudY - 35);
            ctx.fillStyle = '#fff'; ctx.font = "bold 14px 'Russo One'"; 
            ctx.fillText(`VOLTA ${d.lap}/${CONF.TOTAL_LAPS}`, hudX, hudY - 20);

            ctx.fillStyle = '#111'; ctx.fillRect(w/2 - 110, 20, 220, 20);
            ctx.fillStyle = d.turboLock ? '#0ff' : (d.nitro > 25 ? '#f90' : '#f33');
            ctx.fillRect(w/2 - 108, 22, (216) * (d.nitro/100), 16);

            if (minimapPath.length > 0) {
                const mapX = 25, mapY = 95, mapSize = 130;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(mapX, mapY, mapSize, mapSize);
                ctx.save(); ctx.translate(mapX + mapSize/2, mapY + mapSize/2);
                const scale = Math.min((mapSize-20)/minimapBounds.w, (mapSize-20)/minimapBounds.h);
                ctx.scale(scale, scale); ctx.translate(-(minimapBounds.minX+minimapBounds.maxX)/2, -(minimapBounds.minZ+minimapBounds.maxZ)/2);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.beginPath();
                minimapPath.forEach((p, i) => { if(i===0) ctx.moveTo(p.x, p.z); else ctx.lineTo(p.x, p.z); });
                ctx.closePath(); ctx.stroke();
                const drawDot = (pos, c, r) => {
                    const idx = Math.floor((pos/trackLength) * minimapPath.length) % minimapPath.length;
                    const pt = minimapPath[idx]; 
                    if(pt){
                        ctx.fillStyle=c; ctx.beginPath(); ctx.arc(pt.x, pt.z, r, 0, Math.PI*2); 
                        ctx.fill(); ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.stroke();
                    }
                };
               d.rivals.forEach(r => drawDot(r.pos, r.status==='FINISHED' ? '#0f0' : '#ffee00', 18)); 
               drawDot(d.pos, '#ff0000', 22);
               ctx.restore();
            }

            if (d.virtualWheel.opacity > 0.01) {
                ctx.save(); ctx.globalAlpha = d.virtualWheel.opacity; ctx.translate(d.virtualWheel.x, d.virtualWheel.y);
                if (d.virtualWheel.isHigh) { ctx.shadowBlur = 25; ctx.shadowColor = '#0ff'; }
                ctx.rotate(d.steer * 0.6);
                ctx.beginPath(); ctx.arc(0, 0, d.virtualWheel.r, 0, Math.PI * 2);
                ctx.lineWidth = 18; ctx.strokeStyle = '#2d3436'; ctx.stroke();
                ctx.beginPath(); ctx.arc(0, 0, d.virtualWheel.r, -Math.PI * 0.25, -Math.PI * 0.75, true); 
                ctx.lineWidth = 18; ctx.strokeStyle = '#d63031'; ctx.stroke();
                ctx.beginPath(); ctx.arc(0, 0, d.virtualWheel.r, Math.PI * 0.25, Math.PI * 0.75, false); 
                ctx.strokeStyle = '#d63031'; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-d.virtualWheel.r + 10, 0); ctx.lineTo(d.virtualWheel.r - 10, 0);
                ctx.moveTo(0, 0); ctx.lineTo(0, d.virtualWheel.r - 10);
                ctx.lineWidth = 12; ctx.strokeStyle = '#bdc3c7'; ctx.lineCap = 'round'; ctx.stroke();
                ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fillStyle = '#2d3436'; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = '#bdc3c7'; ctx.stroke();
                ctx.fillStyle = '#d63031'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
                ctx.textBaseline = 'middle'; ctx.fillText("GT", 0, 1);
                ctx.restore();
            }
        },

        renderModeSelect: function(ctx, w, h) {
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 40px 'Russo One'";
            ctx.fillText("KART LEGENDS", w/2, h * 0.3);
            ctx.fillStyle = "#e67e22"; ctx.fillRect(w/2 - 160, h * 0.45, 320, 65);
            ctx.fillStyle = "#27ae60"; ctx.fillRect(w/2 - 160, h * 0.6, 320, 65);
            ctx.fillStyle = "white"; ctx.font = "bold 20px 'Russo One'";
            ctx.fillText("ARCADE (SOLO)", w/2, h * 0.45 + 40);
            ctx.fillText("ONLINE (P2P)", w/2, h * 0.6 + 40);
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(0, 0, w, h);
            const char = CHARACTERS[this.selectedChar];
            ctx.fillStyle = char.color; ctx.beginPath(); ctx.arc(w/2, h*0.3, 60, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 32px 'Russo One'";
            ctx.fillText(char.name, w/2, h*0.3 + 100);
            ctx.font = "20px 'Russo One'"; 
            ctx.fillText("PISTA: " + TRACKS[this.selectedTrack].name, w/2, h*0.55);
            
            if(this.isOnline && this.isHost) {
                 ctx.fillStyle = "#f39c12"; ctx.font = "16px Arial"; 
                 ctx.fillText("(VOCÊ É O HOST - CLIQUE NA PISTA PARA MUDAR)", w/2, h*0.6);
            }

            ctx.fillStyle = this.isReady ? "#e67e22" : "#27ae60"; ctx.fillRect(w/2 - 160, h*0.8, 320, 70);
            ctx.fillStyle = "white"; ctx.font = "bold 24px 'Russo One'";
            ctx.fillText(this.isReady ? "AGUARDANDO..." : "PRONTO!", w/2, h*0.8 + 45);
        }
    };

    if(window.System) window.System.registerGame('drive', 'Kart Legends', '🏎️', Logic, { camOpacity: 0.1 });

})();