import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');

function normalizeRole(rawRole) {
  const r = String(rawRole || '').trim().toLowerCase();
  if (r === '4' || r === 'super admin' || r === 'super-admin' || r === 'superadmin' || r === 'super_admin') {
    return 'super-admin';
  }
  if (r === '3' || r === 'admin') return 'admin';
  if (r === '2' || r === 'editor') return 'editor';
  return 'viewer';
}

function roleToPrivilege(role) {
  if (typeof role === 'number') return role;
  const r = String(role || '').trim().toLowerCase();
  if (r === 'super-admin') return 4;
  if (r === 'admin') return 3;
  if (r === 'editor') return 2;
  return 1;
}

async function login() {
  loginError.textContent = '';
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    loginError.textContent = 'Vui lòng nhập username và password.';
    return;
  }

  try {
    // users collection per your schema
    const userRef = doc(db, 'users', username);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      loginError.textContent = 'Username không tồn tại.';
      return;
    }

    const userData = userSnap.data();
    if (userData.password !== password) {
      loginError.textContent = 'Password không đúng.';
      return;
    }

    // read correctly-named field `privilege` from users doc
    const rawRole = String(userData.privilege || '').trim().toLowerCase();
    const role = normalizeRole(rawRole);
    const privilege = roleToPrivilege(role);

    localStorage.setItem('warehouseUser', JSON.stringify({
      username,
      privilege,
      role
    }));

    window.location.href = 'html/main.html';
  } catch (error) {
    loginError.textContent = 'Lỗi đăng nhập: ' + error.message;
  }
}

loginBtn.addEventListener('click', login);
passwordInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') login();
});
