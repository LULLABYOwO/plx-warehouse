import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');

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

    // Read privilege field robustly (accept several common misspellings)
    const rawRole = String(userData.priviledge || userData.previledge || userData.privilege || '').trim().toLowerCase();
    const role = rawRole;
    const privilege = (role === 'admin') ? 2 : 1;

    // Store both numeric and string role for compatibility
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
