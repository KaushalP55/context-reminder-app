const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const activeWin = require('active-win');
const notifier = require('node-notifier');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { exec } = require('child_process');

// ============================================
// CONFIGURATION
// ============================================

// Handle dotenv for both development and packaged app
const isDev = !app.isPackaged;
let envLoaded = false;

if (isDev) {
  require('dotenv').config();
  envLoaded = true;
} else {
  // Try multiple locations for .env in packaged app
  const possiblePaths = [
    path.join(process.resourcesPath, '.env'),
    path.join(process.resourcesPath, 'app', '.env'),
    path.join(path.dirname(process.execPath), '.env'),
    path.join(app.getPath('userData'), '.env'),
    path.join(process.env.APPDATA || '', 'context-reminder-desktop', '.env')
  ];
  
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      console.log('Loaded .env from:', envPath);
      envLoaded = true;
      break;
    }
  }
  
  if (!envLoaded) {
    console.error('Could not find .env file. Checked:', possiblePaths);
  }
}

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const APP_CACHE_PATH = path.join(app.getPath('userData'), 'app-cache.json');
const APP_MAPPING_PATH = path.join(app.getPath('userData'), 'app-mapping.json');
const SUPABASE_URL = 'https://rkkkiwspfygaxntgvcfz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let tray = null;
let settingsWindow = null;
let monitoringInterval = null;
let config = { userId: null, checkInterval: 500, lastApp: null };
let appCache = {}; // Maps display names to process names
let appMapping = {}; // Maps process names to display names AND vice versa
let installedApps = []; // Cache of installed apps

// ============================================
// REMINDER POPUP (bypasses Do Not Disturb)
// ============================================
function showReminderPopup(message) {
  // Play a sound using PowerShell (works even in DND)
  const { exec } = require('child_process');
  exec('powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\Alarm02.wav\').PlaySync()"');
  
  const popup = new BrowserWindow({
    width: 420,
    height: 160,
    x: require('electron').screen.getPrimaryDisplay().workAreaSize.width - 440,
    y: 20,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    transparent: true,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Flash the taskbar
  popup.flashFrame(true);
  
  // Bring to front
  popup.setAlwaysOnTop(true, 'screen-saver');
  popup.show();
  popup.focus();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: transparent;
        }
        .popup {
          background: #FFFFFF;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(59, 130, 246, 0.1);
          animation: slideIn 0.3s ease-out;
          border-left: 4px solid #3B82F6;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .icon-wrapper {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
        .icon { font-size: 22px; }
        .title {
          font-size: 16px;
          font-weight: 700;
          color: #1E293B;
        }
        .subtitle {
          font-size: 12px;
          color: #64748B;
        }
        .message {
          font-size: 17px;
          line-height: 1.5;
          color: #334155;
          padding: 12px 16px;
          background: #F1F5F9;
          border-radius: 10px;
        }
      </style>
    </head>
    <body>
      <div class="popup">
        <div class="header">
          <div class="icon-wrapper">
            <span class="icon">🔔</span>
          </div>
          <div>
            <div class="title">Reminder</div>
            <div class="subtitle">Context Reminder</div>
          </div>
        </div>
        <div class="message">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>
      <script>
        setTimeout(() => window.close(), 15000);
      </script>
    </body>
    </html>
  `;

  popup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  
  // Auto-close after 15 seconds
  setTimeout(() => {
    if (!popup.isDestroyed()) popup.close();
  }, 15000);
}

// ============================================
// SUPABASE CLIENT
// ============================================
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// CONFIG MANAGEMENT
// ============================================
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
      console.log('Config loaded, userId:', config.userId ? config.userId.slice(0, 8) + '...' : 'not set');
    }
  } catch (e) {
    console.error('Error loading config:', e.message);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Error saving config:', e.message);
  }
}

function loadAppCache() {
  try {
    if (fs.existsSync(APP_CACHE_PATH)) {
      appCache = JSON.parse(fs.readFileSync(APP_CACHE_PATH, 'utf8'));
      console.log('App cache loaded:', Object.keys(appCache).length, 'mappings');
    }
  } catch (e) {
    console.error('Error loading app cache:', e.message);
  }
}

function saveAppCache() {
  try {
    fs.writeFileSync(APP_CACHE_PATH, JSON.stringify(appCache, null, 2));
  } catch (e) {
    console.error('Error saving app cache:', e.message);
  }
}

function loadAppMapping() {
  try {
    if (fs.existsSync(APP_MAPPING_PATH)) {
      appMapping = JSON.parse(fs.readFileSync(APP_MAPPING_PATH, 'utf8'));
      console.log('App mapping loaded:', Object.keys(appMapping).length, 'mappings');
    }
  } catch (e) {
    console.error('Error loading app mapping:', e.message);
  }
}

function saveAppMapping() {
  try {
    fs.writeFileSync(APP_MAPPING_PATH, JSON.stringify(appMapping, null, 2));
  } catch (e) {
    console.error('Error saving app mapping:', e.message);
  }
}

// Try to find a matching installed app for a process name
function findMatchingInstalledApp(processName) {
  const processLower = processName.toLowerCase();
  const processNorm = processLower.replace(/[^a-z0-9]/g, '');
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const app of installedApps) {
    const appLower = app.name.toLowerCase();
    const appNorm = appLower.replace(/[^a-z0-9]/g, '');
    const appWords = appLower.split(/\s+/);
    
    let score = 0;
    
    // Exact normalized match (highest priority)
    if (processNorm === appNorm) {
      return app.name; // Perfect match
    }
    
    // Check if process name matches initials of app name
    // e.g., "LGHUB" matches "Logitech G HUB" (L-G-HUB)
    const initials = appWords.map(w => w.replace(/[^a-z0-9]/gi, '')).join('');
    if (initials.toLowerCase() === processNorm) {
      score = 90;
    }
    
    // Check if all letters of process name appear in order in app name
    // e.g., "LGHUB" -> L...G...HUB in "Logitech G HUB"
    if (score === 0) {
      let idx = 0;
      for (const char of processLower) {
        const foundIdx = appLower.indexOf(char, idx);
        if (foundIdx >= idx) {
          idx = foundIdx + 1;
        } else {
          idx = -1;
          break;
        }
      }
      if (idx > 0 && processNorm.length >= 3) {
        score = 70 + (processNorm.length / appNorm.length) * 20;
      }
    }
    
    // Check if app name starts with process name
    // e.g., "EA" matches "EA App"
    if (score === 0 && appLower.startsWith(processLower + ' ')) {
      score = 85;
    }
    
    // Check if first word of app matches process name exactly
    if (score === 0 && appWords[0] === processLower) {
      score = 80;
    }
    
    // Penalize very short matches to avoid false positives
    if (processNorm.length <= 2 && score < 80) {
      score = 0; // Too short and not a strong match
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = app.name;
    }
  }
  
  return bestScore >= 70 ? bestMatch : null;
}

// Learn mapping when user opens an app
function learnAppMapping(processName) {
  const processKey = processName.toLowerCase();
  
  // Skip if already mapped
  if (appMapping[processKey]) return;
  
  // Skip system processes
  const skipList = ['explorer', 'searchhost', 'windows explorer', 'windows shell experience host'];
  if (skipList.some(s => processKey.includes(s))) return;
  
  const matchedApp = findMatchingInstalledApp(processName);
  if (matchedApp) {
    const appKey = matchedApp.toLowerCase();
    
    // Store bidirectional mapping
    appMapping[processKey] = matchedApp;
    appMapping[appKey] = processName;
    
    console.log(`[Learned mapping] "${matchedApp}" <-> "${processName}"`);
    saveAppMapping();
  }
}

// ============================================
// APP NAME MATCHING (uses learned mappings)
// ============================================
function normalizeForMatch(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/gi, '');
}

function appNamesMatch(triggerApp, currentApp) {
  if (!triggerApp || !currentApp) return false;
  
  const t = triggerApp.toLowerCase().trim();
  const c = currentApp.toLowerCase().trim();
  
  // Exact match
  if (t === c) return true;
  
  // Check learned mappings first
  const mappedTrigger = appMapping[t];
  const mappedCurrent = appMapping[c];
  
  if (mappedTrigger && mappedTrigger.toLowerCase() === c) return true;
  if (mappedCurrent && mappedCurrent.toLowerCase() === t) return true;
  if (mappedTrigger && mappedCurrent && mappedTrigger.toLowerCase() === mappedCurrent.toLowerCase()) return true;
  
  // Normalized match (remove all non-alphanumeric)
  const tNorm = normalizeForMatch(triggerApp);
  const cNorm = normalizeForMatch(currentApp);
  
  console.log(`    [Match check] trigger="${tNorm}" vs current="${cNorm}"`);
  
  if (tNorm === cNorm) {
    console.log(`    [Match] Exact normalized match`);
    return true;
  }
  
  // Contains match (min 3 chars)
  if (tNorm.length >= 3 && cNorm.length >= 3) {
    if (tNorm.includes(cNorm)) {
      console.log(`    [Match] Trigger contains current`);
      return true;
    }
    if (cNorm.includes(tNorm)) {
      console.log(`    [Match] Current contains trigger`);
      return true;
    }
  }
  
  // Check if current app matches start of trigger (e.g., "EA" matches "EA App")
  if (cNorm.length >= 2 && tNorm.startsWith(cNorm)) {
    console.log(`    [Match] Trigger starts with current`);
    return true;
  }
  
  return false;
}

// ============================================
// ACTIVE WINDOW MONITORING
// ============================================
async function monitorActiveApp() {
  try {
    const win = await activeWin();
    if (!win || !win.owner || !win.owner.name) return;
    
    const currentApp = win.owner.name;
    
    // Skip if same as last
    if (currentApp === config.lastApp) return;
    config.lastApp = currentApp;
    
    // Learn mapping for this app (even if not logged in)
    learnAppMapping(currentApp);
    
    if (!config.userId) return;
    
    console.log('\n>>> Active app:', currentApp);
    console.log('  Querying user_id:', config.userId);

    // Fetch reminders from Supabase
    const { data: reminders, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('user_id', config.userId)
      .eq('status', 'active');

    console.log('  Query result - error:', error, 'count:', reminders?.length || 0);

    if (error) {
      console.error('Supabase error:', error.message);
      return;
    }

    if (!reminders || reminders.length === 0) {
      console.log('No active reminders');
      
      // Debug: fetch ALL reminders for this user regardless of status
      const { data: allReminders } = await supabase
        .from('reminders')
        .select('id, status, parsed')
        .eq('user_id', config.userId);
      console.log('  DEBUG - All reminders for user:', JSON.stringify(allReminders, null, 2));
      return;
    }

    console.log('Active reminders:', reminders.length);

    // Check each reminder for app triggers
    const matchedReminders = [];
    
    for (const reminder of reminders) {
      // Parse the parsed field (handle both string and object)
      let parsed = reminder.parsed;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          console.log('  Could not parse reminder:', e.message);
          continue;
        }
      }
      
      const triggers = parsed?.triggers || [];
      
      for (const trigger of triggers) {
        if (trigger.type !== 'app') continue;
        
        // Parse trigger value (handle string, array, comma-separated)
        let triggerApps = [];
        const val = trigger.value || '';
        
        if (Array.isArray(val)) {
          triggerApps = val;
        } else if (typeof val === 'string') {
          if (val.startsWith('[')) {
            try {
              triggerApps = JSON.parse(val);
            } catch {
              triggerApps = [val];
            }
          } else if (val.includes(',')) {
            triggerApps = val.split(',').map(s => s.trim());
          } else {
            triggerApps = [val];
          }
        }
        
        console.log('  Trigger apps:', triggerApps.join(', '));
        
        for (const triggerApp of triggerApps) {
          if (appNamesMatch(triggerApp, currentApp)) {
            console.log('  ✓ MATCH:', triggerApp, '=', currentApp);
            matchedReminders.push(reminder);
            break;
          }
        }
      }
    }

    // Trigger matched reminders
    if (matchedReminders.length > 0) {
      console.log('Triggering', matchedReminders.length, 'reminder(s)!');
      
      for (const reminder of matchedReminders) {
        // Show system notification
        notifier.notify({
          title: '🔔 Reminder',
          message: reminder.raw_text || reminder.title,
          sound: true,
          wait: true,
          timeout: 30,
          appID: 'Context Reminder',
          urgency: 'critical'
        });
        
        // Also show a popup window that stays on top (bypasses DND)
        showReminderPopup(reminder.raw_text || reminder.title);
        
        // Mark as completed
        const { error: updateError } = await supabase
          .from('reminders')
          .update({ status: 'completed' })
          .eq('id', reminder.id);
        
        if (updateError) {
          console.error('Error updating reminder:', updateError.message);
        } else {
          console.log('Reminder completed:', reminder.id);
        }
      }
    }
  } catch (e) {
    console.error('Monitor error:', e.message);
  }
}

function startMonitoring() {
  if (monitoringInterval) return;
  monitoringInterval = setInterval(monitorActiveApp, config.checkInterval);
  console.log('Monitoring started (interval:', config.checkInterval, 'ms)');
}

function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log('Monitoring stopped');
  }
}

// ============================================
// GET INSTALLED APPS (Same as Windows Settings > Apps)
// ============================================
function getInstalledApps() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve([]);
      return;
    }

    console.log('Fetching installed apps...');

    // PowerShell script to get apps exactly like Windows Settings
    const psScript = `
# Get Win32 apps from registry
$win32Apps = @()
$regPaths = @(
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 
    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)

foreach ($regPath in $regPaths) {
    Get-ItemProperty $regPath -ErrorAction SilentlyContinue | 
    Where-Object { 
        $_.DisplayName -and 
        $_.DisplayName -notmatch 'Update|Redistributable|Visual C\\+\\+|Microsoft \\.NET|Driver|SDK|Runtime|Windows Kit|NVIDIA PhysX|NVIDIA HD Audio'
    } | ForEach-Object {
        $win32Apps += [PSCustomObject]@{
            Name = $_.DisplayName
            Publisher = $_.Publisher
        }
    }
}

# Get UWP/Store apps
$uwpApps = Get-AppxPackage | Where-Object { 
    -not $_.IsFramework -and 
    $_.SignatureKind -eq 'Store' -and
    $_.Name -notmatch 'Microsoft\\.Windows\\.|Microsoft\\.MicrosoftEdge|Microsoft\\.VP9|Microsoft\\.HEVC|Microsoft\\.WebMediaExtensions|Microsoft\\.Advertising|Microsoft\\.NET|Microsoft\\.VCLibs|Microsoft\\.UI|Microsoft\\.Services'
} | ForEach-Object {
    $name = $_.Name
    # Try to get display name from manifest
    try {
        $manifest = Get-AppxPackageManifest -Package $_.PackageFullName -ErrorAction Stop
        $displayName = $manifest.Package.Properties.DisplayName
        if ($displayName -and $displayName -notmatch '^ms-resource:') {
            $name = $displayName
        } else {
            $name = $_.Name.Split('.')[-1]
        }
    } catch {
        $name = $_.Name.Split('.')[-1]
    }
    
    [PSCustomObject]@{
        Name = $name
        Publisher = $_.Publisher
    }
}

# Combine and output unique names
($win32Apps + $uwpApps) | Select-Object -Property Name -Unique | Sort-Object Name | ForEach-Object { $_.Name }
`;

    const tempFile = path.join(os.tmpdir(), 'get-installed-apps.ps1');
    fs.writeFileSync(tempFile, psScript, 'utf8');

    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tempFile}"`,
      { timeout: 120000, maxBuffer: 1024 * 1024 * 50 },
      (error, stdout, stderr) => {
        // Cleanup
        try { fs.unlinkSync(tempFile); } catch (e) {}

        if (error) {
          console.error('PowerShell error:', error.message);
          resolve([]);
          return;
        }

        const lines = stdout.split('\n').map(l => l.trim()).filter(l => l && l.length > 1);
        console.log('Raw apps found:', lines.length);

        // Filter and dedupe
        const seen = new Set();
        const apps = [];
        
        for (const name of lines) {
          const lower = name.toLowerCase();
          
          // Skip system junk
          if (lower.match(/^[0-9a-f-]{36}$/)) continue; // GUIDs
          if (lower.match(/^[0-9]+$/)) continue; // Numbers
          if (lower.length < 2) continue;
          
          if (seen.has(lower)) continue;
          seen.add(lower);
          
          apps.push({
            name: name,
            icon: name.charAt(0).toUpperCase()
          });
        }

        apps.sort((a, b) => a.name.localeCompare(b.name));
        console.log('Filtered apps:', apps.length);
        
        resolve(apps);
      }
    );
  });
}

// ============================================
// LOCAL HTTP SERVER (for web app communication)
// ============================================
function startLocalServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/running-apps' || req.url === '/installed-apps') {
      try {
        const apps = await getInstalledApps();
        console.log('Returning', apps.length, 'apps to web app');
        res.writeHead(200);
        res.end(JSON.stringify(apps));
      } catch (e) {
        console.error('Server error:', e.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.url === '/status') {
      res.writeHead(200);
      res.end(JSON.stringify({ 
        status: 'running',
        userId: config.userId,
        monitoring: !!monitoringInterval
      }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(3001, '127.0.0.1', () => {
    console.log('Local server running on http://localhost:3001');
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log('Port 3001 already in use, server may already be running');
    } else {
      console.error('Server error:', e.message);
    }
  });
}

// ============================================
// SETTINGS WINDOW
// ============================================
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 750,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Context Reminder Settings',
    resizable: false
  });

  settingsWindow.loadFile('settings.html');
  settingsWindow.setMenuBarVisibility(false);
  
  // Open DevTools for debugging (remove this line later)
  // settingsWindow.webContents.openDevTools();
  
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.webContents.on('did-finish-load', () => {
    settingsWindow.webContents.send('load-config', config);
  });
}

// ============================================
// SYSTEM TRAY
// ============================================
function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  tray = new Tray(iconPath);

  const updateMenu = () => {
    const menu = Menu.buildFromTemplate([
      { 
        label: config.userId 
          ? `✓ Connected: ${config.userId.slice(0, 8)}...` 
          : '✗ Not Connected', 
        enabled: false 
      },
      { type: 'separator' },
      { label: 'Settings', click: createSettingsWindow },
      { 
        label: monitoringInterval ? '● Monitoring Active' : '○ Monitoring Inactive', 
        enabled: false 
      },
      { type: 'separator' },
      { label: 'Quit', click: () => { stopMonitoring(); app.quit(); } }
    ]);
    tray.setContextMenu(menu);
  };

  updateMenu();
  setInterval(updateMenu, 5000);
  tray.setToolTip('Context Reminder');
}

// ============================================
// IPC HANDLERS
// ============================================
ipcMain.handle('save-config', (event, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig();
  stopMonitoring();
  if (config.userId) startMonitoring();
  return { success: true };
});

ipcMain.handle('get-config', () => config);

// ============================================
// APP LIFECYCLE
// ============================================
app.whenReady().then(async () => {
  loadConfig();
  loadAppCache();
  loadAppMapping();
  createTray();
  startLocalServer();
  
  // Pre-fetch installed apps for mapping
  console.log('Pre-fetching installed apps for mapping...');
  installedApps = await getInstalledApps();
  console.log('Cached', installedApps.length, 'installed apps');
  
  if (config.userId) {
    startMonitoring();
  } else {
    createSettingsWindow();
  }
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createSettingsWindow();
});