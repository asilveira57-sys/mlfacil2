// ML Analyzer Pro - Popup Script

const APP_URL = 'YOUR_APP_URL'; // Will be replaced with actual URL

document.addEventListener('DOMContentLoaded', async () => {
  console.log('ML Analyzer Pro: Popup loaded');

  // Check authentication status
  const result = await chrome.storage.local.get(['authToken', 'userInfo']);
  
  if (result.authToken) {
    showLoggedInState(result.userInfo);
  } else {
    showLoggedOutState();
  }

  // Setup event listeners
  document.getElementById('login-button').addEventListener('click', handleLogin);
  document.getElementById('dashboard-button').addEventListener('click', handleDashboard);
  document.getElementById('logout-button').addEventListener('click', handleLogout);
  document.getElementById('help-link').addEventListener('click', handleHelp);
});

function showLoggedInState(userInfo) {
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');
  const loginPrompt = document.getElementById('login-prompt');
  const userInfoDiv = document.getElementById('user-info');
  const loginButton = document.getElementById('login-button');
  const dashboardButton = document.getElementById('dashboard-button');
  const logoutButton = document.getElementById('logout-button');

  statusIcon.classList.remove('disconnected');
  statusIcon.classList.add('connected');
  statusText.textContent = 'Conectado';

  loginPrompt.style.display = 'none';
  userInfoDiv.style.display = 'block';

  if (userInfo) {
    document.getElementById('ml-account').textContent = userInfo.mlAccount || 'Não vinculado';
    document.getElementById('analyzed-count').textContent = userInfo.analyzedCount || '0';
  }

  loginButton.style.display = 'none';
  dashboardButton.style.display = 'block';
  logoutButton.style.display = 'block';
}

function showLoggedOutState() {
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');
  const loginPrompt = document.getElementById('login-prompt');
  const userInfoDiv = document.getElementById('user-info');
  const loginButton = document.getElementById('login-button');
  const dashboardButton = document.getElementById('dashboard-button');
  const logoutButton = document.getElementById('logout-button');

  statusIcon.classList.remove('connected');
  statusIcon.classList.add('disconnected');
  statusText.textContent = 'Desconectado';

  loginPrompt.style.display = 'block';
  userInfoDiv.style.display = 'none';

  loginButton.style.display = 'block';
  dashboardButton.style.display = 'none';
  logoutButton.style.display = 'none';
}

function handleLogin() {
  chrome.tabs.create({ url: `${APP_URL}/auth` });
}

function handleDashboard() {
  chrome.tabs.create({ url: `${APP_URL}/dashboard` });
}

async function handleLogout() {
  await chrome.storage.local.remove(['authToken', 'userInfo']);
  showLoggedOutState();
}

function handleHelp(e) {
  e.preventDefault();
  chrome.tabs.create({ url: `${APP_URL}/help` });
}
