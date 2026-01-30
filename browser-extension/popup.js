// Check connection status on load
document.addEventListener('DOMContentLoaded', () => {
  checkConnection();
  
  document.getElementById('connectBtn').addEventListener('click', connect);
  document.getElementById('disconnectBtn').addEventListener('click', disconnect);
});

function checkConnection() {
  chrome.runtime.sendMessage({ action: 'getUserId' }, (response) => {
    if (response.userId) {
      showConnected(response.userId);
    } else {
      showDisconnected();
    }
  });
}

function showConnected(userId) {
  document.getElementById('status').textContent = `Connected as: ${userId.substring(0, 8)}...`;
  document.getElementById('status').className = 'status connected';
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('connectedSection').style.display = 'block';
}

function showDisconnected() {
  document.getElementById('status').textContent = 'Not connected';
  document.getElementById('status').className = 'status disconnected';
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('connectedSection').style.display = 'none';
}

function connect() {
  const userId = document.getElementById('userId').value.trim();
  
  if (!userId) {
    alert('Please enter your User ID');
    return;
  }
  
  chrome.runtime.sendMessage({ action: 'setUserId', userId }, (response) => {
    if (response.success) {
      showConnected(userId);
    }
  });
}

function disconnect() {
  chrome.runtime.sendMessage({ action: 'setUserId', userId: null }, (response) => {
    showDisconnected();
    document.getElementById('userId').value = '';
  });
}