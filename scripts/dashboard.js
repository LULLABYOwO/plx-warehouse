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
  // support Firestore tracking.date as int yyyymmdd or Timestamp/Date/string
  // Firestore Timestamp objects have a toDate() method
  if (value && typeof value.toDate === 'function') {
    value = value.toDate();
  }
  if (typeof value === 'number' || (/^\d{8}$/.test(String(value)))) {
    const s = String(value);
    const y = s.slice(0,4);
    const m = s.slice(4,6);
    const d = s.slice(6,8);
    return `${d}/${m}/${y}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return value;
  const dd = ('0' + date.getDate()).slice(-2);
  const mm = ('0' + (date.getMonth() + 1)).slice(-2);
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function intDateToISO(intDate) {
  if (!intDate) return '';
  // accept Firestore Timestamp or Date or int yyyymmdd
  if (intDate && typeof intDate.toDate === 'function') {
    const d = intDate.toDate();
    const yyyy = d.getFullYear();
    const mm = ('0' + (d.getMonth() + 1)).slice(-2);
    const dd = ('0' + d.getDate()).slice(-2);
    return `${yyyy}-${mm}-${dd}`;
  }
  if (intDate instanceof Date) {
    const yyyy = intDate.getFullYear();
    const mm = ('0' + (intDate.getMonth() + 1)).slice(-2);
    const dd = ('0' + intDate.getDate()).slice(-2);
    return `${yyyy}-${mm}-${dd}`;
  }
  const s = String(intDate);
  if (!/^\d{8}$/.test(s)) return '';
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}

function isoToIntDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return Number(`${y}${m}${day}`);
}

function buildInventoryRow(item, typeName, track, typeOptionsHtml, ownersOptionsHtml) {
  const canEdit = window.currentUser?.privilege === 2;
  const row = document.createElement('tr');
  row.dataset.id = item.id;
  // show editable inputs for name/sn, typeID is editable (not typeName); show typeName as title
  row.innerHTML = `
    <td>${item.id}</td>
    <td><input class="cell-input" data-field="name" value="${item.name || ''}" ${canEdit ? '' : 'readonly'}></td>
    <td><input class="cell-input" data-field="sn" value="${item.sn || ''}" ${canEdit ? '' : 'readonly'}></td>
    <td>
      ${canEdit ? `<select class="cell-input" data-field="type">${typeOptionsHtml}</select>` : `<span title="${typeName}">${typeName}</span>`}
    </td>
    <td>
      ${canEdit ? `<input type="date" data-field="date" value="${intDateToISO(track?.date)}" style="display:none">` : ''}
      ${canEdit ? `<button class="date-display-btn" data-id="${item.id}" style="display:inline-block;width:100%;height:100%;padding:6px 8px;border:0;background:transparent;text-align:left">${formatDate(track?.date)}</button>` : `<div class="date-display">${formatDate(track?.date)}</div>`}
    </td>
    <td>
      ${canEdit ? `<select data-field="owner">${ownersOptionsHtml}</select>` : `${track?.ownerName || '-'}`}
    </td>
    <td>${canEdit ? '<button class="save-row-btn">Save</button>' : ''}</td>
  `;

  // If editable select, set selected value to the asset's typeID
  if (canEdit) {
    const sel = row.querySelector('select[data-field="type"]');
    if (sel && item.typeID) sel.value = item.typeID;
    const ownerSel = row.querySelector('select[data-field="owner"]');
    if (ownerSel) {
      // try to select by owner ID if tracking stored ownerID, otherwise match by ownerName
      if (track?.ownerID) {
        ownerSel.value = track.ownerID;
      } else if (track?.ownerName) {
        const opt = Array.from(ownerSel.options).find(o => o.text === track.ownerName);
        if (opt) ownerSel.value = opt.value;
      }
    }
  }
  // expose previous track info for save logic
  row.dataset.trackDate = track?.date || '';
  row.dataset.trackOwner = track?.ownerName || '';
  return row;
}

async function loadInventory() {
  const dataSnapshot = await getDocs(collection(db, 'assets'));
  const trackingSnapshot = await getDocs(collection(db, 'tracking'));
  const typeSnapshot = await getDocs(collection(db, 'types'));
  const ownersSnapshot = await getDocs(collection(db, 'owners'));

  const typeNames = {};
  typeSnapshot.forEach(docSnap => {
    const value = docSnap.data();
    typeNames[docSnap.id] = value.name || docSnap.id;
  });
  // build options html for admin selects
  let typeOptionsHtml = '';
  typeSnapshot.forEach(docSnap => {
    const value = docSnap.data();
    const name = value.name || docSnap.id;
    typeOptionsHtml += `<option value="${docSnap.id}">${name}</option>`;
  });
  let ownersOptionsHtml = '';
  ownersSnapshot.forEach(docSnap => {
    const o = docSnap.data();
    const name = o.name || docSnap.id;
    ownersOptionsHtml += `<option value="${docSnap.id}">${name}</option>`;
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
    const row = buildInventoryRow(item, typeName, track, typeOptionsHtml, ownersOptionsHtml);
    tableBody.appendChild(row);
  });
}
async function saveRow(id, row) {
  const name = row.querySelector('input[data-field="name"]').value.trim();
  const sn = row.querySelector('input[data-field="sn"]').value.trim();
  // support select for type when admin; fall back to input if present
  const typeSelect = row.querySelector('select[data-field="type"]');
  const typeID = typeSelect ? (typeSelect.value || '').trim() : (row.querySelector('input[data-field="type"]')?.value.trim() || '');

  // update assets collection (typeID field is used for types)
  await updateDoc(doc(db, 'assets', id), {
    name,
    sn,
    typeID
  });
  // update tracking: date and owner if present
  const dateInput = row.querySelector('input[data-field="date"]');
  const ownerSelect = row.querySelector('select[data-field="owner"]');
  let trackUpdate = {};
  if (dateInput) {
    const intDate = isoToIntDate(dateInput.value);
    if (intDate) trackUpdate.date = intDate;
  }
  if (ownerSelect) {
    const ownerId = ownerSelect.value;
    const ownerName = ownerSelect.selectedOptions[0]?.text || '';
    trackUpdate.ownerName = ownerName;
    trackUpdate.ownerID = ownerId;
  }
  if (Object.keys(trackUpdate).length > 0) {
    trackUpdate.assetsID = id;
    await setDoc(doc(db, 'tracking', id), trackUpdate, { merge: true });
  }
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
    const isSelf = window.currentUser && window.currentUser.username === username;
    row.innerHTML = `
      <div><strong>${username}${isSelf ? ' (you)' : ''}</strong></div>
      <div>Privilege:</div>
      <div>
        <select data-username="${username}" class="privilege-select" ${isSelf ? 'disabled' : ''}>
          <option value="viewer" ${String(userData.priviledge) === 'viewer' ? 'selected' : ''}>Viewer</option>
          <option value="admin" ${String(userData.priviledge) === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      ${isSelf ? '<button class="update-user-btn" disabled>Update</button>' : `<button class="update-user-btn" data-username="${username}">Update</button>`}
    `;
    container.appendChild(row);
  });
}

async function loadTypes() {
  const snapshot = await getDocs(collection(db, 'types'));
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
  // Prevent admins from changing their own privilege here in the client
  if (window.currentUser && window.currentUser.username === username) {
    alert('Bạn không thể thay đổi quyền của chính mình.');
    return;
  }
  // privilege is expected to be 'admin' or 'viewer'
  const val = String(privilege) === 'admin' ? 'admin' : 'viewer';
  await updateDoc(doc(db, 'users', username), { priviledge: val });
  await loadUsers();
}

async function saveType(id, value) {
  await updateDoc(doc(db, 'types', id), { value });
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
  // Determine admin status from stored numeric or role string
  const isAdmin = (storedUser.privilege === 2) || (String(storedUser.role).toLowerCase() === 'admin');
  document.getElementById('user-privilege').textContent = isAdmin ? 'Admin' : 'Viewer';
  setPrivilegeSections(isAdmin ? 2 : 1);

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearStoredUser();
    window.location.href = '../index.html';
  });

  await loadInventory();
  if (isAdmin) {
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
    if (event.target.matches('.date-display-btn')) {
      const btn = event.target;
      const row = btn.closest('tr');
      const input = row.querySelector('input[data-field="date"]');
      if (!input) return;
      // toggle visibility and focus
      const visible = input.style.display !== 'none';
      input.style.display = visible ? 'none' : '';
      if (!visible) {
        input.focus();
        // when input value changes, update button label immediately for feedback
        input.addEventListener('change', () => {
          btn.textContent = formatDate(isoToIntDate(input.value) || input.value);
        }, { once: false });
      }
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
