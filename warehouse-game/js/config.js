// HTG Warehouse Game - Configuration
// Change TILE_SIZE here to resize entire game

const CONFIG = {
  // === CORE SETTINGS ===
  TILE_SIZE: 48, // Change this one value to resize everything!
  
  // === TILE TYPES (from level JSON) ===
  TILES: {
    FLOOR: 0,
    WALL: 1,
    PLAYER_START: 2,
    CART: 3,
    STAGING_AREA: 4,
    CART_ON_GOAL: 5
  },
  
  // === SPRITE PATHS ===
  SPRITES: {
    player: 'assets/sprites/player.png',
    cart: 'assets/sprites/cart.png',
    cartOnGoal: 'assets/sprites/cart_on_goal.png',
    stagingArea: 'assets/sprites/staging_area.png',
    wall: 'assets/sprites/wall.png',
    floor: 'assets/sprites/floor.png'
  },
  
  // === UI DIMENSIONS ===
  UI_HEADER_HEIGHT: 80,
  UI_FOOTER_HEIGHT: 70,
  GRID_PADDING: 10,
  
  // === CANVAS BACKGROUND ===
  CANVAS_BG: '#2c3e50',
  
  //Supabase config
  SUPABASE_URL: 'https://sbfslzwnkztmodnlsigq.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZnNsendua3p0bW9kbmxzaWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3OTQ5NTgsImV4cCI6MjA3ODM3MDk1OH0.ebZ1IvA5FQN7EhIcluJvw3OqMFU4Czkhin_ffTPx9vg'

  // Helper: Calculate canvas size for a level
  calculateCanvasSize(levelWidth, levelHeight) {
    const gameWidth = levelWidth * this.TILE_SIZE + (this.GRID_PADDING * 2);
    const gameHeight = levelHeight * this.TILE_SIZE + (this.GRID_PADDING * 2);
    const totalHeight = gameHeight + this.UI_HEADER_HEIGHT + this.UI_FOOTER_HEIGHT;
    
    return {
      width: gameWidth,
      height: totalHeight,
      gameAreaHeight: gameHeight
    };
  },
  
  // Helper: Convert grid coordinates to pixel coordinates
  gridToPixel(gridX, gridY) {
    return {
      x: this.GRID_PADDING + (gridX * this.TILE_SIZE),
      y: this.UI_HEADER_HEIGHT + this.GRID_PADDING + (gridY * this.TILE_SIZE)
    };
  }
};
