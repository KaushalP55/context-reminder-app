const { ipcRenderer } = require('electron');

let currentConfig = {};

// Load config when page loads
window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.invoke('get-config').then((config) => {
    currentConfig = config;
    document.getElementById('userId').value = config.userId || '';
    updateStatus(config.userId);
  });
});

// Also listen for config from main process
ipcRenderer.on('load-config', (event, config) => {
  currentConfig = config;
  document.getElementById('userId').value = config.userId || '';
  updateStatus(config.userId);
});

// Update status card
function updateStatus(userId) {
  const statusCard = document.getElementById('statusCard');
  const statusTitle = document.getElementById('statusTitle');
  const statusSubtitle = document.getElementById('statusSubtitle');
  const statusIcon = statusCard.querySelector('.status-icon');
  
  if (userId) {
    statusCard.classList.remove('disconnected');
    statusIcon.textContent = '✓';
    statusTitle.textContent = 'Connected';
    statusSubtitle.textContent = `User ID: ${userId.slice(0, 8)}...${userId.slice(-4)}`;
  } else {
    statusCard.classList.add('disconnected');
    statusIcon.textContent = '⏳';
    statusTitle.textContent = 'Not Connected';
    statusSubtitle.textContent = 'Enter your User ID to get started';
  }
}

// Show success message
function showSuccess() {
  const msg = document.getElementById('successMessage');
  msg.classList.add('show');
  setTimeout(() => {
    msg.classList.remove('show');
  }, 3000);
}

// Save settings
document.getElementById('saveBtn').addEventListener('click', async () => {
  const userId = document.getElementById('userId').value.trim();
  
  if (!userId) {
    alert('Please enter your User ID');
    return;
  }
  
  // Basic UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    alert('Please enter a valid User ID (UUID format)');
    return;
  }
  
  const result = await ipcRenderer.invoke('save-config', {
    userId,
    checkInterval: 500 // Fixed at 500ms
  });
  
  if (result.success) {
    currentConfig.userId = userId;
    updateStatus(userId);
    showSuccess();
  }
});

// Allow Enter key to save
document.getElementById('userId').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('saveBtn').click();
  }
});