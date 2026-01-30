let currentConfig = {};

window.electronAPI.onLoadConfig((config) => {
  currentConfig = config;
  document.getElementById('userId').value = config.userId || '';
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const userId = document.getElementById('userId').value.trim();

  if (!userId) {
    showStatus('Please enter a User ID', 'error');
    return;
  }

  const newConfig = { userId };
  const result = await window.electronAPI.saveConfig(newConfig);

  if (result.success) {
    showStatus('Settings saved successfully! Monitoring is now active.', 'success');
  } else {
    showStatus('Failed to save settings', 'error');
  }
});

function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
}