// HTG Warehouse Game - Admin Panel
// For sales team to verify and redeem coupons

// Initialize Supabase client
const supabase = window.supabase.createClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.anonKey
);

const Admin = {
  // Search coupon by code
  async searchByCode(code) {
    const resultsDiv = document.getElementById('code-results');
    resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
    
    try {
      const { data, error } = await supabase
        .from('htg_warehouse_coupons')
        .select('*')
        .eq('code', code.toUpperCase().trim())
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          resultsDiv.innerHTML = '<div class="no-results">No coupon found with that code.</div>';
        } else {
          throw error;
        }
        return;
      }
      
      resultsDiv.innerHTML = this.renderCoupon(data);
      this.attachRedeemHandler(data.id);
      
    } catch (error) {
      console.error('Error searching by code:', error);
      resultsDiv.innerHTML = '<div class="error-message">Error searching. Please try again.</div>';
    }
  },
  
  // Search coupons by email
  async searchByEmail(email) {
    const resultsDiv = document.getElementById('email-results');
    resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
    
    try {
      const { data, error } = await supabase
        .from('htg_warehouse_coupons')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data.length === 0) {
        resultsDiv.innerHTML = '<div class="no-results">No coupons found for this email address.</div>';
        return;
      }
      
      let html = '<h3 style="margin-bottom: 15px;">Found ' + data.length + ' coupon(s)</h3>';
      data.forEach(coupon => {
        html += this.renderCoupon(coupon);
      });
      
      resultsDiv.innerHTML = html;
      
      // Attach redeem handlers for all coupons
      data.forEach(coupon => {
        this.attachRedeemHandler(coupon.id);
      });
      
    } catch (error) {
      console.error('Error searching by email:', error);
      resultsDiv.innerHTML = '<div class="error-message">Error searching. Please try again.</div>';
    }
  },
  
  // Render a coupon card
  renderCoupon(coupon) {
    const now = new Date();
    const expiresAt = new Date(coupon.expires_at);
    const isExpired = now > expiresAt;
    const isRedeemed = coupon.redeemed;
    
    let status = 'active';
    let statusText = 'ACTIVE';
    if (isRedeemed) {
      status = 'redeemed';
      statusText = 'REDEEMED';
    } else if (isExpired) {
      status = 'expired';
      statusText = 'EXPIRED';
    }
    
    const createdDate = new Date(coupon.created_at).toLocaleString();
    const expiresDate = expiresAt.toLocaleString();
    const redeemedDate = coupon.redeemed_at ? new Date(coupon.redeemed_at).toLocaleString() : 'N/A';
    
    return `
      <div class="result-card ${status}">
        <div class="coupon-code">
          ${coupon.code}
          <span class="status-badge ${status}">${statusText}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Email:</span>
          ${coupon.email}
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Discount:</span>
          ${coupon.discount}
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Level Earned:</span>
          Level ${coupon.level}
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Created:</span>
          ${createdDate}
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Expires:</span>
          ${expiresDate}
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Redeemed:</span>
          ${redeemedDate}
        </div>
        
        ${!isRedeemed && !isExpired ? `
          <button class="redeem-btn" data-coupon-id="${coupon.id}">
            Mark as Redeemed
          </button>
        ` : ''}
      </div>
    `;
  },
  
  // Attach click handler to redeem button
  attachRedeemHandler(couponId) {
    setTimeout(() => {
      const btn = document.querySelector(`[data-coupon-id="${couponId}"]`);
      if (btn) {
        btn.addEventListener('click', () => this.redeemCoupon(couponId));
      }
    }, 100);
  },
  
  // Mark coupon as redeemed
  async redeemCoupon(couponId) {
    if (!confirm('Mark this coupon as redeemed?')) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('htg_warehouse_coupons')
        .update({
          redeemed: true,
          redeemed_at: new Date().toISOString()
        })
        .eq('id', couponId);
      
      if (error) throw error;
      
      alert('Coupon marked as redeemed!');
      
      // Refresh the search to show updated status
      const codeInput = document.getElementById('code-search-input').value;
      const emailInput = document.getElementById('email-search-input').value;
      
      if (codeInput) {
        this.searchByCode(codeInput);
      } else if (emailInput) {
        this.searchByEmail(emailInput);
      }
      
    } catch (error) {
      console.error('Error redeeming coupon:', error);
      alert('Error marking coupon as redeemed. Please try again.');
    }
  }
};

// Set up event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Code search
  document.getElementById('code-search-btn').addEventListener('click', () => {
    const code = document.getElementById('code-search-input').value.trim();
    if (code) {
      Admin.searchByCode(code);
    }
  });
  
  document.getElementById('code-search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const code = document.getElementById('code-search-input').value.trim();
      if (code) {
        Admin.searchByCode(code);
      }
    }
  });
  
  // Email search
  document.getElementById('email-search-btn').addEventListener('click', () => {
    const email = document.getElementById('email-search-input').value.trim();
    if (email) {
      Admin.searchByEmail(email);
    }
  });
  
  document.getElementById('email-search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const email = document.getElementById('email-search-input').value.trim();
      if (email) {
        Admin.searchByEmail(email);
      }
    }
  });
});