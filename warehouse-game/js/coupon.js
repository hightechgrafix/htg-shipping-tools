// HTG Warehouse Game - Coupon System
// Handles email collection and coupon generation

// Initialize Supabase client
const supabase = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);

const CouponSystem = {
  // Coupon rewards configuration
  REWARDS: {
    10: {
      discount: '$5 off your order',
      description: 'Congratulations on completing Level 10!'
    },
    40: {
      discount: '$20 off orders $100+',
      description: 'You are a Warehouse Master! 🏆'
    }
  },
  
  // Show the coupon modal for a specific level
  showCouponModal(level) {
    console.log('showCouponModal called with level:', level);
    console.trace(); // Show call stack
    // Pause the game timer
        if (window.Game) {
            Game.pauseTimer();
        }
    const modal = document.getElementById('coupon-modal');
    const title = document.getElementById('modal-title');
    const message = document.getElementById('modal-message');
    const emailForm = document.getElementById('email-form');
    const couponDisplay = document.getElementById('coupon-display');
    
    // Reset modal state
    emailForm.classList.remove('hidden');
    couponDisplay.classList.add('hidden');
    document.getElementById('email-input').value = '';
    document.getElementById('email-error').classList.add('hidden');
    
    // Set content based on level
    if (level === 10) {
    title.textContent = '🎉 Level 10 Complete!';
    message.textContent = 'Great job! Enter your email to claim your $5 reward!';
    } else if (level === 40) {
    title.textContent = '🏆 ALL LEVELS COMPLETE! 🏆';
    
    // Get score from Game object
    const finalScore = window.Game ? Game.finalScore : 0;
    const finalTime = window.Game ? Game.finalTime : 0;
    const totalMoves = window.Game ? Game.totalMoves : 0;
    
    // Format time nicely (MM:SS)
    const minutes = Math.floor(finalTime / 60);
    const seconds = finalTime % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    message.innerHTML = `You're a Warehouse Master!<br><br>
        <strong>Final Score: ${finalScore.toLocaleString()} points</strong><br>
        Total Time: ${timeStr} | Total Moves: ${totalMoves}<br><br>
        Enter your email to claim your $20 reward!`;
    }
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Set up event listeners (remove old ones first)
    const submitBtn = document.getElementById('email-submit');
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
    
    newSubmitBtn.addEventListener('click', () => {
      this.handleEmailSubmit(level);
    });
    
    // Allow Enter key to submit
    const emailInput = document.getElementById('email-input');
    emailInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleEmailSubmit(level);
      }
    });
  },
  
    // Handle email submission
    async handleEmailSubmit(level) {
    const emailInput = document.getElementById('email-input');
    const email = emailInput.value.trim();
    const errorEl = document.getElementById('email-error');
    
    // Validate email
    if (!this.isValidEmail(email)) {
        errorEl.textContent = 'Please enter a valid email address';
        errorEl.classList.remove('hidden');
        return;
    }
    
    // Check if email already claimed this level's reward
    const alreadyClaimed = await this.hasEmailClaimedReward(email, level);
    if (alreadyClaimed) {
        errorEl.textContent = 'This email has already claimed the Level ' + level + ' reward';
        errorEl.classList.remove('hidden');
        return;
    }
    
    // Generate coupon code
    const couponCode = this.generateCouponCode();
    
    // Store the coupon in Supabase
    try {
        await this.storeCoupon(email, level, couponCode);
        
        // Show the coupon
        this.displayCoupon(couponCode, level);
    } catch (error) {
        errorEl.textContent = 'Error saving coupon. Please try again.';
        errorEl.classList.remove('hidden');
        console.error('Failed to store coupon:', error);
    }
    },
  
  // Validate email format
  isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },
  
    // Check if email already claimed this reward
    async hasEmailClaimedReward(email, level) {
    const { data, error } = await supabase
        .from('htg_warehouse_coupons')
        .select('id')
        .eq('email', email)
        .eq('level', level)
        .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error checking email:', error);
    }
    
    return data !== null;
    },
  
  // Generate a random coupon code
  generateCouponCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars
    let code = 'HTG-';
    for (let i = 0; i < 7; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  },
  
    // Store coupon in Supabase
    async storeCoupon(email, level, couponCode) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    
    const { data, error } = await supabase
        .from('htg_warehouse_coupons')
        .insert([
        {
            email: email,
            level: level,
            code: couponCode,
            discount: this.REWARDS[level].discount,
            expires_at: expiresAt.toISOString(),
            redeemed: false
        }
        ])
        .select()
        .single();
    
    if (error) {
        console.error('Error storing coupon:', error);
        throw error;
    }
    
    console.log('Coupon stored in Supabase:', data);
    return data;
    },
  
  // Display the coupon to the user
  displayCoupon(couponCode, level) {
    const emailForm = document.getElementById('email-form');
    const couponDisplay = document.getElementById('coupon-display');
    const codeEl = document.getElementById('coupon-code');
    const detailsEl = document.getElementById('coupon-details');
    
    // Hide email form, show coupon
    emailForm.classList.add('hidden');
    document.getElementById('modal-message').classList.add('hidden'); // Hide the message too
    couponDisplay.classList.remove('hidden');
    
    // Set coupon code
    codeEl.textContent = couponCode;
    
    // Set details
    const reward = this.REWARDS[level];
    detailsEl.textContent = reward.discount;
    
    // Set up continue button
    const continueBtn = document.getElementById('continue-button');
    const newContinueBtn = continueBtn.cloneNode(true);
    continueBtn.parentNode.replaceChild(newContinueBtn, continueBtn);

    // Change button text based on level
    if (level === 40) {
    newContinueBtn.textContent = 'View Leaderboard';
    } else {
    newContinueBtn.textContent = 'Continue Playing';
    }

    newContinueBtn.addEventListener('click', () => {
    this.closeCouponModal();
    
    // If level 40, show leaderboard (we'll build this next)
    if (level === 40) {
        // TODO: Show leaderboard
        console.log('Show leaderboard!');
    }
    });
  },
  
 // Close the modal
    closeCouponModal() {
    const modal = document.getElementById('coupon-modal');
    modal.classList.add('hidden');
    
        // Resume the game timer
        if (window.Game) {
            Game.resumeTimer();
        }
    }
};

// Make available globally
window.CouponSystem = CouponSystem;