/**
 * CONSOLE MENU (Wii Style)
 * Interface principal para seleção de canais (Jogos).
 */
window.CurrentGame = {
    state: {
        cursor: { x: 0, y: 0, active: false },
        channels: [
            { id: 'KART', title: 'Kart Channel', color: '#58b4e8', icon: '🏎️' },
            { id: 'MII', title: 'Mii Maker', color: '#e0e0e0', icon: '👤', disabled: true },
            { id: 'SETTINGS', title: 'Config', color: '#95a5a6', icon: '⚙️', disabled: true },
            { id: 'EMPTY', title: '...', color: '#ecf0f1', icon: '', disabled: true }
        ],
        hoverIdx: -1,
        loaded: false
    },

    init: function() {
        console.log("💿 [MENU] Console Iniciado");
        this.resize();
        this.state.loaded = true;
    },

    cleanup: function() {
        console.log("👋 [MENU] Encerrando...");
    },

    update: function(dt, pose) {
        if (!this.state.loaded) return;

        // 1. INPUT HANDLING (Pose ou Mouse)
        if (pose && pose.keypoints) {
            // Usa o nariz como cursor
            const nose = pose.keypoints.find(k => k.name === 'nose');
            if (nose && nose.score > 0.5) {
                // Mapeia coordenadas normalizadas da câmera para a tela
                // Câmera é espelhada, então invertemos X
                this.state.cursor.x = (1 - nose.x) * window.innerWidth;
                this.state.cursor.y = nose.y * window.innerHeight;
                this.state.cursor.active = true;
            }
        } else {
            // Fallback para Mouse (sempre ativo para debug)
            // (Assumindo que o sistema não bloqueia mouse)
        }

        // 2. DETECTAR HOVER
        this.state.hoverIdx = -1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const gridW = w * 0.8;
        const startX = w * 0.1;
        const cellW = gridW / 4;
        
        // Simulação simples de colisão cursor-célula
        // Apenas verifica se o cursor está na área do primeiro canal (Kart)
        // Em um sistema completo, verificaria bounding box de cada canal
        if (this.state.cursor.x > startX && this.state.cursor.x < startX + cellW &&
            this.state.cursor.y > h * 0.3 && this.state.cursor.y < h * 0.7) {
            this.state.hoverIdx = 0; // Kart Channel
        }

        // 3. SELEÇÃO (Tempo de Hover ou Clique)
        // Aqui usaremos clique do mouse ou gesto simples (futuro)
        // Por enquanto, clique do mouse no canvas dispara a ação
    },

    draw: function(ctx, w, h) {
        // Fundo
        ctx.fillStyle = '#ecf0f1';
        ctx.fillRect(0, 0, w, h);

        // Grid de Canais
        const gridW = w * 0.8;
        const cellH = h * 0.4;
        const startX = w * 0.1;
        const startY = h * 0.3;
        const cellW = gridW / 4;

        this.state.channels.forEach((ch, i) => {
            if (i > 3) return; // Mostra apenas 4

            const x = startX + (i * cellW) + 10;
            const y = startY;
            const cw = cellW - 20;
            
            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            ctx.fillRect(x + 5, y + 5, cw, cellH);

            // Card
            const isHover = (this.state.hoverIdx === i);
            ctx.fillStyle = ch.disabled ? '#bdc3c7' : (isHover ? '#3498db' : '#fff');
            ctx.fillRect(x, y, cw, cellH);
            
            // Borda
            ctx.strokeStyle = '#bdc3c7';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, cw, cellH);

            // Conteúdo
            ctx.fillStyle = ch.disabled ? '#7f8c8d' : (isHover ? '#fff' : '#2c3e50');
            ctx.textAlign = 'center';
            ctx.font = "60px Arial";
            ctx.fillText(ch.icon, x + cw/2, y + cellH/2);
            
            ctx.font = "bold 18px 'Roboto'";
            ctx.fillText(ch.title, x + cw/2, y + cellH - 20);

            // Armazena área para clique (hack rápido)
            if (i === 0) this.state.btnRect = { x, y, w: cw, h: cellH };
        });

        // Título
        ctx.fillStyle = '#7f8c8d';
        ctx.font = "20px 'Chakra Petch'";
        ctx.textAlign = 'center';
        ctx.fillText(new Date().toLocaleTimeString(), w/2, h - 30);
        ctx.fillText("Selecione um Canal", w/2, 50);

        // Cursor
        if (this.state.cursor.active) {
            ctx.fillStyle = '#3498db';
            ctx.beginPath();
            ctx.arc(this.state.cursor.x, this.state.cursor.y, 10, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    },

    resize: function() {
        // Recalcula layout se necessário
    }
};

// Evento de Clique para Seleção
window.onclick = (e) => {
    if (!window.CurrentGame || !window.CurrentGame.state) return;
    const btn = window.CurrentGame.state.btnRect;
    if (btn && e.clientX >= btn.x && e.clientX <= btn.x + btn.w && e.clientY >= btn.y && e.clientY <= btn.y + btn.h) {
        // Carrega o Router dinamicamente para trocar de jogo
        import('../core/router.js').then(module => {
            module.Router.load('KART');
        });
    }
};
