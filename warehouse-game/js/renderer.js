// HTG Warehouse Game - Renderer
// Handles loading sprites and drawing to canvas

const Renderer = {
  canvas: null,
  ctx: null,
  sprites: {},
  spritesLoaded: false,
  game: null,
  
  // Initialize the renderer
  init(game) {
    this.game = game;
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    // Load all sprites
    this.loadSprites();
  },
  
  // Load sprite images
  loadSprites() {
    const spriteKeys = Object.keys(CONFIG.SPRITES);
    let loadedCount = 0;
    
    spriteKeys.forEach(key => {
      const img = new Image();
      img.src = CONFIG.SPRITES[key];
      
      img.onload = () => {
        this.sprites[key] = img;
        loadedCount++;
        
        // When all sprites loaded, start the game
        if (loadedCount === spriteKeys.length) {
          this.spritesLoaded = true;
          this.onSpritesLoaded();
        }
      };
      
      img.onerror = () => {
        console.error(`Failed to load sprite: ${CONFIG.SPRITES[key]}`);
      };
    });
  },
  
  // Called when all sprites are loaded
  onSpritesLoaded() {
    document.getElementById('loading').classList.add('hidden');
    this.canvas.classList.remove('hidden');
    
    // Draw the game state
    this.draw();
  },
  
  // Main draw function - called whenever game state changes
  draw() {
    if (!this.game) return;
    
    // Set canvas size based on level
    const canvasSize = CONFIG.calculateCanvasSize(this.game.levelWidth, this.game.levelHeight);
    this.canvas.width = canvasSize.width;
    this.canvas.height = canvasSize.height;
    
    // Clear canvas
    this.ctx.fillStyle = CONFIG.CANVAS_BG;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw header
    this.drawHeader();
    
    // Draw all tiles
    for (let y = 0; y < this.game.levelHeight; y++) {
      for (let x = 0; x < this.game.levelWidth; x++) {
        const tileType = this.game.getTileAt(x, y);
        this.drawTile(tileType, x, y);
      }
    }
    
    // Draw footer
    this.drawFooter();
  },
  
  // Draw a single tile at grid position
  drawTile(tileType, gridX, gridY) {
    const pos = CONFIG.gridToPixel(gridX, gridY);
    
    // Draw floor first (always)
    if (this.sprites.floor) {
      this.ctx.drawImage(this.sprites.floor, pos.x, pos.y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
    }
    
    // Draw tile on top based on type
    let sprite = null;
    
    switch(tileType) {
      case CONFIG.TILES.WALL:
        sprite = this.sprites.wall;
        break;
      case CONFIG.TILES.PLAYER_START:
        sprite = this.sprites.player;
        break;
      case CONFIG.TILES.CART:
        sprite = this.sprites.cart;
        break;
      case CONFIG.TILES.STAGING_AREA:
        sprite = this.sprites.stagingArea;
        break;
      case CONFIG.TILES.CART_ON_GOAL:
        // Draw staging area first, then cart on top
        if (this.sprites.stagingArea) {
          this.ctx.drawImage(this.sprites.stagingArea, pos.x, pos.y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
        }
        sprite = this.sprites.cartOnGoal;
        break;
    }
    
    if (sprite && tileType !== CONFIG.TILES.FLOOR) {
      this.ctx.drawImage(sprite, pos.x, pos.y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
    }
  },
  
  // Draw header UI
  drawHeader() {
    this.ctx.fillStyle = '#2c3e50';
    this.ctx.fillRect(0, 0, this.canvas.width, CONFIG.UI_HEADER_HEIGHT);
    
    this.ctx.fillStyle = '#ecf0f1';
    this.ctx.font = 'bold 24px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('HTG WAREHOUSE GAME', this.canvas.width / 2, 30);
    
    this.ctx.font = '16px Arial';
    const levelText = 'Level ' + this.game.currentLevel + ' | Moves: ' + this.game.moveCount;    this.ctx.fillText(levelText, this.canvas.width / 2, 60);
  },
  
  // Draw footer UI
  drawFooter() {
    const footerY = this.canvas.height - CONFIG.UI_FOOTER_HEIGHT;
    
    this.ctx.fillStyle = '#2c3e50';
    this.ctx.fillRect(0, footerY, this.canvas.width, CONFIG.UI_FOOTER_HEIGHT);
    
    this.ctx.fillStyle = '#ecf0f1';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Arrow Keys: Move | Z: Undo | R: Reset', this.canvas.width / 2, footerY + 30);
    
    // Show how many carts are on goals
    const cartsOnGoals = this.game.carts.filter(cart => this.game.isCartOnGoal(cart)).length;
    const totalCarts = this.game.carts.length;
    this.ctx.fillText(`Carts on Goals: ${cartsOnGoals}/${totalCarts}`, this.canvas.width / 2, footerY + 55);
  }
};

// Don't auto-start renderer anymore - Game will call it

