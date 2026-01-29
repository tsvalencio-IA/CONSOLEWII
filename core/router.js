import { State } from './state.js';

/**
 * ROUTER
 * Gerencia o carregamento dinâmico de jogos (Cartuchos Virtuais).
 */
export const Router = {
    activeGame: null, // Objeto do jogo rodando atualmente
    registry: {
        'MENU': './js/menu_console.js', // Menu Principal (Bloco 2)
        'KART': './js/game_kart.js'     // Jogo de Kart (Bloco 3)
    },

    init: () => {
        // Carrega o Menu Principal por padrão
        // Como o menu ainda não foi criado no Bloco 1, deixamos um placeholder
        console.log("🔄 [ROUTER] Pronto. Aguardando comando de carga.");
    },

    load: async (gameKey) => {
        console.log(`📂 [ROUTER] Carregando Cartucho: ${gameKey}...`);
        
        // 1. Cleanup do jogo anterior
        if (Router.activeGame && Router.activeGame.cleanup) {
            Router.activeGame.cleanup();
        }
        Router.activeGame = null;

        // 2. Verifica registro
        const scriptPath = Router.registry[gameKey];
        if (!scriptPath) {
            console.error("❌ Jogo não encontrado no registro.");
            return;
        }

        // 3. Carregamento Dinâmico do Script
        try {
            await Router.injectScript(scriptPath);
            
            // O Script do jogo deve setar window.CurrentGame
            if (window.CurrentGame) {
                Router.activeGame = window.CurrentGame;
                if (Router.activeGame.init) Router.activeGame.init();
                console.log(`✅ [ROUTER] ${gameKey} Iniciado com Sucesso.`);
            } else {
                throw new Error("Script carregado, mas window.CurrentGame não definido.");
            }

        } catch (e) {
            console.error("❌ Erro ao carregar jogo:", e);
        }
    },

    injectScript: (src) => {
        return new Promise((resolve, reject) => {
            // Remove script anterior se existir (opcional, simples aqui)
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }
};
