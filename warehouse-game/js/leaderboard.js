// HTG Warehouse Game - Leaderboard System
// Handles score submission and leaderboard display

const Leaderboard = {
  // Submit score to leaderboard via API
  async submitScore(playerName, email, score, totalMoves, totalTime) {
    try {
      const response = await fetch('/api/game/submit-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: playerName,
          email: email,
          score: score,
          total_moves: totalMoves,
          total_time: totalTime,
          levels_completed: 40
        })
      });
      
      const json = await response.json();
      
      if (!response.ok) {
        console.error('Error submitting score:', json.error);
        throw new Error(json.error || 'Failed to submit score');
      }
      
      console.log('Score submitted to leaderboard:', json.row);
      return json.row;
    } catch (error) {
      console.error('Failed to submit score:', error);
      throw error;
    }
  },
  
  // Fetch top 10 scores via API
  async fetchTopScores() {
    try {
      const response = await fetch('/api/game/top-scores', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const json = await response.json();
      
      if (!response.ok) {
        console.error('Error fetching leaderboard:', json.error);
        throw new Error(json.error || 'Failed to fetch leaderboard');
      }
      
      return json.scores;
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
      throw error;
    }
  },
    
  // Display leaderboard modal
  async showLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    const loading = document.getElementById('leaderboard-loading');
    const content = document.getElementById('leaderboard-content');
    const tbody = document.getElementById('leaderboard-body');
    
    // Show modal with loading state
    modal.classList.remove('hidden');
    loading.classList.remove('hidden');
    content.classList.add('hidden');
    
    // Fetch scores
    try {
      const scores = await this.fetchTopScores();
      
      // Build table rows
      tbody.innerHTML = '';
      scores.forEach((score, index) => {
        const row = document.createElement('tr');
        
        // Format time as MM:SS
        const minutes = Math.floor(score.total_time / 60);
        const seconds = score.total_time % 60;
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Format date
        const date = new Date(score.completed_at);
        const dateStr = date.toLocaleDateString();
        
        row.innerHTML = `
          <td>${index + 1}</td>
          <td>${this.escapeHtml(score.player_name)}</td>
          <td><strong>${score.score.toLocaleString()}</strong></td>
          <td>${score.total_moves}</td>
          <td>${timeStr}</td>
          <td>${dateStr}</td>
        `;
        
        tbody.appendChild(row);
      });
      
        // Add "Play Again" button if not already there
        if (!document.getElementById('play-again-btn')) {
        const playAgainBtn = document.createElement('button');
        playAgainBtn.id = 'play-again-btn';
        playAgainBtn.textContent = 'Play Again from Level 1';
        playAgainBtn.style.cssText = 'padding: 12px 30px; font-size: 16px; background: #27ae60; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-right: 10px;';
        
        playAgainBtn.addEventListener('click', () => {
            this.closeLeaderboard();
            if (window.Game) {
            Game.resetGame();
            }
        });
        
        document.getElementById('close-leaderboard-btn').parentNode.insertBefore(playAgainBtn, document.getElementById('close-leaderboard-btn'));
        }
      
      // Show content, hide loading
      loading.classList.add('hidden');
      content.classList.remove('hidden');
      
    } catch (error) {
      loading.innerHTML = '<p style="color: #e74c3c;">Failed to load leaderboard. Please try again.</p>';
    }
  },
  
  // Close leaderboard modal
  closeLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    modal.classList.add('hidden');
  },
  
  // Escape HTML to prevent XSS
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Set up close button listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('close-leaderboard')?.addEventListener('click', () => {
    Leaderboard.closeLeaderboard();
  });
  
  document.getElementById('close-leaderboard-btn')?.addEventListener('click', () => {
    Leaderboard.closeLeaderboard();
  });
});

// Make available globally
window.Leaderboard = Leaderboard;