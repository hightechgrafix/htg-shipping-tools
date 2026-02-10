// HTG Warehouse Game - Game Engine
// Handles game state, movement, pushing, and win conditions
//force sync

const Game = {
  // Game state
  level: null,
  playerPos: { x: 0, y: 0 },
  carts: [], // Array of {x, y}
  walls: [], // Array of {x, y}
  stagingAreas: [], // Array of {x, y}
  moveHistory: [], // For undo functionality
  moveCount: 0,
  moveHistory: [], // For undo functionality
  moveCount: 0,
  totalMoves: 0, // Total moves across all levels
  gameStartTime: null, // When Level 1 started
  totalPausedTime: 0, // Accumulated paused time in milliseconds
  currentPauseStart: null, // When current pause started
  isTimerPaused: false, // Is timer currently paused
  levelWidth: 0,
  levelHeight: 0,
  levelWidth: 0,
  levelHeight: 0,
  
  // Initialize game
  async init() {
    // Load level data first
    const loaded = await LevelManager.loadLevelData();
    if (!loaded) {
      console.error('Failed to load level data');
      return;
    }
    
    // Load level 1
    await this.loadLevel(1);
    
    this.setupControls();
    Renderer.init(this);
  },
  
 // Load level from JSON
  async loadLevel(levelNumber) {
    const levelData = LevelManager.getLevel(levelNumber);
    
    if (!levelData) {
      console.error('Could not load level:', levelNumber);
      return false;
    }
    
    this.currentLevel = levelNumber;
    this.currentLevel = levelNumber;
  
    // Start timer when loading Level 1
    if (levelNumber === 1 && this.gameStartTime === null) {
      this.gameStartTime = Date.now();
      console.log('Game timer started!');
    }
  
  this.levelWidth = levelData.width;
    this.levelWidth = levelData.width;
    this.levelHeight = levelData.height;
    this.playerPos = { ...levelData.playerStart };
    this.walls = levelData.walls.map(w => ({...w}));
    this.carts = levelData.carts.map(c => ({...c}));
    this.stagingAreas = levelData.stagingAreas.map(s => ({...s}));
    this.moveCount = 0;
    this.moveHistory = [];
    
    console.log(`Level ${levelNumber} loaded: ${this.levelWidth}x${this.levelHeight}`);
    console.log('Carts:', this.carts);
    console.log('Staging areas:', this.stagingAreas);
    console.log('Win check:', this.checkWin()); 
    return true;
  },
  
  // Set up keyboard controls
  setupControls() {
    document.addEventListener('keydown', (e) => {
      // Don't process game controls if modal is open
      const modal = document.getElementById('coupon-modal');
      if (modal && !modal.classList.contains('hidden')) {
        return; // Modal is open, ignore game controls
      }
    
    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          this.movePlayer(0, -1);
          e.preventDefault();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          this.movePlayer(0, 1);
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          this.movePlayer(-1, 0);
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          this.movePlayer(1, 0);
          e.preventDefault();
          break;
        case 'z':
        case 'Z':
          this.undo();
          e.preventDefault();
          break;
        case 'r':
        case 'R':
          this.reset();
          e.preventDefault();
          break;
        case 'l':
        case 'L':
          // Press L to prompt for level number
          const levelInput = prompt('Jump to level (1-40):');
          if (levelInput) {
            const levelNum = parseInt(levelInput);
            this.skipToLevel(levelNum);
          }
          e.preventDefault();
          break; 
          case 'x':
          case 'X':
            // Press Shift+X to instantly win the level (for testing)
            if (e.shiftKey) {
              console.log('Instant win cheat activated!');
              this.handleLevelComplete();
              e.preventDefault();
            }
            break;
        }
    });
  },
  
  // Attempt to move player in direction
  movePlayer(dx, dy) {
    const newX = this.playerPos.x + dx;
    const newY = this.playerPos.y + dy;
    
    // Check if new position is a wall
    if (this.isWall(newX, newY)) {
      return; // Can't move into walls
    }
    
    // Check if new position has a cart
    const cartIndex = this.findCartAt(newX, newY);
    if (cartIndex !== -1) {
      // Try to push the cart
      if (!this.pushCart(cartIndex, dx, dy)) {
        return; // Couldn't push cart, don't move
      }
    }
    
    // Save state for undo
    this.saveState();
    
    // Move player
    this.playerPos.x = newX;
    this.playerPos.y = newY;
    this.moveCount++;
    this.totalMoves++;
    
    // Redraw
    Renderer.draw();
    
    // Check win condition
    if (this.checkWin()) {
      setTimeout(() => {
        this.handleLevelComplete();
      }, 100);
    }
    
  },
  
  // Try to push a cart
  pushCart(cartIndex, dx, dy) {
    const cart = this.carts[cartIndex];
    const newX = cart.x + dx;
    const newY = cart.y + dy;
    
    // Check if new position is valid
    if (this.isWall(newX, newY)) {
      return false; // Can't push into wall
    }
    
    if (this.findCartAt(newX, newY) !== -1) {
      return false; // Can't push into another cart
    }
    
    // Push the cart
    cart.x = newX;
    cart.y = newY;
    
    return true;
  },
  
  // Check if position is a wall
  isWall(x, y) {
    return this.walls.some(wall => wall.x === x && wall.y === y);
  },
  
  // Find cart at position (returns index or -1)
  findCartAt(x, y) {
    return this.carts.findIndex(cart => cart.x === x && cart.y === y);
  },
  
  // Check if cart is on a staging area
  isCartOnGoal(cart) {
    return this.stagingAreas.some(goal => goal.x === cart.x && goal.y === cart.y);
  },
  
  // Check if all carts are on staging areas (win condition)
  checkWin() {
    return this.carts.every(cart => this.isCartOnGoal(cart));
  },

  // Handle level completion
  handleLevelComplete() {
    console.log('handleLevelComplete called! Current level:', this.currentLevel);
    console.trace(); // This will show us WHERE it was called from
    
    // Check if this is Level 40 (game complete!)
    if (this.currentLevel === 40) {
      // Calculate final score
      const elapsedSeconds = this.getElapsedTime();
      const timeBonus = Math.max(0, 120 - elapsedSeconds);
      const score = (40 * 10000) + timeBonus - (this.totalMoves * 10);
      
      console.log('=== GAME COMPLETE ===');
      console.log('Total Time:', elapsedSeconds, 'seconds');
      console.log('Total Moves:', this.totalMoves);
      console.log('Time Bonus:', timeBonus);
      console.log('Final Score:', score);
      
      // Store score for leaderboard submission
      this.finalScore = score;
      this.finalTime = elapsedSeconds;
      
      // Show coupon modal
      CouponSystem.showCouponModal(this.currentLevel);
    }
    // Check if this is Level 10
    else if (this.currentLevel === 10) {
      // Show coupon modal
      CouponSystem.showCouponModal(this.currentLevel);
      
      // After they close the modal, they can continue to Level 11
    }
    // Regular level completion (not a coupon level)
    else {
      alert('Level ' + this.currentLevel + ' Complete! 🎉\nMoves: ' + this.moveCount);
      
      // Load next level
      if (this.currentLevel < 40) {
        this.loadLevel(this.currentLevel + 1);
        Renderer.draw();
      }
    }
  },
  
  // Save current state for undo
  saveState() {
    this.moveHistory.push({
      playerPos: { ...this.playerPos },
      carts: this.carts.map(cart => ({ ...cart })),
      moveCount: this.moveCount
    });
  },
  
  // Undo last move
  undo() {
    if (this.moveHistory.length === 0) {
      return; // Nothing to undo
    }
    
    const lastState = this.moveHistory.pop();
    this.playerPos = lastState.playerPos;
    this.carts = lastState.carts;
    this.moveCount = lastState.moveCount;
    
    Renderer.draw();
  },
  
  // Reset level to starting state
  reset() {
    this.moveHistory = [];
    this.loadLevel(this.currentLevel);
    Renderer.draw();
  },

  // Pause the game timer (when modal opens)
  pauseTimer() {
    if (!this.isTimerPaused && this.gameStartTime !== null) {
      this.currentPauseStart = Date.now();
      this.isTimerPaused = true;
      console.log('Timer paused');
    }
  },

  // Resume the game timer (when modal closes)
  resumeTimer() {
    if (this.isTimerPaused && this.currentPauseStart !== null) {
      const pauseDuration = Date.now() - this.currentPauseStart;
      this.totalPausedTime += pauseDuration;
      this.isTimerPaused = false;
      this.currentPauseStart = null;
      console.log('Timer resumed, paused for', pauseDuration, 'ms');
    }
  },

  // Get elapsed game time (excluding paused time)
  getElapsedTime() {
    if (this.gameStartTime === null) return 0;
    
    const now = Date.now();
    let elapsed = now - this.gameStartTime - this.totalPausedTime;
    
    // If currently paused, don't count the current pause
    if (this.isTimerPaused && this.currentPauseStart !== null) {
      elapsed -= (now - this.currentPauseStart);
    }
    
    return Math.floor(elapsed / 1000); // Return in seconds
  },
    
  //-------------------------------------------------------
  // Skip to a specific level (for testing)
  skipToLevel(levelNumber) {
    if (levelNumber < 1 || levelNumber > 40) {
      console.log('Level must be between 1 and 40');
      return;
    }
    
    this.loadLevel(levelNumber);
    Renderer.draw();
    console.log('Skipped to level', levelNumber);
  },

  // Get tile type at position (for rendering)
  getTileAt(x, y) {
    // Check player
    if (this.playerPos.x === x && this.playerPos.y === y) {
      return CONFIG.TILES.PLAYER_START;
    }
    
    // Check carts
    const cartIndex = this.findCartAt(x, y);
    if (cartIndex !== -1) {
      // Check if cart is on goal
      if (this.isCartOnGoal(this.carts[cartIndex])) {
        return CONFIG.TILES.CART_ON_GOAL;
      }
      return CONFIG.TILES.CART;
    }
    
    // Check walls
    if (this.isWall(x, y)) {
      return CONFIG.TILES.WALL;
    }
    
    // Check staging areas
    if (this.stagingAreas.some(goal => goal.x === x && goal.y === y)) {
      return CONFIG.TILES.STAGING_AREA;
    }
    
    // Default to floor
    return CONFIG.TILES.FLOOR;
  }
};

// Make Game available globally
window.Game = Game;

// Start the game when page loads
window.addEventListener('DOMContentLoaded', () => {
  Game.init();
});