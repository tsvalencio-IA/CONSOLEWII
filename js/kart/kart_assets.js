/**
 * ASSETS E CONSTANTES
 */
export const CONSTANTS = {
    LANES: 3,
    ROAD_WIDTH: 2000,
    SEGMENT_LENGTH: 200,
    DRAW_DISTANCE: 300,
    FOV: 100,
    CAMERA_HEIGHT: 1000,
    MAX_SPEED: 12000,
    ACCEL: 4000,
    BREAKING: -8000,
    DECEL: -2000,
    OFFROAD_DECEL: -6000,
    OFFROAD_LIMIT: 2000,
    CENTRIFUGAL: 0.3
};

export const COLORS = {
    SKY:  ['#72D7EE', '#000033'], // Dia, Noite
    GRASS: { light: '#10AA10', dark: '#009A00' },
    RUMBLE: { light: '#555555', dark: '#BBBBBB' },
    ROAD: { light: '#6B6B6B', dark: '#636363' }
};

export const CHARACTERS = [
    { id: 0, name: 'Mario-like', color: '#e74c3c', speed: 1.0, turn: 1.0 },
    { id: 1, name: 'Luigi-like', color: '#2ecc71', speed: 0.95, turn: 1.1 },
    { id: 2, name: 'Peach-like', color: '#e91e63', speed: 0.9, turn: 1.3 }
];

export const SPRITES = {
    // Aqui definiríamos coordenadas de spritesheet se tivéssemos imagens
    // Como é vetorial/canvas puro por enquanto, usamos apenas IDs de cor
    TREE: { type: 'tree', color: '#2ecc71', scale: 4 },
    ROCK: { type: 'rock', color: '#7f8c8d', scale: 2 }
};
