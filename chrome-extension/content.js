// ML Analyzer Pro - Content Script
// This script runs on Mercado Livre product pages

console.log('ML Analyzer Pro: Content script loaded');

// Configuration
const API_BASE_URL = 'YOUR_SUPABASE_URL'; // Will be replaced with actual URL
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Will be replaced

// Extract item ID from URL
function extractItemId() {
  const url = window.location.href;
  
  // Brazilian ML format: https://produto.mercadolivre.com.br/MLB-XXXXX...
  const brazilMatch = url.match(/MLB-(\d+)/);
  if (brazilMatch) {
    return `MLB${brazilMatch[1]}`;
  }
  
  // Other ML formats: https://articulo.mercadolibre.com.ar/MLA-XXXXX...
  const generalMatch = url.match(/ML[A-Z]-(\d+)/);
  if (generalMatch) {
    return generalMatch[0];
  }
  
  return null;
}

// Check if we're on a product page
function isProductPage() {
  const itemId = extractItemId();
  return itemId !== null;
}

// Create and inject sidebar
function createSidebar() {
  // Check if sidebar already exists
  if (document.getElementById('ml-analyzer-sidebar')) {
    return;
  }

  const itemId = extractItemId();
  if (!itemId) {
    console.log('ML Analyzer Pro: Not a product page');
    return;
  }

  console.log('ML Analyzer Pro: Creating sidebar for item:', itemId);

  // Create sidebar container
  const sidebar = document.createElement('div');
  sidebar.id = 'ml-analyzer-sidebar';
  sidebar.className = 'ml-analyzer-sidebar ml-analyzer-sidebar-collapsed';

  // Create sidebar content
  sidebar.innerHTML = `
    <div class="ml-analyzer-header">
      <div class="ml-analyzer-logo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3h18v18H3V3z" stroke="currentColor" stroke-width="2"/>
          <path d="M8 16l3-6 3 6h-6z" fill="currentColor"/>
        </svg>
        <span>ML Analyzer Pro</span>
      </div>
      <button class="ml-analyzer-toggle" id="ml-analyzer-toggle">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 5l-7 7h14l-7-7z"/>
        </svg>
      </button>
    </div>
    
    <div class="ml-analyzer-content" id="ml-analyzer-content">
      <div class="ml-analyzer-loading">
        <div class="ml-analyzer-spinner"></div>
        <p>Carregando análise...</p>
      </div>
    </div>
  `;

  document.body.appendChild(sidebar);

  // Add toggle functionality
  const toggleBtn = document.getElementById('ml-analyzer-toggle');
  toggleBtn.addEventListener('click', toggleSidebar);

  // Load analysis
  loadAnalysis(itemId);
}

// Toggle sidebar visibility
function toggleSidebar() {
  const sidebar = document.getElementById('ml-analyzer-sidebar');
  if (sidebar) {
    sidebar.classList.toggle('ml-analyzer-sidebar-collapsed');
  }
}

// Load analysis from API
async function loadAnalysis(itemId) {
  const contentDiv = document.getElementById('ml-analyzer-content');
  
  try {
    // Get auth token from storage
    const result = await chrome.storage.local.get(['authToken']);
    const authToken = result.authToken;

    if (!authToken) {
      showLoginRequired(contentDiv);
      return;
    }

    // Call API to get item analysis
    const response = await fetch(`${API_BASE_URL}/functions/v1/ml-get-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ itemId }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        showLoginRequired(contentDiv);
        return;
      }
      throw new Error('Failed to fetch analysis');
    }

    const data = await response.json();
    displayAnalysis(contentDiv, data);

  } catch (error) {
    console.error('ML Analyzer Pro: Error loading analysis:', error);
    showError(contentDiv, error.message);
  }
}

// Display login required message
function showLoginRequired(container) {
  container.innerHTML = `
    <div class="ml-analyzer-message">
      <h3>🔐 Login Necessário</h3>
      <p>Para usar o ML Analyzer Pro, você precisa estar logado.</p>
      <button class="ml-analyzer-btn ml-analyzer-btn-primary" onclick="window.open('${API_BASE_URL.replace('/functions/v1', '')}/auth', '_blank')">
        Fazer Login
      </button>
    </div>
  `;
}

// Display error message
function showError(container, message) {
  container.innerHTML = `
    <div class="ml-analyzer-message ml-analyzer-error">
      <h3>⚠️ Erro</h3>
      <p>${message}</p>
      <button class="ml-analyzer-btn ml-analyzer-btn-secondary" onclick="location.reload()">
        Tentar Novamente
      </button>
    </div>
  `;
}

// Display analysis results
function displayAnalysis(container, data) {
  const item = data.item;
  const visits = data.visits || {};

  container.innerHTML = `
    <div class="ml-analyzer-section">
      <h3>📊 Visão Geral</h3>
      <div class="ml-analyzer-metrics">
        <div class="ml-analyzer-metric">
          <span class="ml-analyzer-metric-label">Preço</span>
          <span class="ml-analyzer-metric-value">R$ ${item.price?.toLocaleString('pt-BR')}</span>
        </div>
        <div class="ml-analyzer-metric">
          <span class="ml-analyzer-metric-label">Vendidos</span>
          <span class="ml-analyzer-metric-value">${item.sold_quantity || 0}</span>
        </div>
        <div class="ml-analyzer-metric">
          <span class="ml-analyzer-metric-label">Estoque</span>
          <span class="ml-analyzer-metric-value ${item.available_quantity < 10 ? 'ml-analyzer-warning' : ''}">${item.available_quantity || 0}</span>
        </div>
        <div class="ml-analyzer-metric">
          <span class="ml-analyzer-metric-label">Visitas (Total)</span>
          <span class="ml-analyzer-metric-value">${visits.total_visits || 'N/A'}</span>
        </div>
      </div>
    </div>

    <div class="ml-analyzer-section">
      <h3>✨ Qualidade do Anúncio</h3>
      <div class="ml-analyzer-quality">
        <div class="ml-analyzer-quality-item ${item.pictures?.length >= 8 ? 'ml-analyzer-success' : 'ml-analyzer-warning'}">
          <span>${item.pictures?.length >= 8 ? '✓' : '⚠'}</span>
          <span>${item.pictures?.length || 0} fotos ${item.pictures?.length >= 8 ? '(Ótimo!)' : '(Adicione mais)'}</span>
        </div>
        <div class="ml-analyzer-quality-item ${item.video_id ? 'ml-analyzer-success' : 'ml-analyzer-warning'}">
          <span>${item.video_id ? '✓' : '⚠'}</span>
          <span>${item.video_id ? 'Possui vídeo' : 'Sem vídeo (Recomendado)'}</span>
        </div>
        <div class="ml-analyzer-quality-item ${item.title?.length >= 50 ? 'ml-analyzer-success' : 'ml-analyzer-warning'}">
          <span>${item.title?.length >= 50 ? '✓' : '⚠'}</span>
          <span>Título: ${item.title?.length || 0} caracteres</span>
        </div>
      </div>
    </div>

    <div class="ml-analyzer-section">
      <h3>🎯 Ações Rápidas</h3>
      <div class="ml-analyzer-actions">
        <button class="ml-analyzer-btn ml-analyzer-btn-secondary" onclick="window.open('${item.permalink}', '_blank')">
          Ver Anúncio Completo
        </button>
        <button class="ml-analyzer-btn ml-analyzer-btn-secondary">
          Analisar Concorrência
        </button>
        <button class="ml-analyzer-btn ml-analyzer-btn-primary">
          Ver Dashboard Completo
        </button>
      </div>
    </div>
  `;
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (isProductPage()) {
      createSidebar();
    }
  });
} else {
  if (isProductPage()) {
    createSidebar();
  }
}

// Listen for URL changes (for SPAs)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (isProductPage()) {
      createSidebar();
    }
  }
}).observe(document, { subtree: true, childList: true });
