let authToken = localStorage.getItem('torbox_admin_session') || '';
let currentTempToken = '';

// Elementos DOM de Autenticación
const loginSection = document.getElementById('loginSection');
const setup2FASection = document.getElementById('setup2FASection');
const verify2FASection = document.getElementById('verify2FASection');
const dashboardSection = document.getElementById('dashboardSection');

const loginForm = document.getElementById('loginForm');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

const setup2FAForm = document.getElementById('setup2FAForm');
const qrCodeImg = document.getElementById('qrCodeImg');
const secretCodeDisplay = document.getElementById('secretCodeDisplay');
const copySecretBtn = document.getElementById('copySecretBtn');
const setup2FACodeInput = document.getElementById('setup2FACodeInput');
const setup2FAError = document.getElementById('setup2FAError');
const verifySetupBtn = document.getElementById('verifySetupBtn');

const verify2FAForm = document.getElementById('verify2FAForm');
const verify2FACodeInput = document.getElementById('verify2FACodeInput');
const verify2FAError = document.getElementById('verify2FAError');
const verify2FABtn = document.getElementById('verify2FABtn');
const backToLoginBtn = document.getElementById('backToLoginBtn');

// Elementos DOM del Dashboard
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');

const statTotalUsers = document.getElementById('statTotalUsers');
const statLiveStreams = document.getElementById('statLiveStreams');
const statStandardUsers = document.getElementById('statStandardUsers');
const statPremiumUsers = document.getElementById('statPremiumUsers');
const usersTableBody = document.getElementById('usersTableBody');

const openCreateModalBtn = document.getElementById('openCreateModalBtn');
const createModal = document.getElementById('createModal');
const createUserForm = document.getElementById('createUserForm');
const submitCreateBtn = document.getElementById('submitCreateBtn');

const editModal = document.getElementById('editModal');
const editUserForm = document.getElementById('editUserForm');

const credentialsModal = document.getElementById('credentialsModal');
const credentialsMessage = document.getElementById('credentialsMessage');
const copyCredentialsBtn = document.getElementById('copyCredentialsBtn');

// Elementos DOM del Inspector de Sesiones en Vivo
const liveSessionsModal = document.getElementById('liveSessionsModal');
const liveSessionsUserName = document.getElementById('liveSessionsUserName');
const liveSessionsSubtitle = document.getElementById('liveSessionsSubtitle');
const liveSessionsList = document.getElementById('liveSessionsList');
const disconnectAllSessionsBtn = document.getElementById('disconnectAllSessionsBtn');
let currentLiveUserUuid = null;

// Inicialización
if (authToken) {
  showDashboard();
}

// Auto-refrescar sesiones cada 4 segundos
setInterval(() => {
  if (authToken && dashboardSection && !dashboardSection.classList.contains('hidden')) {
    loadDashboardData();
    if (currentLiveUserUuid && liveSessionsModal && !liveSessionsModal.classList.contains('hidden')) {
      refreshLiveSessions(currentLiveUserUuid);
    }
  }
}, 4000);

// ----------------------------------------------------
// PASO 1: Ingreso de Contraseña con Protección
// ----------------------------------------------------
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Verificando...';

  const password = adminPasswordInput.value.trim();

  try {
    const res = await fetch('/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (data.success) {
      currentTempToken = data.tempToken;

      if (data.require2FASetup) {
        secretCodeDisplay.textContent = data.secret;
        copySecretBtn.setAttribute('data-secret', data.secret);
        
        if (data.otpauthUrl && qrCodeImg) {
          qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.otpauthUrl)}`;
        }

        loginSection.classList.add('hidden');
        setup2FASection.classList.remove('hidden');
        setup2FACodeInput.focus();
      } else if (data.require2FA) {
        loginSection.classList.add('hidden');
        verify2FASection.classList.remove('hidden');
        verify2FACodeInput.focus();
      }
    } else {
      loginError.textContent = data.error || 'Credenciales no válidas';
    }
  } catch (err) {
    loginError.textContent = 'Error de conexión con el servidor protegido';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Continuar';
  }
});

copySecretBtn.addEventListener('click', () => {
  const secret = copySecretBtn.getAttribute('data-secret');
  if (secret) {
    navigator.clipboard.writeText(secret);
    copySecretBtn.textContent = '¡Clave Copiada! ✅';
    setTimeout(() => {
      copySecretBtn.textContent = '📋 Copiar Clave';
    }, 2000);
  }
});

// ----------------------------------------------------
// PASO 2A: Confirmar Configuración Inicial de 2FA
// ----------------------------------------------------
setup2FAForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setup2FAError.textContent = '';
  verifySetupBtn.disabled = true;
  verifySetupBtn.textContent = 'Validando Código...';

  const code = setup2FACodeInput.value.trim();

  try {
    const res = await fetch('/admin/api/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken: currentTempToken, code })
    });
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      localStorage.setItem('torbox_admin_session', authToken);
      setup2FASection.classList.add('hidden');
      showDashboard();
    } else {
      setup2FAError.textContent = data.error || 'Código incorrecto. Intenta con el nuevo código de tu app.';
    }
  } catch (err) {
    setup2FAError.textContent = 'Error de conexión al verificar 2FA';
  } finally {
    verifySetupBtn.disabled = false;
    verifySetupBtn.textContent = 'Vincular y Entrar';
  }
});

// ----------------------------------------------------
// PASO 2B: Verificar 2FA Habitual
// ----------------------------------------------------
verify2FAForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  verify2FAError.textContent = '';
  verify2FABtn.disabled = true;
  verify2FABtn.textContent = 'Verificando...';

  const code = verify2FACodeInput.value.trim();

  try {
    const res = await fetch('/admin/api/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken: currentTempToken, code })
    });
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      localStorage.setItem('torbox_admin_session', authToken);
      verify2FASection.classList.add('hidden');
      showDashboard();
    } else {
      verify2FAError.textContent = data.error || 'Código 2FA incorrecto';
    }
  } catch (err) {
    verify2FAError.textContent = 'Error de conexión';
  } finally {
    verify2FABtn.disabled = false;
    verify2FABtn.textContent = 'Verificar y Acceder';
  }
});

backToLoginBtn.addEventListener('click', () => {
  verify2FASection.classList.add('hidden');
  setup2FASection.classList.add('hidden');
  loginSection.classList.remove('hidden');
  adminPasswordInput.value = '';
  verify2FACodeInput.value = '';
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/admin/api/logout', {
      method: 'POST',
      headers: { 'Authorization': authToken }
    });
  } catch (e) {}

  authToken = '';
  localStorage.removeItem('torbox_admin_session');
  dashboardSection.classList.add('hidden');
  loginSection.classList.remove('hidden');
  adminPasswordInput.value = '';
  loginError.textContent = '';
});

refreshBtn.addEventListener('click', loadDashboardData);

function showDashboard() {
  loginSection.classList.add('hidden');
  setup2FASection.classList.add('hidden');
  verify2FASection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  loadDashboardData();
}

// ----------------------------------------------------
// Dashboard y Gestión de Usuarios
// ----------------------------------------------------
async function loadDashboardData() {
  try {
    const res = await fetch('/admin/api/users', {
      headers: { 'Authorization': authToken }
    });

    if (res.status === 401) {
      logoutBtn.click();
      return;
    }

    const data = await res.json();
    renderStats(data.stats);
    renderUsers(data.users);
  } catch (err) {
    console.error('Error cargando datos:', err);
  }
}

function renderStats(stats) {
  statTotalUsers.textContent = stats.totalUsers || 0;
  statLiveStreams.textContent = stats.totalLiveStreams || 0;
  statStandardUsers.textContent = stats.standardUsers || 0;
  statPremiumUsers.textContent = stats.premiumUsers || 0;
}

function renderUsers(users) {
  usersTableBody.innerHTML = '';

  if (!users || users.length === 0) {
    usersTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay clientes creados todavía. Haz clic en "Crear Nueva Cuenta".</td></tr>`;
    return;
  }

  users.forEach(user => {
    const tr = document.createElement('tr');

    const statusBadge = user.isActive
      ? `<span class="badge badge-success">Activo</span>`
      : `<span class="badge badge-danger">Pausado</span>`;

    const resBadge = user.maxRes === '4k'
      ? `<span class="badge badge-warning">4K UHD</span>`
      : `<span class="badge badge-indigo">1080p FHD</span>`;

    const sizeText = user.maxFileSizeGb && user.maxFileSizeGb > 0
      ? `Máx ${user.maxFileSizeGb}GB`
      : 'Sin límite';

    const liveSessionsPill = user.activeScreensNow > 0
      ? `<button class="session-pill-btn" onclick="openLiveSessionsModal('${user.uuid}')" title="Ver qué películas están reproduciendo en tiempo real">
           🟢 ${user.activeScreensNow} / ${user.maxScreens} en vivo 👁️
         </button>`
      : `<span style="color: var(--text-muted)">0 / ${user.maxScreens}</span>`;

    tr.innerHTML = `
      <td>${statusBadge}</td>
      <td>
        <strong>${user.name}</strong><br>
        <small style="color: var(--text-muted);">${user.email}</small>
      </td>
      <td>
        ${resBadge} <small style="color: var(--text-muted); margin-left: 0.3rem;">${sizeText}</small><br>
        <small style="color: var(--text-muted); font-size: 0.72rem;">
          ${user.excludeCam !== false ? '🚫 Sin CAM' : '⚠️ Con CAM'} · 
          ${user.blockDolbyVision ? '🚫 Sin DV' : '🌈 DV Ok'} · 
          ${user.audioLang === 'latino' ? '🇲🇽 Latino' : (user.audioLang === 'castellano' ? '🇪🇸 Castellano' : '🌐 Todos')}
        </small>
      </td>
      <td><strong>${user.maxScreens}</strong> pantalla(s)</td>
      <td>${liveSessionsPill}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${user.uuid}')">✏️ Editar</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleUserStatus('${user.uuid}')">${user.isActive ? '⏸️ Pausar' : '▶️ Activar'}</button>
          <button class="btn btn-secondary btn-sm" onclick="resetSessions('${user.uuid}')" title="Liberar pantallas">🔄 Reset</button>
          <button class="btn btn-secondary btn-sm" onclick="showCredentialsForUser('${user.uuid}')" title="Copiar mensaje">📋 Mensaje</button>
          <button class="btn btn-danger-outline btn-sm" onclick="deleteUser('${user.uuid}')">🗑️</button>
        </div>
      </td>
    `;
    usersTableBody.appendChild(tr);
  });
}

// Crear cuenta con Filtros Avanzados
openCreateModalBtn.addEventListener('click', () => {
  createModal.classList.remove('hidden');
});

createUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitCreateBtn.disabled = true;
  submitCreateBtn.textContent = 'Registrando en Stremio...';

  const name = document.getElementById('newUserName').value.trim();
  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value.trim();
  const maxRes = document.getElementById('newUserRes').value;
  const maxScreens = document.getElementById('newUserScreens').value;

  // Nuevos filtros avanzados
  const maxFileSizeGb = document.getElementById('newUserMaxFileSize').value;
  const audioLang = document.getElementById('newUserAudioLang').value;
  const excludeCam = document.getElementById('newUserExcludeCam').checked;
  const blockDolbyVision = document.getElementById('newUserBlockDV').checked;

  try {
    const res = await fetch('/admin/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken
      },
      body: JSON.stringify({
        name,
        email,
        password,
        maxRes,
        maxScreens,
        maxFileSizeGb,
        audioLang,
        excludeCam,
        blockDolbyVision
      })
    });

    const data = await res.json();
    if (data.success) {
      createModal.classList.add('hidden');
      createUserForm.reset();
      loadDashboardData();

      credentialsMessage.value = data.welcomeMessage;
      credentialsModal.classList.remove('hidden');
    } else {
      alert(`Error: ${data.error}`);
    }
  } catch (err) {
    alert('Error al conectar con el servidor para crear la cuenta');
  } finally {
    submitCreateBtn.disabled = false;
    submitCreateBtn.textContent = 'Crear Cuenta Automática';
  }
});

// Copiar mensaje para WhatsApp
copyCredentialsBtn.addEventListener('click', () => {
  credentialsMessage.select();
  navigator.clipboard.writeText(credentialsMessage.value);
  copyCredentialsBtn.textContent = '¡Copiado al Portapapeles! ✅';
  setTimeout(() => {
    copyCredentialsBtn.textContent = '📋 Copiar para WhatsApp';
  }, 2000);
});

// Modales de cierre
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-close');
    document.getElementById(targetId).classList.add('hidden');
    if (targetId === 'liveSessionsModal') {
      currentLiveUserUuid = null;
    }
  });
});

// Editar Plan con Filtros Avanzados
window.openEditModal = async function(uuid) {
  try {
    const res = await fetch('/admin/api/users', { headers: { 'Authorization': authToken } });
    const data = await res.json();
    const user = data.users.find(u => u.uuid === uuid);
    if (!user) return;

    document.getElementById('editUserUuid').value = user.uuid;
    document.getElementById('editUserName').value = user.name;
    document.getElementById('editUserRes').value = user.maxRes;
    document.getElementById('editUserScreens').value = user.maxScreens;

    document.getElementById('editUserMaxFileSize').value = user.maxFileSizeGb !== undefined ? user.maxFileSizeGb : (user.maxRes === '4k' ? '0' : '8');
    document.getElementById('editUserAudioLang').value = user.audioLang || 'all';
    document.getElementById('editUserExcludeCam').checked = user.excludeCam !== false;
    document.getElementById('editUserBlockDV').checked = Boolean(user.blockDolbyVision);

    editModal.classList.remove('hidden');
  } catch (err) {
    alert('Error al cargar datos del usuario');
  }
};

editUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uuid = document.getElementById('editUserUuid').value;
  const name = document.getElementById('editUserName').value.trim();
  const maxRes = document.getElementById('editUserRes').value;
  const maxScreens = document.getElementById('editUserScreens').value;

  const maxFileSizeGb = document.getElementById('editUserMaxFileSize').value;
  const audioLang = document.getElementById('editUserAudioLang').value;
  const excludeCam = document.getElementById('editUserExcludeCam').checked;
  const blockDolbyVision = document.getElementById('editUserBlockDV').checked;

  try {
    const res = await fetch(`/admin/api/users/${uuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken
      },
      body: JSON.stringify({
        name,
        maxRes,
        maxScreens,
        maxFileSizeGb,
        audioLang,
        excludeCam,
        blockDolbyVision
      })
    });
    const data = await res.json();
    if (data.success) {
      editModal.classList.add('hidden');
      loadDashboardData();
    } else {
      alert(data.error || 'Error al actualizar el usuario');
    }
  } catch (err) {
    alert('Error de conexión');
  }
});

// Pausar / Activar
window.toggleUserStatus = async function(uuid) {
  try {
    await fetch(`/admin/api/users/${uuid}/toggle`, {
      method: 'POST',
      headers: { 'Authorization': authToken }
    });
    loadDashboardData();
  } catch (err) {
    alert('Error al cambiar estado');
  }
};

// Reset de pantallas activas
window.resetSessions = async function(uuid) {
  try {
    await fetch(`/admin/api/users/${uuid}/reset-sessions`, {
      method: 'POST',
      headers: { 'Authorization': authToken }
    });
    alert('Pantallas activas liberadas.');
    loadDashboardData();
  } catch (err) {
    alert('Error al resetear sesiones');
  }
};

// Eliminar usuario
window.deleteUser = async function(uuid) {
  if (!confirm('¿Estás seguro de que deseas eliminar este cliente?')) return;
  try {
    await fetch(`/admin/api/users/${uuid}`, {
      method: 'DELETE',
      headers: { 'Authorization': authToken }
    });
    loadDashboardData();
  } catch (err) {
    alert('Error al eliminar');
  }
};

// Mostrar credenciales guardadas
window.showCredentialsForUser = async function(uuid) {
  try {
    const res = await fetch('/admin/api/users', { headers: { 'Authorization': authToken } });
    const data = await res.json();
    const user = data.users.find(u => u.uuid === uuid);
    if (!user) return;

    const qualityText = user.maxRes === '4k' ? '4K Ultra HD + HDR' : '1080p Full HD';
    credentialsMessage.value = `🎬 *¡Tu servicio de Streaming está listo!*\n\n` +
      `👤 *Usuario:* ${user.email}\n` +
      `🔑 *Contraseña:* ${user.password}\n` +
      `📺 *Pantallas permitidas:* ${user.maxScreens} simultánea(s)\n` +
      `✨ *Calidad de imagen:* ${qualityText}\n\n` +
      `*Instrucciones de uso en tu TV o Móvil:*\n` +
      `1. Descarga e instala la app oficial de *Stremio* en tu Smart TV o teléfono.\n` +
      `2. Inicia sesión con el correo y contraseña indicados arriba.\n` +
      `3. ¡Listo! Todas las películas, series y tendencias ya están preconfiguradas.`;

    credentialsModal.classList.remove('hidden');
  } catch (err) {
    alert('Error obteniendo credenciales');
  }
};

// ----------------------------------------------------
// MONITOR / INSPECTOR DE SESIONES EN VIVO
// ----------------------------------------------------
window.openLiveSessionsModal = async function(uuid) {
  currentLiveUserUuid = uuid;
  await refreshLiveSessions(uuid);
  liveSessionsModal.classList.remove('hidden');
};

async function refreshLiveSessions(uuid) {
  try {
    const res = await fetch(`/admin/api/users/${uuid}/sessions`, {
      headers: { 'Authorization': authToken }
    });
    if (res.status === 401) {
      logoutBtn.click();
      return;
    }
    const data = await res.json();
    const user = data.user;
    const sessions = data.sessions || [];

    liveSessionsUserName.textContent = user.name;
    liveSessionsSubtitle.textContent = `Pantallas en uso: ${sessions.length} de ${user.maxScreens} permitidas (${user.maxRes.toUpperCase()})`;

    liveSessionsList.innerHTML = '';

    if (sessions.length === 0) {
      liveSessionsList.innerHTML = `
        <div class="empty-sessions">
          <p>💤 No hay ninguna pantalla reproduciendo en este momento para este cliente.</p>
        </div>
      `;
      return;
    }

    sessions.forEach(s => {
      const card = document.createElement('div');
      card.className = 'session-card';

      const posterHtml = s.mediaPoster
        ? `<img src="${s.mediaPoster}" alt="Poster" class="session-poster" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"><span class="session-poster-placeholder" style="display:none;">🎬</span>`
        : `<span class="session-poster-placeholder">🎬</span>`;

      card.innerHTML = `
        <div class="session-poster-box">
          ${posterHtml}
        </div>
        <div class="session-info">
          <div class="session-title">${s.mediaTitle || 'Contenido en curso'}</div>
          <div class="session-quality">🎯 ${s.streamQuality || 'Enlace Directo Torbox'}</div>
          <div class="session-meta">
            <span class="device-pill">${s.device || 'Dispositivo Stremio'}</span>
            <span class="meta-tag">🌐 IP: ${s.clientIp}</span>
            <span class="meta-tag">⏱️ Hace ${s.durationMinutes} min</span>
          </div>
        </div>
        <div class="session-actions">
          <button class="btn btn-danger-outline btn-sm" onclick="disconnectSingleScreen('${uuid}', '${s.id}')" title="Desconectar esta pantalla">
            ✕ Desconectar
          </button>
        </div>
      `;
      liveSessionsList.appendChild(card);
    });
  } catch (err) {
    console.error('Error actualizando inspector de sesiones:', err);
  }
}

// Desconectar una sola pantalla
window.disconnectSingleScreen = async function(uuid, sessionId) {
  try {
    await fetch(`/admin/api/users/${uuid}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': authToken }
    });
    await refreshLiveSessions(uuid);
    loadDashboardData();
  } catch (e) {
    alert('Error al desconectar pantalla');
  }
};

// Desconectar todas las pantallas del usuario
disconnectAllSessionsBtn.addEventListener('click', async () => {
  if (!currentLiveUserUuid) return;
  if (!confirm('¿Deseas desconectar todas las pantallas activas de este cliente?')) return;

  try {
    await fetch(`/admin/api/users/${currentLiveUserUuid}/reset-sessions`, {
      method: 'POST',
      headers: { 'Authorization': authToken }
    });
    await refreshLiveSessions(currentLiveUserUuid);
    loadDashboardData();
  } catch (e) {
    alert('Error al liberar pantallas');
  }
});
