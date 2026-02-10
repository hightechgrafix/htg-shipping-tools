// HTG Warehouse Game - Game Engine
// Handles game state, movement, pushing, and win conditions

const Game = {
  // Game state
  level: null,
  playerPos: { x: 0, y: 0 },
  carts: [], // Array of {x, y}
  walls: [], // Array of {x, y}
  stagingAreas: [], // Array of {x, y}
  moveHistory: [], // For undo functionality
  moveCount: 0,
  levelWidth: 0,
  levelHeight: 0,
  
  // Initialize game with a test level
  init() {
    this.loadTestLevel();
    this.setupControls();
    Renderer.init(this);
  },
  
  // Create a simple test level
  loadTestLevel() {
    this.levelWidth = 8;
    this.levelHeight = 8;
    
    // Set player start position
    this.playerPos = { x: 4, y: 4 };
    
    // Create walls around border
    this.walls = [];
    for (let x = 0; x < this.levelWidth; x++) {
      this.walls.push({ x, y: 0 });
      this.walls.push({ x, y: this.levelHeight - 1 });
    }
    for (let y = 1; y < this.levelHeight - 1; y++) {
      this.walls.push({ x: 0, y });
      this.walls.push({ x: this.levelWidth - 1, y });
    }
    
    // Add some internal walls
    this.walls.push({ x: 2, y: 2 });
    this.walls.push({ x: 2, y: 3 });
    
    // Create carts
    this.carts = [
      { x: 3, y: 3 },
      { x: 5, y: 3 }
    ];
    
    // Create staging areas (goals)
    this.stagingAreas = [
      { x: 3, y: 6 },
      { x: 5, y: 6 }
    ];
    
    this.moveCount = 0;
    this.moveHistory = [];
  },
  
  // Set up keyboard controls
  setupControls() {
    document.addEventListener('keydown', (e) => {
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
    
    // Redraw
    Renderer.draw();
    
    // Check win condition
    if (this.checkWin()) {
      setTimeout(() => {
        alert('Level Complete! 🎉\nMoves: ' + this.moveCount);
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
    this.loadTestLevel();
    Renderer.draw();
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

// Start the game when page loads
window.addEventListener('DOMContentLoaded', () => {
  Game.init();
});
