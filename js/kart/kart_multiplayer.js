import { State } from '../../core/state.js';

/**
 * SISTEMA MULTIPLAYER (Firebase RTDB)
 * Sincroniza posição e estado dos jogadores.
 */
export class Multiplayer {
    constructor() {
        this.active = false;
        this.roomId = 'lobby_principal';
        this.remotePlayers = {}; // Cache de jogadores remotos
        this.lastUpdate = 0;
        this.dbRef = null;
        this.myId = State.user.id || 'player_' + Math.floor(Math.random()*9999);
    }

    init() {
        if (!window.DB) {
            console.warn("⚠️ [MULTI] Firebase não disponível. Modo Offline.");
            return;
        }

        console.log(`🌐 [MULTI] Conectando ao Lobby: ${this.roomId}`);
        this.active = true;
        this.dbRef = window.DB.ref(`rooms/${this.roomId}/players`);

        // Listener de Jogadores
        this.dbRef.on('value', (snap) => {
            const data = snap.val();
            if (!data) return;
            
            Object.keys(data).forEach(key => {
                if (key === this.myId) return; // Ignora eu mesmo

                if (!this.remotePlayers[key]) {
                    // Novo Jogador Entrou
                    this.remotePlayers[key] = {
                        id: key,
                        x: data[key].x,
                        z: data[key].z,
                        color: data[key].color,
                        name: data[key].name || 'Rival',
                        targetX: data[key].x, // Para interpolação
                        targetZ: data[key].z
                    };
                } else {
                    // Atualiza Jogador Existente
                    const p = this.remotePlayers[key];
                    p.targetX = data[key].x;
                    p.targetZ = data[key].z;
                    p.color = data[key].color;
                }
            });

            // Remove desconectados
            Object.keys(this.remotePlayers).forEach(key => {
                if (!data[key]) delete this.remotePlayers[key];
            });
        });

        // Registrar desconexão
        this.dbRef.child(this.myId).onDisconnect().remove();
    }

    broadcast(playerObj, charInfo) {
        if (!this.active) return;

        const now = Date.now();
        if (now - this.lastUpdate > 100) { // Taxa de 10 updates/segundo
            this.lastUpdate = now;
            
            this.dbRef.child(this.myId).update({
                x: Number(playerObj.x.toFixed(2)),
                z: Math.floor(playerObj.z),
                speed: Math.floor(playerObj.speed),
                color: charInfo.color,
                name: State.user.name,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }
    }

    updateRemotes(dt, trackLength) {
        // Interpolação suave de movimento
        Object.values(this.remotePlayers).forEach(p => {
            // Suaviza X
            if (p.targetX !== undefined) {
                p.x += (p.targetX - p.x) * 5.0 * dt;
            }

            // Suaviza Z (tratando o loop da pista)
            if (p.targetZ !== undefined) {
                let diff = p.targetZ - p.z;
                // Se a diferença for muito grande, é porque cruzou a linha de chegada
                if (diff < -trackLength / 2) diff += trackLength;
                if (diff > trackLength / 2) diff -= trackLength;
                
                p.z += diff * 5.0 * dt;
                
                // Normaliza Z
                if (p.z >= trackLength) p.z -= trackLength;
                if (p.z < 0) p.z += trackLength;
            }
        });
    }

    cleanup() {
        if (this.active && this.dbRef) {
            this.dbRef.child(this.myId).remove();
            this.dbRef.off();
        }
    }
}
