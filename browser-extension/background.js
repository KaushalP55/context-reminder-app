// Configuration
const SERVER_URL = "http://localhost:3000"; // Change this when you deploy

// Track the last checked URL to avoid duplicate checks
let lastCheckedUrl = "";

// Listen for tab updates (when a new page is loaded)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only trigger when the page has finished loading
  if (changeInfo.status === 'complete' && tab.url) {
    checkWebsiteReminders(tab.url);
  }
});

// Listen for tab activation (when user switches tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url) {
      checkWebsiteReminders(tab.url);
    }
  });
});

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    // Remove 'www.' if present
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

// Check if current website matches any reminders
async function checkWebsiteReminders(url) {
  const domain = extractDomain(url);
  
  // Skip if no domain or same as last check
  if (!domain || url === lastCheckedUrl) {
    return;
  }
  
  lastCheckedUrl = url;
  
  console.log('Checking reminders for:', domain);
  
  // Get user ID from storage
  chrome.storage.local.get(['userId'], async (result) => {
    if (!result.userId) {
      console.log('No user ID found - user not logged in');
      return;
    }
    
    try {
      // Call your app's API to check for website reminders
      const response = await fetch(`${SERVER_URL}/api/check-website`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: result.userId,
          website: domain,
        }),
      });
      
      if (!response.ok) {
        console.error('Failed to check reminders:', response.statusText);
        return;
      }
      
      const data = await response.json();
      
      // Show notifications for triggered reminders
      if (data.reminders && data.reminders.length > 0) {
        data.reminders.forEach((reminder) => {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Website Reminder',
            message: reminder.raw_text,
            priority: 2
          });
        });
      }
    } catch (error) {
      console.error('Error checking website reminders:', error);
    }
  });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'setUserId') {
    chrome.storage.local.set({ userId: request.userId }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'getUserId') {
    chrome.storage.local.get(['userId'], (result) => {
      sendResponse({ userId: result.userId || null });
    });
    return true;
  }
});