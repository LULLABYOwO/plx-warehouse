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
  const canEdit = canEditData(window.currentUser?.privilege);
  const canEditId = window.currentUser?.privilege >= 3;
  const selected = window.selectedAssets && window.selectedAssets.has(item.id);
  const row = document.createElement('tr');
  row.dataset.originalId = item.id;
  // show editable inputs for name/sn, typeID is editable (not typeName); show typeName as title
  row.innerHTML = `
    <td>${canEdit ? `<input type="checkbox" class="row-select" data-id="${item.id}" ${selected ? 'checked' : ''}>` : ''}</td>
    <td>${canEditId ? `<input class="cell-input asset-id-input" data-field="id" value="${item.id}">` : `<span>${item.id}</span>`}</td>
    <td><input class="cell-input" data-field="name" value="${item.name || ''}" ${canEdit ? '' : 'readonly'}></td>
    <td><input class="cell-input" data-field="sn" value="${item.sn || ''}" ${canEdit ? '' : 'readonly'}></td>
    <td>
      ${canEdit ? `<select class="cell-input" data-field="type">${typeOptionsHtml}</select>` : `<span title="${typeName}">${typeName}</span>`}
    </td>
    <td>
      ${canEdit ? `<input type="date" data-field="date" value="${intDateToISO(track?.date)}" style="display:none">` : ''}
      ${canEdit ? `<button class="date-display-btn inline-btn" data-id="${item.id}">${formatDate(track?.date)}</button>` : `<div class="date-display">${formatDate(track?.date)}</div>`}
    </td>
    <td>
      ${canEdit ? `<select class="cell-input" data-field="owner">${ownersOptionsHtml}</select>` : `${track?.ownerName || '-'}`}
    </td>
    <td><button type="button" class="green-btn detail-row-btn" data-id="${item.id}">Chi tiết</button></td>
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
  const typeDetails = {};
  typeSnapshot.forEach(docSnap => {
    const value = docSnap.data();
    const name = value.name || docSnap.id;
    typeDetails[docSnap.id] = value;
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

  const inventoryItems = [];
  dataSnapshot.forEach(docSnap => {
    const item = docSnap.data();
    item.id = docSnap.id;
    const track = latestTrack[item.id];
    inventoryItems.push({
      ...item,
      typeName: typeNames[item.typeID] || item.typeID || '-',
      track: track || {}
    });
  });

  window.inventoryData = inventoryItems;
  window.typeNames = typeNames;
  window.typeDetails = typeDetails;
  window.inventoryTypeOptionsHtml = typeOptionsHtml;
  window.ownersOptionsHtml = ownersOptionsHtml;
  window.availableTypes = typeSnapshot.docs.map(docSnap => docSnap.data().name || docSnap.id).sort((a,b) => a.localeCompare(b));
  window.selectedAssets = new Set();
  window.searchField = window.searchField || 'name';
  window.typeFilter = window.typeFilter || 'All';

  buildTypeFilterMenu(window.availableTypes);
  renderInventoryRows(window.inventoryData);
}

function renderInventoryRows(items) {
  const tableBody = document.querySelector('#inventory-table tbody');
  tableBody.innerHTML = '';
  items.forEach(item => {
    const row = buildInventoryRow(item, item.typeName, item.track, window.inventoryTypeOptionsHtml, window.ownersOptionsHtml);
    tableBody.appendChild(row);
  });
  updateSelectAllState();
}

function applyInventoryFilters() {
  const searchQuery = document.getElementById('inventory-search').value.trim().toLowerCase();
  const searchField = window.searchField || 'name';
  const typeFilter = window.typeFilter || 'All';

  const filtered = (window.inventoryData || []).filter(item => {
    let text = '';
    if (searchField === 'name') text = item.name || '';
    else if (searchField === 'id') text = item.id || '';
    else if (searchField === 'sn') text = item.sn || '';
    const matchesSearch = String(text).toLowerCase().includes(searchQuery);
    const matchesType = typeFilter === 'All' || item.typeName === typeFilter;
    return matchesSearch && matchesType;
  });

  renderInventoryRows(filtered);
}

function buildTypeFilterMenu(types) {
  const filterMenu = document.getElementById('filter-type-menu');
  filterMenu.innerHTML = '';
  const allRow = document.createElement('button');
  allRow.type = 'button';
  allRow.className = 'dropdown-item';
  allRow.textContent = 'All';
  allRow.addEventListener('click', () => {
    window.typeFilter = 'All';
    document.getElementById('filter-type-toggle').textContent = 'All ▾';
    filterMenu.classList.add('hidden');
    applyInventoryFilters();
  });
  filterMenu.appendChild(allRow);

  types.forEach(typeName => {
    const itemBtn = document.createElement('button');
    itemBtn.type = 'button';
    itemBtn.className = 'dropdown-item';
    itemBtn.textContent = typeName;
    itemBtn.addEventListener('click', () => {
      window.typeFilter = typeName;
      document.getElementById('filter-type-toggle').textContent = `${typeName} ▾`;
      filterMenu.classList.add('hidden');
      applyInventoryFilters();
    });
    filterMenu.appendChild(itemBtn);
  });
}

function setSearchType(typeLabel, fieldName) {
  window.searchField = fieldName;
  document.getElementById('search-type-toggle').textContent = `${typeLabel} ▾`;
}

function toggleDropdown(menuId) {
  const menu = document.getElementById(menuId);
  if (!menu) return;
  menu.classList.toggle('hidden');
}

function closeDropdowns() {
  document.getElementById('search-type-menu')?.classList.add('hidden');
  document.getElementById('filter-type-menu')?.classList.add('hidden');
}

function updateSelectAllState() {
  const allCheckboxes = Array.from(document.querySelectorAll('.row-select'));
  if (!allCheckboxes.length) return;
  const selectedCount = allCheckboxes.filter(cb => cb.checked).length;
  const selectAll = document.getElementById('select-all');
  selectAll.checked = selectedCount === allCheckboxes.length;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < allCheckboxes.length;
}

function getSelectedRows() {
  return Array.from(document.querySelectorAll('.row-select:checked')).map(cb => cb.closest('tr'));
}

async function bulkSaveSelected() {
  const rows = getSelectedRows();
  if (!rows.length) {
    alert('No selected rows to save.');
    return;
  }
  for (const row of rows) {
    const originalId = row.dataset.originalid || row.dataset.originalId || row.dataset.id;
    await saveRow(originalId, row);
  }
  alert('Selected rows saved');
}

async function saveRow(originalId, row) {
  const canEditId = window.currentUser?.privilege >= 3;
  const name = row.querySelector('input[data-field="name"]').value.trim();
  const sn = row.querySelector('input[data-field="sn"]').value.trim();
  const idField = row.querySelector('input[data-field="id"]');
  const newId = idField ? idField.value.trim() : originalId;
  const typeSelect = row.querySelector('select[data-field="type"]');
  const typeID = typeSelect ? (typeSelect.value || '').trim() : (row.querySelector('input[data-field="type"]')?.value.trim() || '');

  if (!newId) {
    alert('Asset ID cannot be empty.');
    return;
  }

  const assetData = { name, sn, typeID };
  if (newId !== originalId) {
    const existing = await getDoc(doc(db, 'assets', newId));
    if (existing.exists()) {
      alert(`Asset ID already exists: ${newId}`);
      return;
    }
    await setDoc(doc(db, 'assets', newId), assetData);
    await deleteDoc(doc(db, 'assets', originalId));

    const detailSnap = await getDoc(doc(db, 'details', originalId));
    if (detailSnap.exists()) {
      await setDoc(doc(db, 'details', newId), detailSnap.data());
      await deleteDoc(doc(db, 'details', originalId));
    }
  } else {
    await updateDoc(doc(db, 'assets', originalId), assetData);
  }

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
    trackUpdate.assetsID = newId;
    await setDoc(doc(db, 'tracking', newId), trackUpdate, { merge: true });
    if (newId !== originalId) {
      const oldTrack = await getDoc(doc(db, 'tracking', originalId));
      if (oldTrack.exists()) {
        await deleteDoc(doc(db, 'tracking', originalId));
      }
    }
  } else if (newId !== originalId) {
    const oldTrack = await getDoc(doc(db, 'tracking', originalId));
    if (oldTrack.exists()) {
      await setDoc(doc(db, 'tracking', newId), oldTrack.data(), { merge: true });
      await deleteDoc(doc(db, 'tracking', originalId));
    }
  }

  await loadInventory();
}

async function openDetailDrawer(assetId) {
  let item = (window.inventoryData || []).find(entry => entry.id === assetId);
  if (!item) {
    item = (window.inventoryData || []).find(entry => entry.detailID === assetId || entry.assetID === assetId);
  }
  if (!item) return;

  const detailDoc = await getDoc(doc(db, 'details', assetId));
  const detailData = detailDoc.exists() ? detailDoc.data() : {};
  renderDetailDrawer(item, detailData);
  const drawer = document.getElementById('detail-drawer');
  drawer.classList.remove('hidden');
  drawer.classList.add('open');
}

function closeDetailDrawer() {
  const drawer = document.getElementById('detail-drawer');
  drawer.classList.add('hidden');
  drawer.classList.remove('open');
}

function renderDetailDrawer(item, detailData) {
  const canEdit = canEditData(window.currentUser?.privilege);
  const content = document.getElementById('detail-drawer-content');
  const typeId = item.typeID || item.type || item.typeId || item.detailID;
  const typeName = window.typeNames?.[typeId] || item.typeName || item.type || item.typeID || '-';
  let typeDef = window.typeDetails?.[typeId] || {};

  if (!typeDef.value && typeName && window.typeDetails) {
    typeDef = Object.values(window.typeDetails).find(typeItem => String(typeItem.name || '').trim().toLowerCase() === String(typeName).trim().toLowerCase()) || typeDef;
  }

  let valueFields = [];
  if (typeDef.value) {
    if (Array.isArray(typeDef.value)) {
      valueFields = typeDef.value.map(v => String(v).trim()).filter(Boolean);
    } else if (typeof typeDef.value === 'string') {
      valueFields = typeDef.value.split(',').map(v => v.trim()).filter(Boolean);
    }
  }

  if (!valueFields.length && detailData && typeof detailData === 'object') {
    valueFields = Object.keys(detailData).filter(key => key !== 'assetID' && key !== 'id');
  }

  let html = `
    <div class="detail-summary">
      <div><strong>Asset:</strong> ${item.id}</div>
      <div><strong>Name:</strong> ${item.name || '-'}</div>
      <div><strong>Type:</strong> ${typeName || '-'}</div>
    </div>
  `;

  if (!valueFields.length) {
    html += `
      <div class="detail-row">
        <label>Detail fields</label>
        <div class="field-value">No detail fields configured for this type.</div>
      </div>
    `;
  } else {
    valueFields.forEach(fieldName => {
      const value = detailData[fieldName] || '';
      if (canEdit) {
        html += `
          <div class="detail-row">
            <label>${fieldName}</label>
            <input type="text" class="detail-field" data-field="${fieldName}" value="${value}">
          </div>
        `;
      } else {
        html += `
          <div class="detail-row">
            <label>${fieldName}</label>
            <div class="field-value">${value || '-'}</div>
          </div>
        `;
      }
    });
  }

  if (canEdit && valueFields.length) {
    html += `
      <div class="detail-drawer-actions">
        <button id="detail-save-btn" class="green-btn" data-asset-id="${item.id}">Save changes</button>
      </div>
    `;
  }

  content.innerHTML = html;
}

async function saveDetailDrawer(assetId) {
  const drawer = document.getElementById('detail-drawer');
  const inputs = Array.from(drawer.querySelectorAll('.detail-field'));
  const data = {};
  inputs.forEach(input => {
    const key = input.dataset.field;
    let value = input.value;
    if (input.type === 'date') {
      value = isoToIntDate(value) || value;
    }
    data[key] = value;
  });

  await setDoc(doc(db, 'details', assetId), data, { merge: true });
  closeDetailDrawer();
}

function normalizeRole(rawRole) {
  const r = String(rawRole || '').trim().toLowerCase();
  if (r === '4' || r === 'super admin' || r === 'super-admin' || r === 'superadmin' || r === 'super_admin') {
    return 'super-admin';
  }
  if (r === '3' || r === 'admin') return 'admin';
  if (r === '2' || r === 'editor') return 'editor';
  return 'viewer';
}

function setPrivilegeSections(privilege) {
  const admin = document.getElementById('admin-panel');
  const viewOnly = document.getElementById('priv-view-only');
  if (privilege >= 3) {
    admin.classList.remove('hidden');
    viewOnly?.classList.add('hidden');
  } else {
    admin.classList.add('hidden');
    viewOnly?.classList.add('hidden');
  }
}

function roleToPrivilege(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'super-admin') return 4;
  if (r === 'admin') return 3;
  if (r === 'editor') return 2;
  return 1;
}

function canEditData(privilege) {
  return privilege >= 2;
}

function getManageableRoleOptions(currentRole) {
  const currentPrivilege = roleToPrivilege(currentRole);
  if (currentPrivilege === 4) {
    return ['viewer', 'editor', 'admin', 'super-admin'];
  }
  if (currentPrivilege === 3) {
    return ['viewer', 'editor'];
  }
  return [];
}

function canManageUsers(currentRole, targetRole) {
  const currentPrivilege = roleToPrivilege(currentRole);
  const targetPrivilege = roleToPrivilege(targetRole);
  if (currentPrivilege === 4) {
    return true;
  }
  if (currentPrivilege === 3) {
    return targetPrivilege <= 2;
  }
  return false;
}

function roleDisplay(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'super-admin') return 'Super Admin';
  if (r === 'admin') return 'Admin';
  if (r === 'editor') return 'Editor';
  return 'Viewer';
}

async function loadUsers() {
  const snapshot = await getDocs(collection(db, 'users'));
  const container = document.getElementById('user-management-list');
  container.innerHTML = '';

  const currentRole = normalizeRole(window.currentUser?.role);

  snapshot.forEach(docSnap => {
    const username = docSnap.id;
    const userData = docSnap.data();
    // use correctly-spelled `privilege` field from users docs
    const targetRole = normalizeRole(userData.privilege);
    const row = document.createElement('div');
    row.className = 'user-row';
    const isSelf = window.currentUser && window.currentUser.username === username;
    const canManage = canManageUsers(currentRole, targetRole) && !isSelf;
    const targetDisplay = roleDisplay(targetRole);

    let privilegeControl = `<span>${targetDisplay}</span>`;
    let updateButton = isSelf ? '<button class="update-user-btn" disabled>Update</button>' : '';

    if (canManage) {
      const options = getManageableRoleOptions(currentRole);
      privilegeControl = `
        <select data-username="${username}" class="privilege-select">
          ${options.map(option => `
            <option value="${option}" ${targetRole === option ? 'selected' : ''}>${roleDisplay(option)}</option>
          `).join('')}
        </select>
      `;
      updateButton = `<button class="update-user-btn green-btn" data-username="${username}">Update</button>`;
    }

    if (currentRole === 'super-admin' && isSelf) {
      privilegeControl = `<span>${targetDisplay}</span>`;
      updateButton = '<button class="update-user-btn" disabled>Update</button>';
    }

    row.innerHTML = `
      <div><strong>${username}${isSelf ? ' (you)' : ''}</strong></div>
      <div>Privilege:</div>
      <div>${privilegeControl}</div>
      ${updateButton}
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
      <button class="save-type-btn green-btn" data-id="${docSnap.id}">Save</button>
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
      <button class="delete-owner-btn green-btn" data-id="${docSnap.id}">Delete</button>
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
  if (window.currentUser && window.currentUser.username === username) {
    alert('Bạn không thể thay đổi quyền của chính mình.');
    return;
  }

  const currentRole = normalizeRole(window.currentUser.role);
  const targetRole = normalizeRole(privilege);
  const currentPrivilege = roleToPrivilege(currentRole);
  const targetPrivilege = roleToPrivilege(targetRole);

  if (currentPrivilege < 3) {
    alert('Bạn không có quyền thay đổi quyền người dùng.');
    return;
  }

  if (currentPrivilege === 3 && targetPrivilege >= 3) {
    alert('Admin chỉ có thể thay đổi quyền của editor hoặc viewer.');
    return;
  }

  const val = (targetRole === 'super-admin') ? 'super-admin' : (targetRole === 'admin' ? 'admin' : (targetRole === 'editor' ? 'editor' : 'viewer'));
  await updateDoc(doc(db, 'users', username), { privilege: val });
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
  const role = normalizeRole(storedUser.role);
  const privilege = Number(storedUser.privilege) || roleToPrivilege(role);
  document.getElementById('user-privilege').textContent = roleDisplay(role);
  setPrivilegeSections(privilege);
  const isAdmin = privilege >= 3;

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
    if (event.target.matches('.date-display-btn')) {
      const btn = event.target;
      const row = btn.closest('tr');
      const input = row.querySelector('input[data-field="date"]');
      if (!input) return;
      const visible = input.style.display !== 'none';
      input.style.display = visible ? 'none' : '';
      if (!visible) {
        input.focus();
        input.addEventListener('change', () => {
          btn.textContent = formatDate(isoToIntDate(input.value) || input.value);
        }, { once: false });
      }
    }
    if (event.target.matches('.detail-row-btn')) {
      const assetId = event.target.dataset.id;
      await openDetailDrawer(assetId);
    }
  });

  document.getElementById('inventory-table').addEventListener('change', event => {
    if (event.target.matches('.row-select')) {
      const id = event.target.dataset.id;
      if (!window.selectedAssets) window.selectedAssets = new Set();
      if (event.target.checked) window.selectedAssets.add(id);
      else window.selectedAssets.delete(id);
      updateSelectAllState();
    }
  });

  document.getElementById('select-all').addEventListener('change', event => {
    const checked = event.target.checked;
    document.querySelectorAll('.row-select').forEach(cb => {
      cb.checked = checked;
      if (!window.selectedAssets) window.selectedAssets = new Set();
      if (checked) window.selectedAssets.add(cb.dataset.id);
      else window.selectedAssets.delete(cb.dataset.id);
    });
    updateSelectAllState();
  });

  document.getElementById('bulk-save-btn').addEventListener('click', bulkSaveSelected);
  document.getElementById('search-btn').addEventListener('click', applyInventoryFilters);
  document.getElementById('search-type-toggle').addEventListener('click', () => toggleDropdown('search-type-menu'));
  document.getElementById('filter-type-toggle').addEventListener('click', () => toggleDropdown('filter-type-menu'));
  const detailCloseBtn = document.getElementById('detail-close-btn');
  if (detailCloseBtn) {
    detailCloseBtn.addEventListener('click', event => {
      event.stopPropagation();
      closeDetailDrawer();
    });
  }
  document.getElementById('detail-drawer').addEventListener('click', event => {
    if (event.target.id === 'detail-drawer') {
      closeDetailDrawer();
    }
  });

  document.querySelectorAll('#search-type-menu .dropdown-item').forEach(button => {
    button.addEventListener('click', () => {
      setSearchType(button.textContent.trim(), button.dataset.field);
      document.getElementById('search-type-menu').classList.add('hidden');
    });
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.search-type-select') && !event.target.closest('#search-type-toggle')) {
      document.getElementById('search-type-menu').classList.add('hidden');
    }
    if (!event.target.closest('.filter-type-dropdown') && !event.target.closest('#filter-type-toggle')) {
      document.getElementById('filter-type-menu').classList.add('hidden');
    }
  });

  document.body.addEventListener('click', async event => {
    if (event.target.matches('#detail-save-btn')) {
      const assetId = event.target.dataset.assetId;
      await saveDetailDrawer(assetId);
      alert('Detail saved');
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
