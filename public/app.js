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

// Inicialización
if (authToken) {
  showDashboard();
}

// Actualizar automáticamente las sesiones en vivo cada 4 segundos
setInterval(() => {
  if (authToken && dashboardSection && !dashboardSection.classList.contains('hidden')) {
    loadDashboardData();
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
        // Primera vez: mostrar Código QR y clave
        secretCodeDisplay.textContent = data.secret;
        copySecretBtn.setAttribute('data-secret', data.secret);
        
        if (data.otpauthUrl && qrCodeImg) {
          qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.otpauthUrl)}`;
        }

        loginSection.classList.add('hidden');
        setup2FASection.classList.remove('hidden');
        setup2FACodeInput.focus();
      } else if (data.require2FA) {
        // 2FA ya activo: pedir código
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

// Copiar clave secreta 2FA al portapapeles
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

// Volver al inicio desde 2FA
backToLoginBtn.addEventListener('click', () => {
  verify2FASection.classList.add('hidden');
  setup2FASection.classList.add('hidden');
  loginSection.classList.remove('hidden');
  adminPasswordInput.value = '';
  verify2FACodeInput.value = '';
});

// Cerrar sesión
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
// Operaciones del Dashboard (Protegidas por Token Criptográfico)
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
      ? `<span class="badge badge-warning">4K Ultra HD</span>`
      : `<span class="badge badge-indigo">1080p FHD</span>`;

    const liveSessionsPill = user.activeScreensNow > 0
      ? `<span class="badge badge-success">🟢 ${user.activeScreensNow} / ${user.maxScreens} en vivo</span>`
      : `<span style="color: var(--text-muted)">0 / ${user.maxScreens}</span>`;

    tr.innerHTML = `
      <td>${statusBadge}</td>
      <td>
        <strong>${user.name}</strong><br>
        <small style="color: var(--text-muted);">${user.email}</small>
      </td>
      <td>${resBadge}</td>
      <td><strong>${user.maxScreens}</strong> pantalla(s)</td>
      <td>${liveSessionsPill}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${user.uuid}', '${user.name}', '${user.maxRes}', ${user.maxScreens})">✏️ Editar</button>
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

// Crear cuenta automática
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

  try {
    const res = await fetch('/admin/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken
      },
      body: JSON.stringify({ name, email, password, maxRes, maxScreens })
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
  });
});

// Editar Plan
window.openEditModal = function(uuid, name, maxRes, maxScreens) {
  document.getElementById('editUserUuid').value = uuid;
  document.getElementById('editUserName').value = name;
  document.getElementById('editUserRes').value = maxRes;
  document.getElementById('editUserScreens').value = maxScreens;
  editModal.classList.remove('hidden');
};

editUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uuid = document.getElementById('editUserUuid').value;
  const name = document.getElementById('editUserName').value.trim();
  const maxRes = document.getElementById('editUserRes').value;
  const maxScreens = document.getElementById('editUserScreens').value;

  try {
    const res = await fetch(`/admin/api/users/${uuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken
      },
      body: JSON.stringify({ name, maxRes, maxScreens })
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
      `1. Descarga e instala la app oficial de *Stremio* en tu Smart TV (Samsung, LG, Google TV, Fire TV) o teléfono.\n` +
      `2. Inicia sesión con el correo y contraseña indicados arriba.\n` +
      `3. ¡Listo! Todas las películas, series y tendencias ya están preconfiguradas.`;

    credentialsModal.classList.remove('hidden');
  } catch (err) {
    alert('Error obteniendo credenciales');
  }
};
