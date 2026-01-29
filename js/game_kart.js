/**
 * KART LOADER
 * Ponto de entrada que carrega os módulos do jogo e inicia a Engine.
 */
window.CurrentGame = {
    loading: true,
    progress: 0,
    engine: null,

    init: async function() {
        console.log("🏎️ [KART] Carregando Módulos...");
        
        try {
            // Importação Dinâmica dos Componentes do Jogo
            // Ordem importa: Assets -> Track/Player/AI -> Multiplayer -> Engine
            const [Assets, Track, Player, AI, Multi, Engine] = await Promise.all([
                import('./kart/kart_assets.js'),
                import('./kart/kart_track.js'),
                import('./kart/kart_player.js'),
                import('./kart/kart_ai.js'),
                import('./kart/kart_multiplayer.js'),
                import('./kart/kart_engine.js')
            ]);

            console.log("🏎️ [KART] Módulos Carregados. Iniciando Motor...");
            
            // Instancia a Engine
            this.engine = new Engine.KartEngine({
                assets: Assets,
                trackSys: Track.TrackSystem,
                playerClass: Player.Player,
                botClass: AI.Bot,
                multiplayer: Multi.Multiplayer
            });

            this.engine.init();
            this.loading = false;

        } catch (e) {
            console.error("❌ [KART] Falha crítica ao carregar jogo:", e);
        }
    },

    cleanup: function() {
        if (this.engine) this.engine.cleanup();
    },

    update: function(dt, pose) {
        if (this.loading) {
            this.progress += dt * 0.5;
            if (this.progress > 1) this.progress = 0;
            return;
        }
        if (this.engine) this.engine.update(dt, pose);
    },

    draw: function(ctx, w, h) {
        if (this.loading) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#fff';
            ctx.font = "20px 'Chakra Petch'";
            ctx.textAlign = 'center';
            ctx.fillText("CARREGANDO PISTA...", w/2, h/2);
            
            // Barra
            ctx.strokeStyle = '#58b4e8';
            ctx.strokeRect(w/2 - 100, h/2 + 20, 200, 20);
            ctx.fillStyle = '#58b4e8';
            ctx.fillRect(w/2 - 98, h/2 + 22, 196 * Math.abs(Math.sin(Date.now()/500)), 16);
            return;
        }
        if (this.engine) this.engine.draw(ctx, w, h);
    },
    
    resize: function() {
        if(this.engine) this.engine.resize();
    }
};
