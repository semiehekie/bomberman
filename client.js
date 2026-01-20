// Game state
const game = {
  socket: null,
  player: null,
  gameState: null,
  gameId: null,
  playerId: null,
  players: {},
  bombIdToVisual: {},
  keysPressed: {},
  gameStarted: false,
  gameOver: false,
  isReady: false,
  playersReadyStatus: {},
  explosions: new Set(),
  lastMoveTime: 0,
  moveDelay: 100
};

// Key mappings - Alle spelers gebruiken pijltjestoetsen + Enter
const CONTROLS = {
  'arrowup': 'up',
  'arrowleft': 'left',
  'arrowdown': 'down',
  'arrowright': 'right',
  'enter': 'bomb',
  // Alternative controls ook beschikbaar
  'w': 'up',
  'a': 'left',
  's': 'down',
  'd': 'right',
  ' ': 'bomb',
  'i': 'up',
  'j': 'left',
  'k': 'down',
  'l': 'right',
  'shift': 'bomb'
};

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  initializeGame();
});

function initializeGame() {
  // Connect to server
  game.socket = io();
  
  game.socket.on('connect', () => {
    updateStatus('Verbonden! Spel starten...');
    
    // Request to join game
    game.socket.emit('join_game', {}, (response) => {
      if (response.success) {
        game.player = response.player;
        game.playerId = game.socket.id;
        game.gameId = response.gameId;
        game.gameState = response.game;
        
        updateStatus(`Speler ${game.player.playerNumber} binnengekomen in ${game.gameId} (${response.game.players.length}/3)`);
        
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
    game.gameId = data.gameId;
    updateStatus(`Spelers in ${game.gameId}: ${data.totalPlayers}/3`);
  });
  
  game.socket.on('game_start', (data) => {
    game.gameStarted = true;
    game.gameState = data;
    game.gameState.bombs = [];
    game.gameState.explosions = [];
    game.gameState.powerUps = [];
    
    for (const player of data.players) {
      game.players[player.id] = player;
    }
    
    updateStatus('Spel gestart!');
    hideReadySection();
    renderGameBoard();
  });
  
  game.socket.on('players_ready_status', (data) => {
    game.playersReadyStatus = data;
    updateReadyStatus();
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
    // Add shake effect
    const board = document.getElementById('gameBoard');
    board.classList.add('shake');
    setTimeout(() => board.classList.remove('shake'), 300);
    
    // Remove bomb from state
    game.gameState.bombs = game.gameState.bombs.filter(b => b.id !== data.bombId);
    
    // Update grid (remove blocks)
    game.gameState.grid = data.grid;
    
    // Update power-ups
    game.gameState.powerUps = data.powerUps;
    
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
      }
    }
    
    renderGameBoard();
    
    // Clear explosions after 500ms
    setTimeout(() => {
      game.explosions.clear();
      renderGameBoard();
    }, 500);
  });
  
  game.socket.on('powerups_updated', (data) => {
    game.gameState.powerUps = data.powerUps;
    game.gameState.players = data.players;
    renderGameBoard();
    updatePlayersStats();
  });
  
  game.socket.on('game_over', (data) => {
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

function showGameOverModal(message) {
  const modal = document.getElementById('gameOverModal');
  const gameOverMessage = document.getElementById('gameOverMessage');
  gameOverMessage.textContent = message;
  modal.style.display = 'flex';
  
  const restartBtn = document.getElementById('restartBtn');
  if (restartBtn.onclick) {
    // Remove old listener
    const newRestartBtn = restartBtn.cloneNode(true);
    restartBtn.parentNode.replaceChild(newRestartBtn, restartBtn);
  }
  
  document.getElementById('restartBtn').onclick = () => {
    modal.style.display = 'none';
    // Reset and join new game
    game.gameOver = false;
    game.gameStarted = false;
    game.isReady = false;
    game.player = null;
    game.gameState = null;
    game.playersReadyStatus = {};
    game.explosions.clear();
    
    // Join a new game
    game.socket.emit('join_game', {}, (response) => {
      if (response.success) {
        game.player = response.player;
        game.gameId = response.gameId;
        game.gameState = response.game;
        
        updateStatus(`Nieuwe spel: ${game.gameId} (${response.game.players.length}/3)`);
        
        if (!response.game.gameStarted) {
          showReadySection();
        } else {
          hideReadySection();
        }
        
        renderGameBoard();
        startInputHandling();
      }
    });
  };
}

function startInputHandling() {
  document.addEventListener('keydown', (e) => {
    if (game.gameOver || !game.gameStarted) return;
    
    // Get the key with proper case handling for arrow keys
    let key = e.key.toLowerCase();
    const shift = e.shiftKey;
    
    // Map arrow keys to our format
    if (e.key.startsWith('Arrow')) {
      key = 'arrow' + e.key.slice(5).toLowerCase();
    }
    
    // Check if this key is in our controls
    const action = CONTROLS[key];
    
    // Handle the action (works for any player)
    if (action) {
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
      }
      
      // Check for player (render on top of power-up)
      const player = game.gameState.players?.find(p => p.x === x && p.y === y);
      if (player) {
        cell.classList.add('player');
        const playerSprite = document.createElement('div');
        playerSprite.className = `player-sprite p${player.playerNumber}`;
        playerSprite.textContent = player.character || player.playerNumber;
        
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

function toggleReady() {
  if (!game.gameStarted) {
    game.isReady = !game.isReady;
    game.socket.emit('ready');
    updateReadyStatus();
  }
}

function updateReadyStatus() {
  const readyStatusDiv = document.getElementById('readyStatus');
  const readyButton = document.getElementById('readyButton');
  
  if (!readyStatusDiv || !readyButton) return;
  
  readyStatusDiv.innerHTML = '';
  
  if (!game.gameState?.players) return;
  
  for (const player of game.gameState.players) {
    const isReady = game.playersReadyStatus[player.id] || false;
    const indicator = document.createElement('div');
    indicator.className = `ready-indicator ${isReady ? 'ready' : 'not-ready'}`;
    indicator.textContent = `${isReady ? '✓' : '✗'} Speler ${player.playerNumber}`;
    readyStatusDiv.appendChild(indicator);
  }
  
  // Update button appearance
  if (game.isReady) {
    readyButton.classList.add('ready');
    readyButton.textContent = '✓ Klaar!';
  } else {
    readyButton.classList.remove('ready');
    readyButton.textContent = 'Klaar!';
  }
}

function hideReadySection() {
  const readySection = document.getElementById('readySection');
  if (readySection) {
    readySection.style.display = 'none';
  }
}
