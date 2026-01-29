/**
 * MENU PRINCIPAL (INTERFACE VISUAL)
 */
window.CurrentGame = {
    loaded: false,
    hoverIdx: -1,
    
    // Configuração dos Canais (Botões)
    channels: [
        { id: 'KART', title: 'Kart Channel', color: '#58b4e8', icon: '🏎️' },
        { id: 'MII', title: 'Mii Channel', color: '#bdc3c7', icon: '👤', disabled: true },
        { id: 'CONFIG', title: 'Settings', color: '#95a5a6', icon: '⚙️', disabled: true },
        { id: 'SHOP', title: 'Shop', color: '#f1c40f', icon: '🛒', disabled: true }
    ],

    init: function() {
        console.log("💿 [MENU] Interface Carregada.");
        this.loaded = true;
        this.resize();
        
        // Listener de clique global para navegação
        this.clickHandler = (e) => this.handleClick(e);
        window.addEventListener('click', this.clickHandler);
    },

    cleanup: function() {
        console.log("👋 [MENU] Encerrando Interface.");
        window.removeEventListener('click', this.clickHandler);
    },

    update: function(dt, pose) {
        if (!this.loaded) return;
        
        // Lógica de Cursor (Mouse ou Pose) seria aqui
        // Por enquanto, usamos o mouse nativo do navegador
    },

    draw: function(ctx, w, h) {
        // 1. Fundo Limpo (Branco Wii)
        ctx.fillStyle = '#ecf0f1';
        ctx.fillRect(0, 0, w, h);

        // 2. Grid de Canais
        const margin = 20;
        const cols = 4;
        const cellW = (w - (margin * (cols + 1))) / cols;
        const cellH = h * 0.4;
        const startY = h * 0.3;

        this.channels.forEach((ch, i) => {
            if(i >= cols) return; // Limite de demo

            const x = margin + (i * (cellW + margin));
            const y = startY;

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            ctx.fillRect(x + 5, y + 5, cellW, cellH);

            // Botão
            ctx.fillStyle = ch.disabled ? '#bdc3c7' : '#fff';
            
            // Hover simples (baseado em posição aproximada do mouse se tivéssemos tracking aqui)
            // Desenhando borda
            ctx.strokeStyle = '#95a5a6';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, cellW, cellH);
            ctx.fillRect(x, y, cellW, cellH);

            // Ícone e Texto
            ctx.fillStyle = '#2c3e50';
            ctx.textAlign = 'center';
            ctx.font = '60px Arial';
            ctx.fillText(ch.icon, x + cellW/2, y + cellH/2);
            
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText(ch.title, x + cellW/2, y + cellH - 20);

            // Salva área para clique
            ch.rect = { x, y, w: cellW, h: cellH };
        });

        // 3. Rodapé
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(0, h - 50, w, 50);
        ctx.fillStyle = '#fff';
        ctx.font = '16px sans-serif';
        ctx.fillText("Clique no Kart Channel para iniciar", w/2, h - 20);
    },

    handleClick: function(e) {
        const mx = e.clientX;
        const my = e.clientY;

        this.channels.forEach(ch => {
            if (ch.rect && 
                mx >= ch.rect.x && mx <= ch.rect.x + ch.rect.w &&
                my >= ch.rect.y && my <= ch.rect.y + ch.rect.h) {
                
                if (ch.id === 'KART' && !ch.disabled) {
                    // Toca som se houver (opcional)
                    // Carrega o jogo
                    import('../core/router.js').then(r => r.Router.load('KART'));
                }
            }
        });
    },

    resize: function() {
        // Força redesenho
    }
};
