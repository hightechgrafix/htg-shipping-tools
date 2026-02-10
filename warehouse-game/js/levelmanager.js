// HTG Warehouse Game - Level Manager
// Handles loading levels from JSON

const LevelManager = {
  levelData: null,
  currentLevelNumber: 1,
  
  // Load the level JSON file
  async loadLevelData() {
    try {
      const response = await fetch('assets/level_data.json');
      this.levelData = await response.json();
      console.log('Level data loaded:', Object.keys(this.levelData).length, 'levels');
      return true;
    } catch (error) {
      console.error('Failed to load level data:', error);
      return false;
    }
  },
  
  // Get a specific level by number
  getLevel(levelNumber) {
    if (!this.levelData) {
      console.error('Level data not loaded yet');
      return null;
    }
    
    const level = this.levelData[levelNumber.toString()];
    if (!level) {
      console.error('Level not found:', levelNumber);
      return null;
    }
    
    return this.parseLevel(level, levelNumber);
  },
  
  // Parse level data into format Game engine expects
  parseLevel(rawLevel, levelNumber) {
    // Calculate level bounds
    const allX = [];
    const allY = [];
    
    // Gather all coordinates to find bounds
    Object.values(rawLevel.tiles).forEach(tileArray => {
      tileArray.forEach(pos => {
        allX.push(pos.x);
        allY.push(pos.y);
      });
    });
    allX.push(rawLevel.player_start.x);
    allY.push(rawLevel.player_start.y);
    
    const minX = Math.min(...allX);
    const minY = Math.min(...allY);
    const maxX = Math.max(...allX);
    const maxY = Math.max(...allY);
    
    const levelWidth = maxX - minX + 1;
    const levelHeight = maxY - minY + 1;
    
    // Return parsed level
    return {
      number: levelNumber,
      width: levelWidth,
      height: levelHeight,
      offsetX: minX,  // In case levels don't start at 0,0
      offsetY: minY,
      playerStart: {
        x: rawLevel.player_start.x - minX,  // Normalize to 0-based
        y: rawLevel.player_start.y - minY
      },
      walls: rawLevel.tiles.Walls.map(pos => ({
        x: pos.x - minX,
        y: pos.y - minY
      })),
      carts: rawLevel.tiles.Boxes.map(pos => ({
        x: pos.x - minX,
        y: pos.y - minY
      })),
      stagingAreas: rawLevel.tiles.Targets.map(pos => ({
        x: pos.x - minX,
        y: pos.y - minY
      })),
      cartsOnGoals: rawLevel.tiles.TargetBoxes.map(pos => ({
        x: pos.x - minX,
        y: pos.y - minY
      }))
    };
  }
};

// Make LevelManager available globally
window.LevelManager = LevelManager;