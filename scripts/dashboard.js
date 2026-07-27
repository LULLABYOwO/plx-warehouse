import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

function getStoredUser() {
  const raw = localStorage.getItem('warehouseUser');
  return raw ? JSON.parse(raw) : null;
}

function clearStoredUser() {
  localStorage.removeItem('warehouseUser');
}

function formatDate(value) {
  if (!value) return '-';
  // support Firestore tracking.date as int yyyymmdd or timestamp/string
  if (typeof value === 'number' || (/^\d{8}$/.test(String(value)))) {
    const s = String(value);
    const y = parseInt(s.slice(0,4),10);
    const m = parseInt(s.slice(4,6),10) - 1;
    const d = parseInt(s.slice(6,8),10);
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? String(value) : dt.toLocaleDateString();
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function buildInventoryRow(item, typeName, track) {
  const canEdit = window.currentUser?.privilege === 2;
  const row = document.createElement('tr');
  row.dataset.id = item.id;
  // show editable inputs for name/sn, typeID is editable (not typeName); show typeName as title
  row.innerHTML = `
    <td>${item.id}</td>
    <td><input class="cell-input" data-field="name" value="${item.name || ''}" ${canEdit ? '' : 'readonly'}></td>
    <td><input class="cell-input" data-field="sn" value="${item.sn || ''}" ${canEdit ? '' : 'readonly'}></td>
    <td><input class="cell-input" data-field="type" value="${item.typeID || ''}" title="${typeName}" ${canEdit ? '' : 'readonly'}></td>
    <td>${formatDate(track?.date)}</td>
    <td>${track?.ownerName || '-'}</td>
    <td>${canEdit ? '<button class="save-row-btn">Save</button>' : ''}</td>
  `;
  return row;
}

async function loadInventory() {
  const dataSnapshot = await getDocs(collection(db, 'assets'));
  const trackingSnapshot = await getDocs(collection(db, 'tracking'));
  const typeSnapshot = await getDocs(collection(db, 'type'));

  const typeNames = {};
  typeSnapshot.forEach(docSnap => {
    const value = docSnap.data();
    typeNames[docSnap.id] = value.name || docSnap.id;
  });

  const latestTrack = {};
  // tracking documents keyed by assetsID; date is yyyymmdd int
  trackingSnapshot.forEach(docSnap => {
    const track = docSnap.data();
    const key = docSnap.id || track.assetsID || track.dataId;
    if (!key) return;
    if (!latestTrack[key] || Number(track.date) > Number(latestTrack[key].date)) {
      latestTrack[key] = track;
    }
  });

  const tableBody = document.querySelector('#inventory-table tbody');
  tableBody.innerHTML = '';

  dataSnapshot.forEach(docSnap => {
    const item = docSnap.data();
    item.id = docSnap.id;
    // asset fields: detailID, name, sn, typeID
    const track = latestTrack[item.id];
    const typeName = typeNames[item.typeID] || item.typeID || '-';
    const row = buildInventoryRow(item, typeName, track);
    tableBody.appendChild(row);
  });
}

async function saveRow(id, row) {
  const name = row.querySelector('input[data-field="name"]').value.trim();
  const sn = row.querySelector('input[data-field="sn"]').value.trim();
  const typeID = row.querySelector('input[data-field="type"]').value.trim();

  // update assets collection (typeID field is used for types)
  await updateDoc(doc(db, 'assets', id), {
    name,
    sn,
    typeID
  });
  await loadInventory();
}

function setPrivilegeSections(privilege) {
  const admin = document.getElementById('admin-panel');
  const viewOnly = document.getElementById('priv-view-only');
  if (privilege === 2) {
    admin.classList.remove('hidden');
    viewOnly.classList.add('hidden');
  } else {
    admin.classList.add('hidden');
    viewOnly.classList.remove('hidden');
  }
}

async function loadUsers() {
  const snapshot = await getDocs(collection(db, 'users'));
  const container = document.getElementById('user-management-list');
  container.innerHTML = '';

  snapshot.forEach(docSnap => {
    const username = docSnap.id;
    const userData = docSnap.data();
    const row = document.createElement('div');
    row.className = 'user-row';
    row.innerHTML = `
      <div><strong>${username}</strong></div>
      <div>Privilege:</div>
      <div>
        <select data-username="${username}" class="privilege-select">
          <option value="viewer" ${String(userData.priviledge) === 'viewer' ? 'selected' : ''}>Viewer</option>
          <option value="admin" ${String(userData.priviledge) === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <button class="update-user-btn" data-username="${username}">Update</button>
    `;
    container.appendChild(row);
  });
}

async function loadTypes() {
  const snapshot = await getDocs(collection(db, 'type'));
  const container = document.getElementById('type-management-list');
  container.innerHTML = '';

  snapshot.forEach(docSnap => {
    const typeData = docSnap.data();
    const row = document.createElement('div');
    row.className = 'type-row';
    row.innerHTML = `
      <div><strong>${docSnap.id}</strong> - ${typeData.name || ''}</div>
      <div>Value fields:</div>
      <div><input class="type-value-input" data-id="${docSnap.id}" value="${typeData.value || ''}" /></div>
      <button class="save-type-btn" data-id="${docSnap.id}">Save</button>
    `;
    container.appendChild(row);
  });
}

async function loadOwners() {
  const snapshot = await getDocs(collection(db, 'owners'));
  const container = document.getElementById('owner-management-list');
  container.innerHTML = '';

  snapshot.forEach(docSnap => {
    const owner = docSnap.data();
    const row = document.createElement('div');
    row.className = 'owner-row';
    row.innerHTML = `
      <div><strong>${docSnap.id}</strong></div>
      <div>${owner.name || ''}</div>
      <button class="delete-owner-btn" data-id="${docSnap.id}">Delete</button>
    `;
    container.appendChild(row);
  });
}

async function addOwner(name) {
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
  await setDoc(doc(db, 'owners', id), { name });
  await loadOwners();
}

async function updateUserPrivilege(username, privilege) {
  // privilege is expected to be 'admin' or 'viewer'
  const val = String(privilege) === 'admin' ? 'admin' : 'viewer';
  await updateDoc(doc(db, 'users', username), { priviledge: val });
  await loadUsers();
}

async function saveType(id, value) {
  await updateDoc(doc(db, 'type', id), { value });
  await loadTypes();
}

window.addEventListener('DOMContentLoaded', async () => {
  const storedUser = getStoredUser();
  if (!storedUser || !storedUser.username) {
    window.location.href = '../index.html';
    return;
  }

  window.currentUser = storedUser;
  document.getElementById('user-name').textContent = storedUser.username;
  document.getElementById('user-privilege').textContent = storedUser.privilege === 2 ? 'Editor' : 'Viewer';
  setPrivilegeSections(storedUser.privilege);

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearStoredUser();
    window.location.href = '../index.html';
  });

  await loadInventory();
  if (storedUser.privilege === 2) {
    await loadUsers();
    await loadTypes();
    await loadOwners();
  }

  document.getElementById('inventory-table').addEventListener('click', async event => {
    if (event.target.matches('.save-row-btn')) {
      const row = event.target.closest('tr');
      const id = row.dataset.id;
      await saveRow(id, row);
      alert('Inventory row saved');
    }
  });

  document.getElementById('user-management-list').addEventListener('click', async event => {
    if (event.target.matches('.update-user-btn')) {
      const username = event.target.dataset.username;
      const select = document.querySelector(`select[data-username="${username}"]`);
      await updateUserPrivilege(username, select.value);
      alert('User privilege updated');
    }
  });

  document.getElementById('type-management-list').addEventListener('click', async event => {
    if (event.target.matches('.save-type-btn')) {
      const id = event.target.dataset.id;
      const input = document.querySelector(`input[data-id="${id}"]`);
      await saveType(id, input.value.trim());
      alert('Type values saved');
    }
  });

  document.getElementById('owner-add-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('new-owner-name');
    const name = nameInput.value.trim();
    if (!name) {
      alert('Enter owner name');
      return;
    }
    await addOwner(name);
    nameInput.value = '';
    alert('Owner added');
  });

  document.getElementById('owner-management-list').addEventListener('click', async event => {
    if (event.target.matches('.delete-owner-btn')) {
      const id = event.target.dataset.id;
      await deleteDoc(doc(db, 'owners', id));
      await loadOwners();
      alert('Owner deleted');
    }
  });
});
