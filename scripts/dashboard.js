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

function monthNames() {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'];
}

function pad(value) {
  return ('0' + value).slice(-2);
}

function renderCalendarBody(picker) {
  const mode = picker.dataset.mode || 'days';
  const year = Number(picker.dataset.year);
  const month = Number(picker.dataset.month);
  const hiddenInput = picker.previousElementSibling;
  const selectedIso = hiddenInput?.value || '';
  const selectedDate = selectedIso ? new Date(selectedIso) : null;

  // Month selector mode
  if (mode === 'months') {
    const selectedMonth = selectedDate ? selectedDate.getMonth() : month;
    const monthsHtml = Array.from({ length: 12 }, (_, idx) => `
      <button type="button" class="calendar-month-item${idx === selectedMonth ? ' selected' : ''}" data-month="${idx}" data-id="${picker.dataset.id}">${pad(idx + 1)}</button>
    `).join('');
    picker.innerHTML = `
      <div class="calendar-header">
        <button type="button" class="calendar-nav" data-action="prev" data-id="${picker.dataset.id}">&#9664;</button>
        <button type="button" class="calendar-back" data-action="back" data-id="${picker.dataset.id}">Ngày</button>
        <button type="button" class="calendar-nav" data-action="next" data-id="${picker.dataset.id}">&#9654;</button>
      </div>
      <div class="calendar-days months">
        ${monthsHtml}
      </div>
    `;
    return;
  }

  // Year selector mode - show 18 years in one page
  if (mode === 'years') {
    const selectedYear = selectedDate ? selectedDate.getFullYear() : year;
    const span = 18;
    let startYear = Number(picker.dataset.startYear);
    if (!Number.isFinite(startYear)) {
      const half = Math.floor((span - 1) / 2);
      startYear = year - half;
    }
    picker.dataset.startYear = startYear;
    let yearsHtml = '';
    for (let i = 0; i < span; i += 1) {
      const y = startYear + i;
      const selectedClass = y === selectedYear ? ' selected' : '';
      yearsHtml += `<button type="button" class="calendar-year-item${selectedClass}" data-year="${y}" data-id="${picker.dataset.id}">${y}</button>`;
    }
    picker.innerHTML = `
      <div class="calendar-header">
        <button type="button" class="calendar-nav" data-action="prev" data-id="${picker.dataset.id}">&#9664;</button>
        <button type="button" class="calendar-back" data-action="back" data-id="${picker.dataset.id}">Chọn ngày</button>
        <button type="button" class="calendar-nav" data-action="next" data-id="${picker.dataset.id}">&#9654;</button>
      </div>
      <div class="calendar-days years">
        ${yearsHtml}
      </div>
    `;
    return;
  }

  // Default: day picker
  const monthName = monthNames()[month];
  const firstOfMonth = new Date(year, month, 1);
  const firstDayOfWeek = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let daysHtml = '';
  for (let i = 0; i < firstDayOfWeek; i += 1) {
    daysHtml += '<div class="calendar-day empty"></div>';
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const isSelected = selectedDate && selectedDate.getFullYear() === year && selectedDate.getMonth() === month && selectedDate.getDate() === day;
    daysHtml += `<button type="button" class="calendar-day${isSelected ? ' selected' : ''}" data-day="${day}" data-id="${picker.dataset.id}">${day}</button>`;
  }
  picker.innerHTML = `
    <div class="calendar-header">
      <button type="button" class="calendar-nav" data-action="prev" data-id="${picker.dataset.id}">&#9664;</button>
      <div class="calendar-title"><button type="button" class="calendar-month" data-id="${picker.dataset.id}">${pad(month + 1)}</button> <button type="button" class="calendar-year" data-id="${picker.dataset.id}">${year}</button></div>
      <button type="button" class="calendar-nav" data-action="next" data-id="${picker.dataset.id}">&#9654;</button>
    </div>
    <div class="calendar-weekdays">
      <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
    </div>
    <div class="calendar-days">
      ${daysHtml}
    </div>
  `;
}

function buildInventoryDatePicker(itemId, isoDate) {
  const defaultIso = isoDate || intDateToISO(new Date());
  const current = new Date(defaultIso);
  const year = current.getFullYear();
  const month = current.getMonth();
  return `
    <input type="hidden" data-field="date" value="${defaultIso}">
    <div class="inline-date-picker" data-id="${itemId}" data-year="${year}" data-month="${month}"></div>
  `;
}

function buildInventoryRow(item, typeName, track, typeOptionsHtml, ownersOptionsHtml) {
  const canEdit = canEditData(window.currentUser?.privilege);
  const canEditId = window.currentUser?.privilege >= 3;
  const selected = window.selectedAssets && window.selectedAssets.has(item.id);
  const resolvedTypeName = typeName || window.typeNames?.[item.typeID] || window.typeNames?.[item.type] || item.typeName || item.type || item.typeID || '-';
  const row = document.createElement('tr');
  row.dataset.originalId = item.id;
  // show editable inputs for name/sn, typeID is editable (not typeName); show typeName as title
  row.innerHTML = `
    <td>${canEdit ? `<input type="checkbox" class="row-select" data-id="${item.id}" ${selected ? 'checked' : ''}>` : ''}</td>
    <td>${canEditId ? `<input class="cell-input asset-id-input" data-field="id" value="${item.id}">` : `<input class="cell-input asset-id-input" data-field="id" value="${item.id}" readonly>`}</td>
    <td><input class="cell-input" data-field="name" value="${item.name || ''}" ${canEdit ? '' : 'readonly'}></td>
    <td><input class="cell-input" data-field="sn" value="${item.sn || ''}" ${canEdit ? '' : 'readonly'}></td>
    <td>
      ${canEdit ? `<select class="cell-input" data-field="type">${typeOptionsHtml}</select>` : `<input class="cell-input" data-field="type" value="${resolvedTypeName}" readonly>`}
    </td>
    <td>
      <div class="date-picker-wrapper"><div class="date-input-group"><input class="date-edit-input" value="${formatDate(track?.date)}" ${canEdit ? '' : 'readonly'}>${canEdit ? `<button type="button" class="date-open-btn" data-id="${item.id}">D</button>` : ''}</div>${buildInventoryDatePicker(item.id, intDateToISO(track?.date))}</div>
    </td>
    <td>
      ${canEdit ? `<select class="cell-input" data-field="owner">${ownersOptionsHtml}</select>` : `<input class="cell-input" data-field="owner" value="${track?.ownerName || ''}" readonly>`}
    </td>
    <td><button type="button" class="green-btn detail-row-btn" data-id="${item.id}">Chi tiết</button></td>
  `;

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
      typeName: typeNames[item.typeID] || item.typeName || item.type || item.typeID || '-',
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
  if (admin) {
    if (privilege >= 3) {
      admin.classList.remove('hidden');
    } else {
      admin.classList.add('hidden');
    }
  }
  if (viewOnly) {
    if (privilege >= 2) {
      viewOnly.classList.add('hidden');
    } else {
      viewOnly.classList.remove('hidden');
    }
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
    return ['viewer', 'editor', 'admin'];
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

function openDrawer(title, contentHtml, saveHandler, addButtonLabel, addButtonHandler) {
  const drawer = document.getElementById('detail-drawer');
  const header = drawer.querySelector('.detail-drawer-header');
  header.innerHTML = `
    <div><h2>${title}</h2></div>
    <div class="drawer-header-actions">
      ${saveHandler ? '<button id="drawer-save-btn" class="green-btn">Save</button>' : ''}
      ${addButtonLabel ? `<button id="drawer-add-btn" class="green-btn">${addButtonLabel}</button>` : ''}
      <button id="detail-close-btn" class="secondary-btn">Close</button>
    </div>
  `;
  document.getElementById('detail-drawer-content').innerHTML = contentHtml;
  window.drawerSaveHandler = saveHandler || null;
  window.drawerAddHandler = addButtonHandler || null;
  drawer.classList.remove('hidden');
  drawer.classList.add('open');
}

function closeDrawer() {
  const drawer = document.getElementById('detail-drawer');
  drawer.classList.add('hidden');
  drawer.classList.remove('open');
  window.drawerSaveHandler = null;
}

function renderUserManagementSheet() {
  return getDocs(collection(db, 'users')).then(snapshot => {
    const currentRole = normalizeRole(window.currentUser?.role);
    const rows = [];
    let headerRow = '';
    if (currentRole === 'super-admin') {
      headerRow = `
      <div class="management-row management-header user-management-header">
        <div>Username</div>
        <div>Password</div>
        <div>Privilege</div>
        <div>Action</div>
      </div>
      `;
    } else if (currentRole === 'admin') {
      // Admin: no Action column
      headerRow = `
      <div class="management-row management-header user-management-header">
        <div>Username</div>
        <div>Password</div>
        <div>Privilege</div>
      </div>
      `;
    } else {
      // Editor / Viewer: only show username and password
      headerRow = `
      <div class="management-row management-header user-management-header">
        <div>Username</div>
        <div>Password</div>
      </div>
      `;
    }

    snapshot.forEach(docSnap => {
      const username = docSnap.id;
      const targetRole = normalizeRole(docSnap.data().privilege);
      const isSelf = window.currentUser && window.currentUser.username === username;
      const currentDisplay = roleDisplay(targetRole);

      const isSuperUser = targetRole === 'super-admin';
      // Admin should not see super-admin accounts
      if (currentRole === 'admin' && isSuperUser) {
        return;
      }
      // Editor/Viewer only see themselves
      if ((currentRole === 'editor' || currentRole === 'viewer') && username !== window.currentUser?.username) {
        return;
      }

      const canEditPassword = currentRole === 'super-admin' || username === window.currentUser?.username;
      const targetPrivilege = roleToPrivilege(targetRole);
      const canChangePrivilege = currentRole === 'super-admin' || (currentRole === 'admin' && targetPrivilege <= 2);
      const shouldDisableSelect = currentRole === 'admin' && targetPrivilege === 3;
      // Lock privilege select for any super-admin row (including self) when current user is super-admin
      const privilegeLocked = currentRole === 'super-admin' && (targetRole === 'super-admin');
      const privilegeOptions = currentRole === 'super-admin' ? ['viewer','editor','admin','super-admin'] : ['viewer','editor','admin'];
      const showDeleteButton = isSuperUser ? `<button class="drawer-user-delete green-btn" disabled title="Không thể xóa Super admin">Delete</button>` : (currentRole === 'super-admin' && !isSelf ? `<button class="drawer-user-delete green-btn" data-username="${username}">Delete</button>` : '');
      // Password editable if current user can edit passwords and this row is not another super-admin
      const passwordDisabled = (targetRole === 'super-admin' && username !== window.currentUser?.username) ? 'disabled' : (canEditPassword ? '' : 'disabled');
      const disabledSelectAttr = (shouldDisableSelect || privilegeLocked) ? 'disabled' : '';
      const disabledStyle = privilegeLocked ? 'style="opacity:0.6"' : '';

      const privilegeControl = `
            <select class="drawer-user-role" data-username="${username}" ${disabledSelectAttr} ${disabledStyle}>
              ${privilegeOptions.map(option => `
                <option value="${option}" ${targetRole === option ? 'selected' : ''}>${roleDisplay(option)}</option>
              `).join('')}
            </select>
          `;

      let rowHtml = `
        <div class="management-row user-row" data-username="${username}" data-role="${targetRole}">
          <div class="user-column user-username">${username}</div>
          <div class="user-column user-password">
            <input class="drawer-user-password" type="password" autocomplete="new-password" placeholder="New password" value="" ${passwordDisabled} ${ (targetRole === 'super-admin' && username !== window.currentUser?.username) ? 'style="opacity:0.6"' : '' }>
          </div>
      `;

      // Privilege column for Admin and Super-admin
      if (currentRole === 'admin' || currentRole === 'super-admin') {
        rowHtml += `
          <div class="user-column user-privilege">
            ${ (currentRole === 'admin' || currentRole === 'super-admin') ? (canChangePrivilege ? privilegeControl : `<select class="drawer-user-role" disabled>${privilegeOptions.map(option => `<option value="${option}" ${targetRole === option ? 'selected' : ''}>${roleDisplay(option)}</option>`).join('')}</select>`) : `<div class="field-value">${currentDisplay}</div>` }
          </div>
        `;
      }

      // Action column only for Super-admin
      if (currentRole === 'super-admin') {
        rowHtml += `
          <div class="user-column user-delete">
            ${showDeleteButton}
          </div>
        `;
      }

      rowHtml += `</div>`;
      rows.push(rowHtml);
    });

    return `
      <div class="drawer-info">Chỉnh quyền người dùng</div>
      ${headerRow}
      ${rows.join('')}
    `;
  });
}

async function saveUserManagementSheet() {
  const currentRole = normalizeRole(window.currentUser?.role);
  const currentUsername = window.currentUser?.username;
  const rows = Array.from(document.querySelectorAll('.user-row'));
  const updates = [];

  rows.forEach(row => {
    const username = row.dataset.username;
    if (!username) return;
    const passwordInput = row.querySelector('.drawer-user-password');
    const roleSelect = row.querySelector('.drawer-user-role');
    const password = passwordInput?.value || '';
    const rowRole = row.dataset.role || '';

    if (currentRole === 'super-admin') {
      // Do not allow editing other super-admin accounts (privilege or password)
      if (rowRole === 'super-admin' && username !== currentUsername) return;
      const privilege = roleSelect ? normalizeRole(roleSelect.value) : undefined;
      const data = {};
      if (password && username === currentUsername) data.password = password;
      // Do not allow changing privilege for any super-admin row (including self)
      if (privilege && rowRole !== 'super-admin') data.privilege = privilege;
      if (Object.keys(data).length) {
        updates.push(updateDoc(doc(db, 'users', username), data).catch(e => console.error('Update user failed', username, e)));
      }
    } else if (currentRole === 'admin') {
      if (username === currentUsername && password) {
        updates.push(updateDoc(doc(db, 'users', username), { password }).catch(e => console.error('Update self password failed', username, e)));
      }
      if (roleSelect && !roleSelect.disabled) {
        const privilege = normalizeRole(roleSelect.value);
        if (privilege) {
          updates.push(updateDoc(doc(db, 'users', username), { privilege }).catch(e => console.error('Update user privilege failed', username, e)));
        }
      }
    } else if (username === currentUsername) {
      if (password) {
        updates.push(updateDoc(doc(db, 'users', username), { password }).catch(e => console.error('Update self password failed', username, e)));
      }
    }
  });

  // Handle new user creation (super-admin only)
  if (currentRole === 'super-admin') {
    const newUserRows = Array.from(document.querySelectorAll('.drawer-user-new'));
    newUserRows.forEach(newUserRow => {
      const usernameInput = newUserRow.querySelector('.new-user-username');
      const passwordInput = newUserRow.querySelector('.new-user-password');
      const roleSelect = newUserRow.querySelector('.new-user-role');
      const username = usernameInput?.value.trim();
      const password = passwordInput?.value || '';
      const role = roleSelect ? normalizeRole(roleSelect.value) : 'viewer';
      if (username && password) {
        updates.push(setDoc(doc(db, 'users', username), { password, privilege: role }).catch(e => console.error('Create user failed', username, e)));
      }
    });
  }

  await Promise.all(updates);
  await renderCurrentDrawerSection();
}

function renderTypeManagementSheet() {
  return getDocs(collection(db, 'types')).then(snapshot => {
    const rows = [];
    rows.push(`
      <div class="management-row management-header">
        <div>ID</div>
        <div>Name</div>
        <div>Value</div>
        <div></div>
      </div>
    `);
    snapshot.forEach(docSnap => {
      const typeData = docSnap.data();
      rows.push(`
        <div class="management-row type-row" data-id="${docSnap.id}">
          <div class="field-value">${docSnap.id}</div>
          <input class="drawer-type-name" data-id="${docSnap.id}" value="${typeData.name || ''}">
          <input class="drawer-type-value" data-id="${docSnap.id}" value="${typeData.value || ''}">
          <button type="button" class="drawer-type-delete green-btn" data-id="${docSnap.id}">Delete</button>
        </div>
      `);
    });
    return `
      <div class="drawer-info">Quản lý loại tài sản</div>
      <div class="management-table">
        ${rows.join('')}
      </div>
    `;
  });
}

async function saveTypeManagementSheet() {
  const updates = [];
  const typeRows = Array.from(document.querySelectorAll('.type-row'));
  typeRows.forEach(row => {
    const id = row.dataset.id;
    const nameInput = row.querySelector('.drawer-type-name');
    const valueInput = row.querySelector('.drawer-type-value');
    if (!id || !nameInput || !valueInput) return;
    updates.push(updateDoc(doc(db, 'types', id), {
      name: nameInput.value.trim(),
      value: valueInput.value.trim()
    }).catch(e => console.error('Type update failed', id, e)));
  });
  const newRows = Array.from(document.querySelectorAll('.drawer-type-new'));
  newRows.forEach(newRow => {
    const newIdInput = newRow.querySelector('.drawer-type-id');
    const newNameInput = newRow.querySelector('.drawer-type-name');
    const newValueInput = newRow.querySelector('.drawer-type-value');
    const newId = newIdInput?.value.trim();
    if (newId) {
      updates.push(setDoc(doc(db, 'types', newId), {
        name: newNameInput.value.trim(),
        value: newValueInput.value.trim()
      }).catch(e => console.error('Create type failed', newId, e)));
    }
  });
  await Promise.all(updates);
  // process pending deletes for types
  if (window.pendingDeletesTypes && window.pendingDeletesTypes.size) {
    const dels = [];
    window.pendingDeletesTypes.forEach(id => {
      dels.push(deleteDoc(doc(db, 'types', id)).catch(e => console.error('Delete type failed', id, e)));
    });
    await Promise.all(dels);
    window.pendingDeletesTypes.clear();
  }

  await renderCurrentDrawerSection();
}

function renderOwnerManagementSheet() {
  return getDocs(collection(db, 'owners')).then(snapshot => {
    const rows = [];
    rows.push(`
      <div class="management-row management-header">
        <div>ID</div>
        <div>Name</div>
        <div></div>
      </div>
    `);
    snapshot.forEach(docSnap => {
      const ownerData = docSnap.data();
      rows.push(`
        <div class="management-row owner-row" data-id="${docSnap.id}">
          <div class="field-value">${docSnap.id}</div>
          <input class="drawer-owner-name" data-id="${docSnap.id}" value="${ownerData.name || ''}">
          <button type="button" class="drawer-owner-delete green-btn" data-id="${docSnap.id}">Delete</button>
        </div>
      `);
    });
    return `
      <div class="drawer-info">Quản lý chủ sở hữu</div>
      <div class="management-table">
        ${rows.join('')}
      </div>
    `;
  });
}

async function saveOwnerManagementSheet() {
  const updates = [];
  const ownerRows = Array.from(document.querySelectorAll('.owner-row'));
  ownerRows.forEach(row => {
    const id = row.dataset.id;
    const nameInput = row.querySelector('.drawer-owner-name');
    if (!id || !nameInput) return;
    updates.push(updateDoc(doc(db, 'owners', id), { name: nameInput.value.trim() }).catch(e => console.error('Owner update failed', id, e)));
  });
  const newRows = Array.from(document.querySelectorAll('.drawer-owner-new'));
  newRows.forEach(newRow => {
    const newIdInput = newRow.querySelector('.drawer-owner-id');
    const newNameInput = newRow.querySelector('.drawer-owner-name');
    const newId = newIdInput?.value.trim();
    if (newId) {
      updates.push(setDoc(doc(db, 'owners', newId), { name: newNameInput.value.trim() }).catch(e => console.error('Create owner failed', newId, e)));
    }
  });
  await Promise.all(updates);

  if (window.pendingDeletesOwners && window.pendingDeletesOwners.size) {
    const dels = [];
    window.pendingDeletesOwners.forEach(id => {
      dels.push(deleteDoc(doc(db, 'owners', id)).catch(e => console.error('Delete owner failed', id, e)));
    });
    await Promise.all(dels);
    window.pendingDeletesOwners.clear();
  }

  await renderCurrentDrawerSection();
}

function renderAssetManagementSheet() {
  const rows = [];
  rows.push(`
    <div class="management-row management-header">
      <div><strong>Số thẻ</strong></div>
      <div><strong>Tên</strong></div>
      <div><strong>Số seri</strong></div>
      <div><strong>Loại</strong></div>
      <div><strong>Ngày sử dụng</strong></div>
      <div><strong>Bên sử dụng</strong></div>
    </div>
  `);

  const isAddOnly = window.currentDrawerSection === 'add-assets';
  const canEdit = canEditData(window.currentUser?.privilege);
  if (isAddOnly) {
    rows.push(`
      <div class="management-row asset-row drawer-asset-new">
        <input class="drawer-asset-id" placeholder="New ID">
        <input class="drawer-asset-name" placeholder="Tên">
        <input class="drawer-asset-sn" placeholder="Số seri">
        <select class="drawer-asset-type">${window.inventoryTypeOptionsHtml}</select>
        <div class="date-picker-wrapper"> <div class="date-input-group"><input class="date-edit-input" value="${formatDate(intDateToISO(new Date()))}">${canEdit ? `<button type="button" class="date-open-btn" data-id="new-${Date.now()}">D</button>` : ''}</div> ${buildInventoryDatePicker('new-' + Date.now())}</div>
        <select class="drawer-asset-owner">${window.ownersOptionsHtml}</select>
      </div>
    `);
  } else {
    (window.inventoryData || []).forEach(item => {
      rows.push(`
        <div class="management-row asset-row" data-id="${item.id}">
          <div class="field-value">${item.id}</div>
          <input class="drawer-asset-name" data-id="${item.id}" value="${item.name || ''}">
          <input class="drawer-asset-sn" data-id="${item.id}" value="${item.sn || ''}">
          <select class="drawer-asset-type" data-id="${item.id}">${window.inventoryTypeOptionsHtml}</select>
          <div class="date-picker-wrapper"> <div class="date-input-group"><input class="date-edit-input" value="${formatDate(item.track?.date)}">${canEdit ? `<button type="button" class="date-open-btn" data-id="${item.id}">D</button>` : ''}</div> ${buildInventoryDatePicker(item.id, intDateToISO(item.track?.date))}</div>
          <select class="drawer-asset-owner" data-id="${item.id}">${window.ownersOptionsHtml}</select>
        </div>
      `);
    });
  }

  return `
    <div class="drawer-info">Quản lý tài sản</div>
    <div class="management-table asset-management-table">
      ${rows.join('')}
    </div>
  `;
}

async function saveAssetManagementSheet() {
  const existingRows = Array.from(document.querySelectorAll('.asset-row'));
  const newRows = Array.from(document.querySelectorAll('.drawer-asset-new'));
  const ops = [];
  const errors = [];

  // Update existing assets
  for (const row of existingRows) {
    const id = row.dataset.id;
    const nameInput = row.querySelector('.drawer-asset-name');
    const snInput = row.querySelector('.drawer-asset-sn');
    const typeSelect = row.querySelector('.drawer-asset-type');
    const dateInput = row.querySelector('input[data-field="date"]');
    const ownerSelect = row.querySelector('.drawer-asset-owner');
    if (!id || !nameInput || !typeSelect) continue;
    const name = nameInput.value.trim();
    const sn = snInput ? snInput.value.trim() : '';
    const typeID = typeSelect.value;
    ops.push(updateDoc(doc(db, 'assets', id), { name, sn, typeID }).catch(e => {
      errors.push(`Update asset ${id} failed: ${e.message}`);
    }));

    const trackUpdate = {};
    const intDate = dateInput ? isoToIntDate(dateInput.value) : null;
    if (intDate) trackUpdate.date = intDate;
    if (ownerSelect) {
      trackUpdate.ownerID = ownerSelect.value;
      trackUpdate.ownerName = ownerSelect.selectedOptions[0]?.text || '';
    }
    if (Object.keys(trackUpdate).length > 0) {
      trackUpdate.assetsID = id;
      ops.push(setDoc(doc(db, 'tracking', id), trackUpdate, { merge: true }).catch(e => {
        errors.push(`Update tracking ${id} failed: ${e.message}`);
      }));
    }
  }

  // Create new assets
  for (const row of newRows) {
    const idInput = row.querySelector('.drawer-asset-id');
    const nameInput = row.querySelector('.drawer-asset-name');
    const snInput = row.querySelector('.drawer-asset-sn');
    const typeSelect = row.querySelector('.drawer-asset-type');
    const dateInput = row.querySelector('input[data-field="date"]');
    const ownerSelect = row.querySelector('.drawer-asset-owner');
    if (!idInput || !nameInput || !typeSelect) {
      errors.push('A new asset row is missing required inputs.');
      continue;
    }
    const id = idInput.value.trim();
    const name = nameInput.value.trim();
    const sn = snInput ? snInput.value.trim() : '';
    const typeID = typeSelect.value;

    // Validate required fields (SN optional)
    if (!id) { errors.push('New asset missing ID.'); continue; }
    if (!name) { errors.push(`New asset ${id} missing name.`); continue; }
    if (!typeID) { errors.push(`New asset ${id} missing type.`); continue; }
    // date and owner are required per UX; enforce if present in UI
    const intDate = dateInput ? isoToIntDate(dateInput.value) : null;
    const ownerId = ownerSelect ? ownerSelect.value : '';
    if (!intDate) { errors.push(`New asset ${id} missing date.`); continue; }
    if (!ownerId) { errors.push(`New asset ${id} missing owner.`); continue; }

    // ensure ID does not already exist
    try {
      const existing = await getDoc(doc(db, 'assets', id));
      if (existing.exists()) {
        errors.push(`Asset ID already exists: ${id}`);
        continue;
      }
    } catch (e) {
      errors.push(`Check exists for ${id} failed: ${e.message}`);
      continue;
    }

    const assetData = { name, sn, typeID };
    ops.push(setDoc(doc(db, 'assets', id), assetData).catch(e => {
      errors.push(`Create asset ${id} failed: ${e.message}`);
    }));

    const trackUpdate = { assetsID: id };
    if (intDate) trackUpdate.date = intDate;
    if (ownerSelect) {
      trackUpdate.ownerID = ownerSelect.value;
      trackUpdate.ownerName = ownerSelect.selectedOptions[0]?.text || '';
    }
    ops.push(setDoc(doc(db, 'tracking', id), trackUpdate, { merge: true }).catch(e => {
      errors.push(`Create tracking ${id} failed: ${e.message}`);
    }));
  }

  // Wait for all operations
  await Promise.all(ops);

  // Report errors if any
  if (errors.length) {
    alert('Save completed with errors:\n' + errors.join('\n'));
  }

  await loadInventory();
  await renderCurrentDrawerSection();
}

function addNewAssetRow() {
  const content = document.getElementById('detail-drawer-content');
  const newRow = document.createElement('div');
  newRow.className = 'management-row asset-row drawer-asset-new';
  const ts = Date.now();
  const canEdit = canEditData(window.currentUser?.privilege);
  newRow.innerHTML = `
    <input class="drawer-asset-id" placeholder="New ID">
    <input class="drawer-asset-name" placeholder="Tên">
    <input class="drawer-asset-sn" placeholder="Số seri">
    <select class="drawer-asset-type">${window.inventoryTypeOptionsHtml}</select>
    <div class="date-picker-wrapper"> <div class="date-input-group"><input class="date-edit-input" value="${formatDate(intDateToISO(new Date()))}">${canEdit ? `<button type="button" class="date-open-btn" data-id="new-${ts}">D</button>` : ''}</div> ${buildInventoryDatePicker('new-' + ts)}</div>
    <select class="drawer-asset-owner">${window.ownersOptionsHtml}</select>
  `;
  // Prefer appending into the existing management table so the new row aligns with other rows
  const table = content.querySelector('.management-table') || content;
  table.appendChild(newRow);
  table.scrollTop = table.scrollHeight;
}

function addNewOwnerRow() {
  const content = document.getElementById('detail-drawer-content');
  const newRow = document.createElement('div');
  newRow.className = 'management-row owner-row drawer-owner-new';
  newRow.innerHTML = `
    <input class="drawer-owner-id" placeholder="New ID">
    <input class="drawer-owner-name" placeholder="Name">
    <div></div>
    <button type="button" class="drawer-owner-delete green-btn" disabled>Delete</button>
  `;
  content.appendChild(newRow);
  content.scrollTop = content.scrollHeight;
}

function addNewTypeRow() {
  const content = document.getElementById('detail-drawer-content');
  const newRow = document.createElement('div');
  newRow.className = 'management-row type-row drawer-type-new';
  newRow.innerHTML = `
    <input class="drawer-type-id" placeholder="New ID">
    <input class="drawer-type-name" placeholder="Name">
    <input class="drawer-type-value" placeholder="Value">
    <button type="button" class="drawer-type-delete green-btn" disabled>Delete</button>
  `;
  content.appendChild(newRow);
  content.scrollTop = content.scrollHeight;
}

function addNewUserRow() {
  const content = document.getElementById('detail-drawer-content');
  const newRow = document.createElement('div');
  newRow.className = 'management-row drawer-user-new';
  newRow.innerHTML = `
    <div class="user-column user-username">
      <input class="new-user-username" autocomplete="new-username" placeholder="Username">
    </div>
    <div class="user-column user-password">
      <input class="new-user-password" autocomplete="new-password" placeholder="Password" type="password">
    </div>
    <div class="user-column user-privilege">
      <select class="new-user-role">
        ${['viewer','editor','admin','super-admin'].map(option => `
          <option value="${option}">${roleDisplay(option)}</option>
        `).join('')}
      </select>
    </div>
    <div class="user-column user-delete">
      <button type="button" class="drawer-user-new-delete green-btn">Delete</button>
    </div>
  `;
  content.appendChild(newRow);
  content.scrollTop = content.scrollHeight;
}

async function renderCurrentDrawerSection() {
  if (!window.currentDrawerSection) return;
  if (window.currentDrawerSection === 'users') {
    const html = await renderUserManagementSheet();
    const currentRole = normalizeRole(window.currentUser?.role);
    if (currentRole === 'super-admin') {
      openDrawer('Quản lý người dùng', html, saveUserManagementSheet, 'Thêm mới', addNewUserRow);
    } else {
      openDrawer('Quản lý người dùng', html, saveUserManagementSheet);
    }
  }
  if (window.currentDrawerSection === 'types') {
    const html = await renderTypeManagementSheet();
    openDrawer('Quản lý loại tài sản', html, saveTypeManagementSheet, 'Thêm mới', addNewTypeRow);
  }
  if (window.currentDrawerSection === 'owners') {
    const html = await renderOwnerManagementSheet();
    openDrawer('Quản lý chủ sở hữu', html, saveOwnerManagementSheet, 'Thêm mới', addNewOwnerRow);
  }
  if (window.currentDrawerSection === 'add-assets') {
    const html = renderAssetManagementSheet();
    openDrawer('Quản lý tài sản', html, saveAssetManagementSheet, 'Thêm mới', addNewAssetRow);
  }
}

function roleDisplay(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'super-admin') return 'Super Admin';
  if (r === 'admin') return 'Admin';
  if (r === 'editor') return 'Editor';
  return 'Viewer';
}

async function loadUsers() {
  const container = document.getElementById('user-management-list');
  if (!container) return;
  const snapshot = await getDocs(collection(db, 'users'));
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
  const container = document.getElementById('type-management-list');
  if (!container) return;
  const snapshot = await getDocs(collection(db, 'types'));
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
  const container = document.getElementById('owner-management-list');
  if (!container) return;
  const snapshot = await getDocs(collection(db, 'owners'));
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
  // hide controls for viewers / non-editors
  const canEdit = canEditData(privilege);
  if (!canEdit) {
    document.getElementById('inventory-add-btn')?.classList.add('hidden');
    document.getElementById('inventory-delete-btn')?.classList.add('hidden');
    document.getElementById('bulk-save-btn')?.classList.add('hidden');
  }
  const isAdmin = privilege >= 3;

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearStoredUser();
    window.location.href = '../index.html';
  });

  await loadInventory();
  // Always load types and owners so viewers can see readable names
  await loadTypes();
  await loadOwners();
  if (isAdmin) {
    await loadUsers();
  }

  document.getElementById('inventory-table').addEventListener('click', async event => {
    if (event.target.matches('.date-open-btn')) {
      if (!canEditData(window.currentUser?.privilege)) return;
      const btn = event.target;
      const row = btn.closest('tr');
      const picker = row.querySelector('.inline-date-picker');
      if (!picker) return;
      const isVisible = picker.classList.contains('visible');
      if (!isVisible) {
        picker.classList.remove('hidden');
        picker.dataset.mode = 'days';
        renderCalendarBody(picker);
      }
      picker.classList.toggle('visible', !isVisible);
    }
    if (event.target.matches('.calendar-month')) {
      const button = event.target;
      const row = button.closest('tr');
      const picker = row.querySelector('.inline-date-picker');
      if (!picker) return;
      picker.dataset.mode = 'months';
      renderCalendarBody(picker);
    }
    if (event.target.matches('.calendar-year')) {
      const button = event.target;
      const row = button.closest('tr');
      const picker = row.querySelector('.inline-date-picker');
      if (!picker) return;
      picker.dataset.mode = 'years';
      renderCalendarBody(picker);
    }
    if (event.target.matches('.calendar-back')) {
      const button = event.target;
      const row = button.closest('tr');
      const picker = row.querySelector('.inline-date-picker');
      if (!picker) return;
      picker.dataset.mode = 'days';
      renderCalendarBody(picker);
    }
    if (event.target.matches('.calendar-nav')) {
      const button = event.target;
      const row = button.closest('tr');
      const picker = row.querySelector('.inline-date-picker');
      if (!picker) return;
      let year = Number(picker.dataset.year);
      let month = Number(picker.dataset.month);
      if (button.dataset.action === 'prev') {
        if ((picker.dataset.mode || 'days') === 'months') {
          year -= 1;
        } else if ((picker.dataset.mode || 'days') === 'years') {
          const startYear = Number(picker.dataset.startYear) || year - 8;
          picker.dataset.startYear = startYear - 18;
        } else {
          month -= 1;
          if (month < 0) {
            month = 11;
            year -= 1;
          }
        }
      } else {
        if ((picker.dataset.mode || 'days') === 'months') {
          year += 1;
        } else if ((picker.dataset.mode || 'days') === 'years') {
          const startYear = Number(picker.dataset.startYear) || year - 8;
          picker.dataset.startYear = startYear + 18;
        } else {
          month += 1;
          if (month > 11) {
            month = 0;
            year += 1;
          }
        }
      }
      picker.dataset.year = year;
      picker.dataset.month = month;
      renderCalendarBody(picker);
    }
    if (event.target.matches('.calendar-day')) {
      const day = event.target.dataset.day;
      const row = event.target.closest('tr');
      const picker = row.querySelector('.inline-date-picker');
      const hiddenInput = row.querySelector('input[data-field="date"]');
      const input = row.querySelector('.date-edit-input');
      if (!picker || !hiddenInput || !input) return;
      const year = Number(picker.dataset.year);
      const month = Number(picker.dataset.month);
      hiddenInput.value = `${year}-${pad(month + 1)}-${pad(day)}`;
      input.value = formatDate(hiddenInput.value);
      picker.dataset.mode = 'days';
      renderCalendarBody(picker);
    }
    if (event.target.matches('.calendar-month-item')) {
      const m = Number(event.target.dataset.month);
      const row = event.target.closest('tr');
      const picker = row.querySelector('.inline-date-picker');
      if (!picker) return;
      picker.dataset.month = m;
      picker.dataset.mode = 'days';
      renderCalendarBody(picker);
    }
    if (event.target.matches('.calendar-year-item')) {
      const y = Number(event.target.dataset.year);
      const row = event.target.closest('tr');
      const picker = row.querySelector('.inline-date-picker');
      if (!picker) return;
      picker.dataset.year = y;
      picker.dataset.mode = 'days';
      renderCalendarBody(picker);
    }
    if (event.target.matches('.detail-row-btn')) {
      const assetId = event.target.dataset.id;
      await openDetailDrawer(assetId);
    }
  });

  // Drawer calendar behaviors (for asset management drawer)
  const drawerContent = document.getElementById('detail-drawer-content');
  if (drawerContent) {
    drawerContent.addEventListener('click', event => {
      if (event.target.matches('.date-open-btn')) {
        if (!canEditData(window.currentUser?.privilege)) return;
        const btn = event.target;
        const row = btn.closest('.management-row');
        const picker = row.querySelector('.inline-date-picker');
        if (!picker) return;
        const isVisible = picker.classList.contains('visible');
        if (!isVisible) {
          picker.classList.remove('hidden');
          picker.dataset.mode = 'days';
          renderCalendarBody(picker);
        }
        picker.classList.toggle('visible', !isVisible);
      }
      if (event.target.matches('.calendar-month')) {
        const button = event.target;
        const row = button.closest('.management-row');
        const picker = row.querySelector('.inline-date-picker');
        if (!picker) return;
        picker.dataset.mode = 'months';
        renderCalendarBody(picker);
      }
      if (event.target.matches('.calendar-year')) {
        const button = event.target;
        const row = button.closest('.management-row');
        const picker = row.querySelector('.inline-date-picker');
        if (!picker) return;
        picker.dataset.mode = 'years';
        renderCalendarBody(picker);
      }
      if (event.target.matches('.calendar-back')) {
        const button = event.target;
        const row = button.closest('.management-row');
        const picker = row.querySelector('.inline-date-picker');
        if (!picker) return;
        picker.dataset.mode = 'days';
        renderCalendarBody(picker);
      }
      if (event.target.matches('.calendar-nav')) {
        const button = event.target;
        const row = button.closest('.management-row');
        const picker = row.querySelector('.inline-date-picker');
        if (!picker) return;
        let year = Number(picker.dataset.year);
        let month = Number(picker.dataset.month);
        if (button.dataset.action === 'prev') {
          if ((picker.dataset.mode || 'days') === 'months') {
            year -= 1;
          } else if ((picker.dataset.mode || 'days') === 'years') {
            const currentStart = Number(picker.dataset.startYear) || year - 8;
            picker.dataset.startYear = currentStart - 18;
          } else {
            month -= 1;
            if (month < 0) {
              month = 11;
              year -= 1;
            }
          }
        } else {
          if ((picker.dataset.mode || 'days') === 'months') {
            year += 1;
          } else if ((picker.dataset.mode || 'days') === 'years') {
            const currentStart = Number(picker.dataset.startYear) || year - 8;
            picker.dataset.startYear = currentStart + 18;
          } else {
            month += 1;
            if (month > 11) {
              month = 0;
              year += 1;
            }
          }
        }
        picker.dataset.year = year;
        picker.dataset.month = month;
        renderCalendarBody(picker);
      }
      if (event.target.matches('.calendar-day')) {
        const day = event.target.dataset.day;
        const row = event.target.closest('.management-row');
        const picker = row.querySelector('.inline-date-picker');
        const hiddenInput = row.querySelector('input[data-field="date"]');
        const input = row.querySelector('.date-edit-input');
        if (!picker || !hiddenInput || !input) return;
        const year = Number(picker.dataset.year);
        const month = Number(picker.dataset.month);
        hiddenInput.value = `${year}-${pad(month + 1)}-${pad(day)}`;
        input.value = formatDate(hiddenInput.value);
        picker.dataset.mode = 'days';
        renderCalendarBody(picker);
      }
      if (event.target.matches('.calendar-month-item')) {
        const m = Number(event.target.dataset.month);
        const row = event.target.closest('.management-row');
        const picker = row.querySelector('.inline-date-picker');
        if (!picker) return;
        picker.dataset.month = m;
        picker.dataset.mode = 'days';
        renderCalendarBody(picker);
      }
      if (event.target.matches('.calendar-year-item')) {
        const y = Number(event.target.dataset.year);
        const row = event.target.closest('.management-row');
        const picker = row.querySelector('.inline-date-picker');
        if (!picker) return;
        picker.dataset.year = y;
        picker.dataset.mode = 'days';
        renderCalendarBody(picker);
      }
    });

    drawerContent.addEventListener('change', event => {
      if (event.target.matches('.date-picker-select')) {
        const row = event.target.closest('.management-row');
        if (!row) return;
        const picker = row.querySelector('.inline-date-picker');
        const hiddenInput = row.querySelector('input[data-field="date"]');
        const input = row.querySelector('.date-edit-input');
        if (!picker || !hiddenInput || !input) return;
        const day = picker.querySelector('select[data-part="day"]').value;
        const month = picker.querySelector('select[data-part="month"]').value;
        const year = picker.querySelector('select[data-part="year"]').value;
        if (day && month && year) {
          hiddenInput.value = `${year}-${month}-${day}`;
          input.value = formatDate(isoToIntDate(hiddenInput.value));
        }
      }
      if (event.target.matches('.date-edit-input')) {
        const input = event.target;
        const row = input.closest('.management-row');
        if (!row) return;
        const hiddenInput = row.querySelector('input[data-field="date"]');
        if (!hiddenInput) return;
        const parts = input.value.split('/').map(p => p.trim());
        if (parts.length === 3) {
          const dd = pad(Number(parts[0]));
          const mm = pad(Number(parts[1]));
          const yyyy = parts[2];
          if (!isNaN(Number(dd)) && !isNaN(Number(mm)) && !isNaN(Number(yyyy))) {
            hiddenInput.value = `${yyyy}-${mm}-${dd}`;
          }
        }
      }
    });
  }

  document.getElementById('inventory-table').addEventListener('change', event => {
    if (event.target.matches('.row-select')) {
      const id = event.target.dataset.id;
      if (!window.selectedAssets) window.selectedAssets = new Set();
      if (event.target.checked) window.selectedAssets.add(id);
      else window.selectedAssets.delete(id);
      updateSelectAllState();
      return;
    }
    if (event.target.matches('.date-picker-select')) {
      const row = event.target.closest('tr');
      if (!row) return;
      const picker = row.querySelector('.inline-date-picker');
      const hiddenInput = row.querySelector('input[data-field="date"]');
      const btn = row.querySelector('.date-display-btn');
      if (!picker || !hiddenInput || !btn) return;
      const day = picker.querySelector('select[data-part="day"]').value;
      const month = picker.querySelector('select[data-part="month"]').value;
      const year = picker.querySelector('select[data-part="year"]').value;
      if (day && month && year) {
        hiddenInput.value = `${year}-${month}-${day}`;
        const input = row.querySelector('.date-edit-input');
        if (input) input.value = formatDate(hiddenInput.value);
      }
    }
    if (event.target.matches('.date-edit-input')) {
      const input = event.target;
      const row = input.closest('tr');
      if (!row) return;
      const hiddenInput = row.querySelector('input[data-field="date"]');
      if (!hiddenInput) return;
      // parse dd/mm/yyyy
      const parts = input.value.split('/').map(p => p.trim());
      if (parts.length === 3) {
        const dd = pad(Number(parts[0]));
        const mm = pad(Number(parts[1]));
        const yyyy = parts[2];
        if (!isNaN(Number(dd)) && !isNaN(Number(mm)) && !isNaN(Number(yyyy))) {
          hiddenInput.value = `${yyyy}-${mm}-${dd}`;
        }
      }
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

  const inventoryAddBtn = document.getElementById('inventory-add-btn');
  const inventoryDeleteBtn = document.getElementById('inventory-delete-btn');
  if (inventoryAddBtn) {
    inventoryAddBtn.addEventListener('click', async () => {
      window.currentDrawerSection = 'add-assets';
      await renderCurrentDrawerSection();
    });
  }
  if (inventoryDeleteBtn) {
    inventoryDeleteBtn.addEventListener('click', async () => {
      const selectedIds = Array.from(document.querySelectorAll('.row-select:checked')).map(cb => cb.dataset.id);
      if (!selectedIds.length) {
        alert('Hãy chọn ít nhất một tài sản để xóa.');
        return;
      }
      if (!confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} tài sản đã chọn không?`)) return;
      const deletes = [];
      selectedIds.forEach(id => {
        deletes.push(deleteDoc(doc(db, 'assets', id)));
        deletes.push(deleteDoc(doc(db, 'tracking', id)));
        deletes.push(deleteDoc(doc(db, 'details', id)));
      });
      await Promise.all(deletes);
      window.selectedAssets.clear();
      await loadInventory();
      alert('Đã xóa tài sản đã chọn.');
    });
  }

  const menuToggleBtn = document.getElementById('menu-toggle-btn');
  const mainMenu = document.getElementById('main-menu');
  const currentRole = normalizeRole(window.currentUser.role);
  const currentPrivilege = roleToPrivilege(currentRole);

  if (mainMenu) {
    // All roles can access user management; only type/owner sections are restricted.
    if (currentPrivilege < 2) {
      const typesItem = mainMenu.querySelector('[data-menu="types"]');
      const ownersItem = mainMenu.querySelector('[data-menu="owners"]');
      if (typesItem) typesItem.classList.add('hidden');
      if (ownersItem) ownersItem.classList.add('hidden');
    }
  }

  if (menuToggleBtn && mainMenu) {
    menuToggleBtn.addEventListener('click', event => {
      event.stopPropagation();
      mainMenu.classList.toggle('hidden');
    });

    mainMenu.addEventListener('click', async event => {
      const targetMenu = event.target.dataset.menu;
      if (!targetMenu) return;
      window.currentDrawerSection = targetMenu;
      await renderCurrentDrawerSection();
      mainMenu.classList.add('hidden');
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('#main-menu') && event.target !== menuToggleBtn) {
        mainMenu.classList.add('hidden');
      }
    });
  }

  document.getElementById('detail-drawer').addEventListener('click', async event => {
    if (event.target.id === 'detail-drawer') {
      closeDrawer();
      return;
    }
    if (event.target.id === 'detail-close-btn') {
      event.stopPropagation();
      closeDrawer();
      return;
    }
    if (event.target.id === 'drawer-save-btn' && typeof window.drawerSaveHandler === 'function') {
      await window.drawerSaveHandler();
      alert('Saved');
      return;
    }
    if (event.target.id === 'drawer-add-btn' && typeof window.drawerAddHandler === 'function') {
      event.preventDefault();
      window.drawerAddHandler();
      return;
    }
    if (event.target.matches('.drawer-type-delete')) {
      const row = event.target.closest('.type-row');
      if (!row) return;
      const id = row.dataset.id;
      if (id) {
        window.pendingDeletesTypes = window.pendingDeletesTypes || new Set();
        window.pendingDeletesTypes.add(id);
      }
      row.remove();
      return;
    }
    if (event.target.matches('.drawer-owner-delete')) {
      const row = event.target.closest('.owner-row');
      if (!row) return;
      const id = row.dataset.id;
      if (id) {
        window.pendingDeletesOwners = window.pendingDeletesOwners || new Set();
        window.pendingDeletesOwners.add(id);
      }
      row.remove();
      return;
    }
    if (event.target.matches('.drawer-user-delete')) {
      const username = event.target.dataset.username;
      if (!username) return;
      if (!confirm(`Delete user ${username}? This cannot be undone.`)) return;
      try {
        await deleteDoc(doc(db, 'users', username));
        await renderCurrentDrawerSection();
      } catch (e) {
        alert('Failed to delete user: ' + e.message);
      }
      return;
    }
    if (event.target.matches('.drawer-user-new-delete')) {
      const row = event.target.closest('.drawer-user-new');
      if (row) row.remove();
      return;
    }
    if (event.target.matches('#drawer-add-type')) {
      event.preventDefault();
      const content = document.getElementById('detail-drawer-content');
      const newRow = document.createElement('div');
      newRow.className = 'management-row type-row drawer-type-new';
      newRow.innerHTML = `
        <input class="drawer-type-id" placeholder="New ID">
        <input class="drawer-type-name" placeholder="Name">
        <input class="drawer-type-value" placeholder="Value">
        <button type="button" class="drawer-type-delete green-btn" disabled>Delete</button>
      `;
      content.appendChild(newRow);
      content.scrollTop = content.scrollHeight;
      return;
    }
    if (event.target.matches('#drawer-add-owner')) {
      event.preventDefault();
      const content = document.getElementById('detail-drawer-content');
      const newRow = document.createElement('div');
      newRow.className = 'management-row owner-row drawer-owner-new';
      newRow.innerHTML = `
        <input class="drawer-owner-id" placeholder="New ID">
        <input class="drawer-owner-name" placeholder="Name">
        <div></div>
        <button type="button" class="drawer-owner-delete green-btn" disabled>Delete</button>
      `;
      content.appendChild(newRow);
      content.scrollTop = content.scrollHeight;
      return;
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

  const typeManagementList = document.getElementById('type-management-list');
  if (typeManagementList) {
    typeManagementList.addEventListener('click', async event => {
      if (event.target.matches('.save-type-btn')) {
        const id = event.target.dataset.id;
        const input = document.querySelector(`input[data-id="${id}"]`);
        if (!input) return;
        await saveType(id, input.value.trim());
        alert('Type values saved');
      }
    });
  }

  const ownerAddButton = document.getElementById('owner-add-btn');
  if (ownerAddButton) {
    ownerAddButton.addEventListener('click', async () => {
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
  }

  const ownerManagementList = document.getElementById('owner-management-list');
  if (ownerManagementList) {
    ownerManagementList.addEventListener('click', async event => {
      if (event.target.matches('.delete-owner-btn')) {
        const id = event.target.dataset.id;
        await deleteDoc(doc(db, 'owners', id));
        await loadOwners();
        alert('Owner deleted');
      }
    });
  }
});
