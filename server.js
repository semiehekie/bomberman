const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Game constants
const GRID_WIDTH = 13;
const GRID_HEIGHT = 11;
const SPAWN_POINTS = [
  { x: 1, y: 1 },    // Player 1 (top-left)
  { x: GRID_WIDTH - 2, y: 1 },  // Player 2 (top-right)
  { x: 1, y: GRID_HEIGHT - 2 }  // Player 3 (bottom-left)
];
const BOMB_TIMER = 2000;
const BOMB_RADIUS = 2;
const POWER_UP_TYPES = ['extra_bomb', 'bigger_radius', 'speed'];
const POWER_UP_SPAWN_CHANCE = 0.3;

// Game state
let games = {};
let players = {};

// Initialize game grid
function createGameGrid() {
  const grid = Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(0));
  
  // Place unbreakable walls (border and checkerboard)
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (x === 0 || x === GRID_WIDTH - 1 || y === 0 || y === GRID_HEIGHT - 1) {
        grid[y][x] = 'wall'; // Unbreakable wall
      } else if (x % 2 === 0 && y % 2 === 0) {
        grid[y][x] = 'wall'; // Checkerboard unbreakable walls
      }
    }
  }
  
  // Place breakable walls
  for (let y = 1; y < GRID_HEIGHT; y++) {
    for (let x = 1; x < GRID_WIDTH; x++) {
      if (grid[y][x] === 0 && !(x % 2 === 0 && y % 2 === 0)) {
        // Don't place blocks near spawn points
        const nearSpawn = SPAWN_POINTS.some(p => 
          Math.abs(p.x - x) <= 2 && Math.abs(p.y - y) <= 2
        );
        if (!nearSpawn && Math.random() > 0.3) {
          grid[y][x] = 'block';
        }
      }
    }
  }
  
  return grid;
}

// Initialize game for a room
function initializeGame(roomId) {
  games[roomId] = {
    grid: createGameGrid(),
    players: [],
    bombs: [],
    explosions: [],
    powerUps: [],
    gameStarted: false,
    gameOver: false,
    winner: null
  };
}

// Add player to game
function addPlayerToGame(roomId, playerId, playerData) {
  if (!games[roomId]) {
    initializeGame(roomId);
  }
  
  const game = games[roomId];
  if (game.players.length < 3) {
    const spawnPoint = SPAWN_POINTS[game.players.length];
    const newPlayer = {
      id: playerId,
      x: spawnPoint.x,
      y: spawnPoint.y,
      playerNumber: game.players.length + 1,
      bombs: 1,
      bombRadius: BOMB_RADIUS,
      speed: 150,
      alive: true,
      color: ['#FF6B6B', '#4ECDC4', '#FFE66D'][game.players.length]
    };
    game.players.push(newPlayer);
    players[playerId] = { roomId, playerNumber: game.players.length };
    
    // Start game when 3 players connected
    if (game.players.length === 3 && !game.gameStarted) {
      game.gameStarted = true;
      io.to(roomId).emit('game_start', { players: game.players, grid: game.grid });
    }
    
    return newPlayer;
  }
  return null;
}

// Handle player movement
function movePlayer(roomId, playerId, direction) {
  const game = games[roomId];
  if (!game) return;
  
  const player = game.players.find(p => p.id === playerId);
  if (!player || !player.alive) return;
  
  let newX = player.x;
  let newY = player.y;
  
  switch(direction) {
    case 'up': newY = Math.max(0, player.y - 1); break;
    case 'down': newY = Math.min(GRID_HEIGHT - 1, player.y + 1); break;
    case 'left': newX = Math.max(0, player.x - 1); break;
    case 'right': newX = Math.min(GRID_WIDTH - 1, player.x + 1); break;
  }
  
  // Check collision with walls, blocks, bombs
  const cell = game.grid[newY]?.[newX];
  if (cell === 'wall' || cell === 'block') return;
  
  const bombAtPosition = game.bombs.find(b => b.x === newX && b.y === newY);
  if (bombAtPosition) return;
  
  // Check power-ups
  const powerUpIndex = game.powerUps.findIndex(p => p.x === newX && p.y === newY);
  if (powerUpIndex !== -1) {
    const powerUp = game.powerUps[powerUpIndex];
    applyPowerUp(player, powerUp.type);
    game.powerUps.splice(powerUpIndex, 1);
  }
  
  player.x = newX;
  player.y = newY;
  
  io.to(roomId).emit('player_moved', { playerId, x: newX, y: newY });
}

// Apply power-up to player
function applyPowerUp(player, type) {
  switch(type) {
    case 'extra_bomb':
      player.bombs = Math.min(player.bombs + 1, 10);
      break;
    case 'bigger_radius':
      player.bombRadius = Math.min(player.bombRadius + 1, 10);
      break;
    case 'speed':
      player.speed = Math.min(player.speed + 20, 300);
      break;
  }
}

// Place bomb
function placeBomb(roomId, playerId) {
  const game = games[roomId];
  if (!game) return;
  
  const player = game.players.find(p => p.id === playerId);
  if (!player || !player.alive || player.bombs <= 0) return;
  
  // Check if bomb already exists at player position
  if (game.bombs.find(b => b.x === player.x && b.y === player.y)) return;
  
  const bomb = {
    id: Math.random().toString(36).substr(2, 9),
    x: player.x,
    y: player.y,
    playerId,
    radius: player.bombRadius,
    timeLeft: BOMB_TIMER
  };
  
  game.bombs.push(bomb);
  player.bombs--;
  
  io.to(roomId).emit('bomb_placed', {
    bombId: bomb.id,
    x: bomb.x,
    y: bomb.y,
    playerId
  });
  
  // Detonate bomb after timer
  setTimeout(() => {
    detonateBomb(roomId, bomb.id);
  }, BOMB_TIMER);
}

// Detonate bomb and create explosion
function detonateBomb(roomId, bombId) {
  const game = games[roomId];
  if (!game) return;
  
  const bombIndex = game.bombs.findIndex(b => b.id === bombId);
  if (bombIndex === -1) return;
  
  const bomb = game.bombs[bombIndex];
  game.bombs.splice(bombIndex, 1);
  
  // Return bomb to player
  const player = game.players.find(p => p.id === bomb.playerId);
  if (player && player.alive) player.bombs++;
  
  // Create explosions in 4 directions
  const explosions = [];
  const affectedCells = new Set();
  affectedCells.add(`${bomb.x},${bomb.y}`);
  explosions.push({ x: bomb.x, y: bomb.y });
  
  const directions = [
    { dx: 0, dy: -1 }, // up
    { dx: 0, dy: 1 },  // down
    { dx: -1, dy: 0 }, // left
    { dx: 1, dy: 0 }   // right
  ];
  
  for (const dir of directions) {
    for (let i = 1; i <= bomb.radius; i++) {
      const x = bomb.x + dir.dx * i;
      const y = bomb.y + dir.dy * i;
      
      if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) break;
      
      const cell = game.grid[y][x];
      if (cell === 'wall') break;
      
      affectedCells.add(`${x},${y}`);
      explosions.push({ x, y });
      
      if (cell === 'block') {
        game.grid[y][x] = 0;
        
        // Spawn power-up
        if (Math.random() < POWER_UP_SPAWN_CHANCE) {
          const type = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
          game.powerUps.push({ x, y, type });
        }
        break;
      }
    }
  }
  
  // Store explosions temporarily
  game.explosions = explosions;
  
  // Check which players are hit
  const deadPlayers = [];
  for (const player of game.players) {
    if (player.alive && affectedCells.has(`${player.x},${player.y}`)) {
      player.alive = false;
      deadPlayers.push(player.id);
    }
  }
  
  io.to(roomId).emit('bomb_exploded', {
    bombId,
    explosions,
    deadPlayers
  });
  
  // Clear explosions after animation
  setTimeout(() => {
    game.explosions = [];
    
    // Check win condition
    const alivePlayers = game.players.filter(p => p.alive);
    if (alivePlayers.length <= 1 && game.gameStarted) {
      game.gameOver = true;
      game.winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
      io.to(roomId).emit('game_over', { winner: game.winner });
    }
  }, 500);
}

// Socket.io events
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  socket.on('join_game', (data, callback) => {
    const roomId = 'room1'; // Single room for now
    socket.join(roomId);
    
    const player = addPlayerToGame(roomId, socket.id, data);
    
    if (player) {
      const game = games[roomId];
      callback({
        success: true,
        player,
        game: {
          grid: game.grid,
          players: game.players,
          gameStarted: game.gameStarted
        }
      });
      
      io.to(roomId).emit('player_joined', {
        player,
        totalPlayers: game.players.length
      });
    } else {
      callback({ success: false, message: 'Room full' });
    }
  });
  
  socket.on('move', (data) => {
    const playerData = players[socket.id];
    if (playerData) {
      movePlayer(playerData.roomId, socket.id, data.direction);
    }
  });
  
  socket.on('bomb', () => {
    const playerData = players[socket.id];
    if (playerData) {
      placeBomb(playerData.roomId, socket.id);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    const playerData = players[socket.id];
    if (playerData) {
      const game = games[playerData.roomId];
      if (game) {
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          game.players.splice(playerIndex, 1);
        }
        io.to(playerData.roomId).emit('player_disconnected', { playerId: socket.id });
      }
    }
    delete players[socket.id];
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Bomberman server running on http://localhost:${PORT}`);
  console.log('Waiting for players...');
});
