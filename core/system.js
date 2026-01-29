import { Router } from './router.js';
import { State } from './state.js';

/**
 * SYSTEM KERNEL
 * Responsável pelo hardware (Câmera, Canvas, Audio), Loop Principal e Inicialização.
 */
export const System = {
    hardware: {
        video: null,
        canvas: null,
        ctx: null,
        detector: null
    },
    
    runtime: {
        loopId: null,
        lastTime: 0,
        pose: null, // Dados globais da IA (corpo detectado)
        isReady: false
    },

    config: {
        firebase: {
            apiKey: "AIzaSyB0ThqhfK6xc8P1D4WCkavhdXbb7zIaQJk",
            authDomain: "thiaguinhowii.firebaseapp.com",
            databaseURL: "https://thiaguinhowii-default-rtdb.firebaseio.com",
            projectId: "thiaguinhowii",
            storageBucket: "thiaguinhowii.firebasestorage.app",
            messagingSenderId: "63695043126",
            appId: "1:63695043126:web:abd6a8ba7792313991b697"
        }
    },

    // --- BOOT PROCESS ---
    boot: async () => {
        console.log("💿 [SYSTEM] Inicializando Kernel...");
        
        // 1. Vincular DOM
        System.hardware.video = document.getElementById('webcam-feed');
        System.hardware.canvas = document.getElementById('game-canvas');
        System.hardware.ctx = System.hardware.canvas.getContext('2d', { alpha: false });
        
        // 2. Setup de Eventos Globais
        window.addEventListener('resize', System.resize);
        System.resize();

        // 3. Inicializar Firebase
        try {
            firebase.initializeApp(System.config.firebase);
            window.DB = firebase.database();
            console.log("🔥 [SYSTEM] Firebase Conectado");
            
            // Autenticação Anônima para Multiplayer
            await firebase.auth().signInAnonymously();
            State.setUser({ id: firebase.auth().currentUser.uid });
        } catch (e) {
            console.error("❌ [SYSTEM] Erro Firebase:", e);
        }

        // 4. Inicializar IA (MoveNet) em Background
        System.initAI();

        // 5. Entregar controle ao Router
        Router.init();
        System.runtime.isReady = true;
        
        // Remover Tela de Loading Inicial
        document.getElementById('sys-loader').style.opacity = '0';
        setTimeout(() => document.getElementById('sys-loader').classList.add('hidden'), 500);

        // Iniciar Loop Global
        System.loop();
    },

    // --- HARDWARE ABSTRACTION ---
    initAI: async () => {
        try {
            // Setup Camera
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480, frameRate: { ideal: 30 } } 
            });
            System.hardware.video.srcObject = stream;
            await new Promise(r => System.hardware.video.onloadedmetadata = r);
            System.hardware.video.play();

            // Setup MoveNet
            const model = poseDetection.SupportedModels.MoveNet;
            System.hardware.detector = await poseDetection.createDetector(model, { 
                modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING 
            });
            console.log("🧠 [SYSTEM] IA Vision Ativa");
            
            // Loop Dedicado de Detecção (Não bloqueia render)
            System.poseLoop();
        } catch (e) {
            console.warn("⚠️ [SYSTEM] Sem câmera ou IA não suportada:", e);
        }
    },

    poseLoop: async () => {
        if (System.hardware.detector && System.hardware.video.readyState === 4) {
            try {
                const poses = await System.hardware.detector.estimatePoses(System.hardware.video, {
                    flipHorizontal: true
                });
                if (poses.length > 0) System.runtime.pose = poses[0];
            } catch (e) { }
        }
        requestAnimationFrame(System.poseLoop);
    },

    // --- CORE LOOP ---
    loop: (timestamp) => {
        const dt = (timestamp - System.runtime.lastTime) / 1000 || 0.016;
        System.runtime.lastTime = timestamp;

        const w = System.hardware.canvas.width;
        const h = System.hardware.canvas.height;

        // Limpa Canvas Global
        System.hardware.ctx.fillStyle = '#111';
        System.hardware.ctx.fillRect(0, 0, w, h);

        // Renderiza o Jogo Atual via Router
        if (Router.activeGame) {
            Router.activeGame.update(dt, System.runtime.pose);
            Router.activeGame.draw(System.hardware.ctx, w, h);
        }

        System.runtime.loopId = requestAnimationFrame(System.loop);
    },

    resize: () => {
        if (System.hardware.canvas) {
            System.hardware.canvas.width = window.innerWidth;
            System.hardware.canvas.height = window.innerHeight;
            if(Router.activeGame && Router.activeGame.resize) Router.activeGame.resize();
        }
    },

    // Som Global (Sfx)
    audio: {
        ctx: null,
        play: (freq, type, dur) => {
            if (!System.audio.ctx) System.audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = System.audio.ctx.createOscillator();
            const g = System.audio.ctx.createGain();
            o.type = type; o.frequency.value = freq;
            g.gain.setValueAtTime(0.1, System.audio.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, System.audio.ctx.currentTime + dur);
            o.connect(g); g.connect(System.audio.ctx.destination);
            o.start(); o.stop(System.audio.ctx.currentTime + dur);
        }
    }
};
