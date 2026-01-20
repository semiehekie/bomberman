// Game state
const game = {
  socket: null,
  player: null,
  gameState: null,
  playerId: null,
  players: {},
  bombIdToVisual: {},
  keysPressed: {},
  gameStarted: false,
  gameOver: false,
  explosions: new Set(),
  lastMoveTime: 0,
  moveDelay: 100
};

// Key mappings for controls
const CONTROLS = {
  // Player 1: WASD + Space
  'p1': {
    'w': 'up',
    'a': 'left',
    's': 'down',
    'd': 'right',
    ' ': 'bomb'
  },
  // Player 2: Arrow keys + Enter
  'p2': {
    'arrowup': 'up',
    'arrowleft': 'left',
    'arrowdown': 'down',
    'arrowright': 'right',
    'enter': 'bomb'
  },
  // Player 3: IJKL + Shift
  'p3': {
    'i': 'up',
    'j': 'left',
    'k': 'down',
    'l': 'right',
    'shift': 'bomb'
  }
};

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  initializeGame();
});

function initializeGame() {
  // Connect to server
  game.socket = io();
  
  game.socket.on('connect', () => {
    console.log('Connected to server');
    updateStatus('Verbonden! Spel starten...');
    
    // Request to join game
    game.socket.emit('join_game', {}, (response) => {
      if (response.success) {
        console.log('Joined game successfully');
        game.player = response.player;
        game.playerId = game.socket.id;
        game.gameState = response.game;
        
        updateStatus(`Speler ${game.player.playerNumber} binnengekomen (${response.game.players.length}/3)`);
        
        if (!response.game.gameStarted) {
          updateStatus(`Wachtend op spelers... (${response.game.players.length}/3)`);
        }
        
        // Initialize game board
        renderGameBoard();
        
        // Start input handling
        startInputHandling();
      } else {
        updateStatus('Fout: ' + response.message);
      }
    });
  });
  
  // Socket events
  game.socket.on('player_joined', (data) => {
    console.log('Player joined:', data);
    game.gameState.players = data.totalPlayers > 1 ? 
      Array(data.totalPlayers).fill(0) : game.gameState.players;
    updateStatus(`Spelers verbonden: ${data.totalPlayers}/3`);
  });
  
  game.socket.on('game_start', (data) => {
    console.log('Game started!');
    game.gameStarted = true;
    game.gameState = data;
    game.gameState.bombs = [];
    game.gameState.explosions = [];
    game.gameState.powerUps = [];
    
    for (const player of data.players) {
      game.players[player.id] = player;
    }
    
    updateStatus('Spel gestart!');
    renderGameBoard();
  });
  
  game.socket.on('player_moved', (data) => {
    // Update player position
    const player = game.gameState.players.find(p => p.id === data.playerId);
    if (player) {
      player.x = data.x;
      player.y = data.y;
    }
    renderGameBoard();
  });
  
  game.socket.on('bomb_placed', (data) => {
    console.log('Bomb placed:', data);
    game.gameState.bombs.push({
      id: data.bombId,
      x: data.x,
      y: data.y,
      playerId: data.playerId
    });
    game.bombIdToVisual[data.bombId] = data;
    renderGameBoard();
  });
  
  game.socket.on('bomb_exploded', (data) => {
    console.log('Bomb exploded:', data);
    
    // Remove bomb from state
    game.gameState.bombs = game.gameState.bombs.filter(b => b.id !== data.bombId);
    
    // Add explosions temporarily
    game.explosions.clear();
    for (const exp of data.explosions) {
      game.explosions.add(`${exp.x},${exp.y}`);
    }
    
    // Mark dead players
    for (const deadPlayerId of data.deadPlayers) {
      const player = game.gameState.players.find(p => p.id === deadPlayerId);
      if (player) {
        player.alive = false;
        console.log('Player died:', deadPlayerId);
      }
    }
    
    renderGameBoard();
    
    // Clear explosions after 500ms
    setTimeout(() => {
      game.explosions.clear();
      renderGameBoard();
    }, 500);
  });
  
  game.socket.on('game_over', (data) => {
    console.log('Game over!');
    game.gameOver = true;
    
    let message = '';
    if (data.winner) {
      const winnerPlayer = game.gameState.players.find(p => p.id === data.winner.id);
      message = `Speler ${winnerPlayer.playerNumber} wint! 🎉`;
    } else {
      message = 'Gelijkspel!';
    }
    
    showGameOverModal(message);
  });
  
  game.socket.on('disconnect', () => {
    updateStatus('Verbinding verbroken!');
  });
}

function startInputHandling() {
  document.addEventListener('keydown', (e) => {
    if (game.gameOver) return;
    
    // Get the key with proper case handling for arrow keys
    let key = e.key.toLowerCase();
    const shift = e.shiftKey;
    
    // Map arrow keys to our format
    if (e.key.startsWith('Arrow')) {
      key = 'arrow' + e.key.slice(5).toLowerCase();
    }
    
    console.log('Key pressed:', key, 'Player:', game.player?.playerNumber);
    
    // Determine which player this key belongs to
    let playerNum = null;
    let action = null;
    
    // Player 1 (WASD + Space)
    if (['w', 'a', 's', 'd', ' '].includes(key)) {
      playerNum = 1;
      action = CONTROLS.p1[key] || CONTROLS.p1[' '];
    }
    // Player 2 (Arrow keys + Enter)
    else if (key.startsWith('arrow') || key === 'enter') {
      playerNum = 2;
      action = CONTROLS.p2[key];
      console.log('Player 2 action:', action);
    }
    // Player 3 (IJKL + Shift)
    else if (['i', 'j', 'k', 'l'].includes(key)) {
      playerNum = 3;
      action = CONTROLS.p3[key];
    }
    else if (shift && game.player && game.player.playerNumber === 3) {
      playerNum = 3;
      action = 'bomb';
    }
    
    // Only handle if it's our player
    if (playerNum === game.player?.playerNumber) {
      console.log('Handling action for player', playerNum, ':', action);
      if (action === 'bomb') {
        e.preventDefault();
        game.socket.emit('bomb');
      } else if (['up', 'down', 'left', 'right'].includes(action)) {
        e.preventDefault();
        const now = Date.now();
        if (now - game.lastMoveTime > game.moveDelay) {
          game.socket.emit('move', { direction: action });
          game.lastMoveTime = now;
        }
      }
    }
  });
}

function renderGameBoard() {
  const board = document.getElementById('gameBoard');
  
  if (!game.gameState) return;
  
  // Create grid
  const gridWidth = game.gameState.grid[0]?.length || 13;
  const gridHeight = game.gameState.grid?.length || 11;
  
  // Set CSS grid
  board.style.gridTemplateColumns = `repeat(${gridWidth}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${gridHeight}, 1fr)`;
  
  // Clear board
  board.innerHTML = '';
  
  // Render all cells
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      
      const cellContent = game.gameState.grid[y][x];
      
      // Base cell
      if (cellContent === 'wall') {
        cell.classList.add('wall');
      } else if (cellContent === 'block') {
        cell.classList.add('block');
      }
      
      // Check for explosion
      if (game.explosions.has(`${x},${y}`)) {
        const explosion = document.createElement('div');
        explosion.className = 'explosion';
        explosion.textContent = '💥';
        cell.appendChild(explosion);
        cell.style.backgroundColor = '#ff6b35';
        board.appendChild(cell);
        continue;
      }
      
      // Check for bomb
      const bomb = game.gameState.bombs?.find(b => b.x === x && b.y === y);
      if (bomb) {
        const bombDiv = document.createElement('div');
        bombDiv.className = 'bomb';
        bombDiv.textContent = '💣';
        cell.appendChild(bombDiv);
        board.appendChild(cell);
        continue;
      }
      
      // Check for power-up
      const powerUp = game.gameState.powerUps?.find(p => p.x === x && p.y === y);
      if (powerUp) {
        const puDiv = document.createElement('div');
        puDiv.className = 'power-up';
        
        switch (powerUp.type) {
          case 'extra_bomb':
            puDiv.textContent = '💣';
            break;
          case 'bigger_radius':
            puDiv.textContent = '💥';
            break;
          case 'speed':
            puDiv.textContent = '⚡';
            break;
        }
        
        cell.appendChild(puDiv);
        board.appendChild(cell);
        continue;
      }
      
      // Check for player
      const player = game.gameState.players?.find(p => p.x === x && p.y === y);
      if (player) {
        cell.classList.add('player');
        const playerSprite = document.createElement('div');
        playerSprite.className = `player-sprite p${player.playerNumber}`;
        playerSprite.textContent = player.playerNumber;
        
        if (!player.alive) {
          playerSprite.style.opacity = '0.3';
        }
        
        cell.appendChild(playerSprite);
      }
      
      board.appendChild(cell);
    }
  }
  
  // Update players stats
  updatePlayersStats();
}

function updatePlayersStats() {
  const statsDiv = document.getElementById('playersStats');
  statsDiv.innerHTML = '';
  
  if (!game.gameState?.players) return;
  
  for (const player of game.gameState.players) {
    const playerDiv = document.createElement('div');
    playerDiv.className = `player-stat p${player.playerNumber}`;
    
    if (!player.alive) {
      playerDiv.classList.add('dead');
    }
    
    playerDiv.innerHTML = `
      <div class="player-stat-name">Speler ${player.playerNumber}</div>
      <div class="player-stat-detail">💣 Bommen: ${player.bombs}</div>
      <div class="player-stat-detail">💥 Radius: ${player.bombRadius}</div>
      <div class="player-stat-detail">⚡ Snelheid: ${player.speed}</div>
      <div class="player-stat-detail">${player.alive ? '✓ Leeft' : '✗ Dood'}</div>
    `;
    
    statsDiv.appendChild(playerDiv);
  }
}

function updateStatus(message) {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = message;
  }
}

function showGameOverModal(message) {
  const modal = document.getElementById('gameOverModal');
  const messageEl = document.getElementById('gameOverMessage');
  
  messageEl.textContent = message;
  modal.classList.remove('hidden');
}
