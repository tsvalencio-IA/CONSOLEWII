import { State } from './state.js';

/**
 * ROUTER
 * Gerencia o carregamento dinâmico de jogos (Cartuchos Virtuais).
 */
export const Router = {
    activeGame: null,
    registry: {
        'MENU': './js/menu_console.js',
        'KART': './js/game_kart.js'
    },

    init: () => {
        // CORREÇÃO CRÍTICA: Agora carregamos o MENU automaticamente ao iniciar
        console.log("🚀 [ROUTER] Boot executado. Carregando Interface...");
        Router.load('MENU');
    },

    load: async (gameKey) => {
        console.log(`📂 [ROUTER] Lendo Cartucho: ${gameKey}...`);
        
        // 1. Limpeza do jogo anterior (Garbage Collection)
        if (Router.activeGame && Router.activeGame.cleanup) {
            try {
                Router.activeGame.cleanup();
            } catch (e) {
                console.warn("Erro ao limpar jogo anterior:", e);
            }
        }
        Router.activeGame = null;

        // 2. Verifica registro
        const scriptPath = Router.registry[gameKey];
        if (!scriptPath) {
            console.error(`❌ ERRO FATAL: Jogo '${gameKey}' não registrado.`);
            return;
        }

        // 3. Injeção Dinâmica
        try {
            await Router.injectScript(scriptPath);
            
            if (window.CurrentGame) {
                Router.activeGame = window.CurrentGame;
                if (Router.activeGame.init) Router.activeGame.init();
                
                // Força resize para garantir renderização
                if (window.System && window.System.resize) window.System.resize();
                
                console.log(`✅ [ROUTER] ${gameKey} Rodando.`);
            } else {
                throw new Error(`O arquivo ${scriptPath} não definiu window.CurrentGame`);
            }

        } catch (e) {
            console.error("❌ Falha no carregamento:", e);
        }
    },

    injectScript: (src) => {
        return new Promise((resolve, reject) => {
            const old = document.querySelector(`script[src="${src}"]`);
            if (old) old.remove();

            const script = document.createElement('script');
            script.src = src;
            script.type = 'module';
            script.onload = resolve;
            script.onerror = (e) => reject(`Falha ao carregar script: ${src}`);
            document.body.appendChild(script);
        });
    }
};
