/**
 * STATE MANAGEMENT
 * Armazena dados globais do usuário e configurações.
 */
export const State = {
    user: {
        id: null, // UID do Firebase
        name: 'Player 1',
        avatarColor: '#58b4e8',
        coins: 0
    },
    
    settings: {
        volume: 0.8,
        motionSensitivity: 1.0,
        showDebugCamera: false
    },

    setUser: (data) => {
        State.user = { ...State.user, ...data };
        State.persist();
    },

    setSettings: (data) => {
        State.settings = { ...State.settings, ...data };
        // Atualiza elementos visuais se necessário
        const cam = document.getElementById('webcam-feed');
        if(cam) cam.style.opacity = State.settings.showDebugCamera ? '0.5' : '0';
        State.persist();
    },

    persist: () => {
        localStorage.setItem('THIAGUINHO_WII_DATA', JSON.stringify({
            user: State.user,
            settings: State.settings
        }));
    },

    load: () => {
        const data = localStorage.getItem('THIAGUINHO_WII_DATA');
        if (data) {
            const parsed = JSON.parse(data);
            State.user = parsed.user || State.user;
            State.settings = parsed.settings || State.settings;
        }
    }
};

// Carrega dados ao importar
State.load();
