const DEFAULT_CATEGORIES = ["衣物", "书籍资料", "文具", "电子产品", "洗漱用品", "护肤化妆", "食品零食", "清洁用品", "生活杂物", "其他"];
const ITEM_ICONS = ["📦", "👕", "👟", "👜", "📚", "✏️", "📱", "💻", "🎧", "🔌", "🪥", "🧴", "💄", "🥤", "🍪", "🧹", "🧺", "🧸", "🔑", "🪴", "💊", "🎒"];
const state = { items: [], categories: [...DEFAULT_CATEGORIES], locations: [], activeCategory: "all", activeLocation: "all", query: "", editingId: null, draftIcon: ITEM_ICONS[0] };
const $ = (selector) => document.querySelector(selector);
const itemGrid = $("#item-grid");
const categoryFilter = $("#category-filter");
const categoryInput = $("#category-input");
const categoryList = $("#category-list");
const itemDialog = $("#item-dialog");
const detailDialog = $("#detail-dialog");
const itemForm = $("#item-form");
let toastTimer;
let database;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("dorm-inventory", 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("items")) {
        const store = database.createObjectStore("items", { keyPath: "id" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地数据存储"));
    request.onblocked = () => reject(new Error("本地数据正在被其他页面占用，请关闭重复页面后重试。"));
  });
}

function storeRequest(mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("items", mode);
    const request = operation(transaction.objectStore("items"));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || transaction.error || new Error("本地数据操作失败"));
    transaction.onabort = () => reject(transaction.error || new Error("本地数据操作未完成"));
    transaction.oncomplete = () => resolve(result);
  });
}

function saveItem(item) { return storeRequest("readwrite", (store) => store.put(item)); }
function readItems() { return storeRequest("readonly", (store) => store.getAll()); }
function removeItem(id) { return storeRequest("readwrite", (store) => store.delete(id)); }

function readCategories() {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("settings", "readonly");
    const request = transaction.objectStore("settings").get("categories");
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error || new Error("无法读取分类设置"));
  });
}

function readLocations() {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("settings", "readonly");
    const request = transaction.objectStore("settings").get("locations");
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error || new Error("无法读取位置设置"));
  });
}

function writeCategoryChange(categories, changedItems = []) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["items", "settings"], "readwrite");
    transaction.objectStore("settings").put({ key: "categories", value: categories });
    changedItems.forEach((item) => transaction.objectStore("items").put(item));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("保存分类失败"));
    transaction.onabort = () => reject(transaction.error || new Error("分类变更未完成"));
  });
}

function normalizeCategoryName(value) { return value.trim().replace(/\s+/g, " "); }

function renderCategoryOptions() {
  categoryInput.innerHTML = state.categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  categoryFilter.innerHTML = `<option value="all">全部分类</option>${state.categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
  categoryList.innerHTML = `<button class="category-chip${state.activeCategory === "all" ? " active" : ""}" type="button" data-category="all">全部</button>${state.categories.map((category) => `<button class="category-chip${state.activeCategory === category ? " active" : ""}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}`;
}

function renderLocationOptions() {
  const usedLocations = [...new Set(state.items.map((item) => item.location?.trim()).filter(Boolean))];
  state.locations = [...new Set([...state.locations, ...usedLocations])].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (state.activeLocation !== "all" && !state.locations.includes(state.activeLocation)) state.activeLocation = "all";
  const locationList = $("#location-list");
  locationList.innerHTML = state.locations.length
    ? `<button class="location-chip${state.activeLocation === "all" ? " active" : ""}" type="button" data-location="all">全部位置</button>${state.locations.map((location) => `<button class="location-chip${state.activeLocation === location ? " active" : ""}" type="button" data-location="${escapeHtml(location)}" title="${escapeHtml(location)}">${escapeHtml(location)}</button>`).join("")}`
    : `<span class="location-empty">记录过位置后会显示在这里</span>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function locationIcon() {
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 8.4c0 4.1-6 9-6 9s-6-4.9-6-9a6 6 0 1 1 12 0Z"/><circle cx="10" cy="8" r="2"/></svg>';
}

function iconMarkup(item) { return `<span class="item-emoji" aria-hidden="true">${escapeHtml(item.icon || ITEM_ICONS[0])}</span>`; }

function initCategoryOptions() {
  renderCategoryOptions();
}

function filteredItems() {
  const query = state.query.trim().toLocaleLowerCase();
  return state.items.filter((item) => {
    const matchesCategory = state.activeCategory === "all" || item.category === state.activeCategory;
    const matchesLocation = state.activeLocation === "all" || item.location?.trim() === state.activeLocation;
    const matchesQuery = !query || [item.name, item.category, item.location, item.note].some((value) => String(value || "").toLocaleLowerCase().includes(query));
    return matchesCategory && matchesLocation && matchesQuery;
  });
}

function render() {
  const items = filteredItems();
  $("#item-count").textContent = `${state.items.length} 件物品`;
  renderCategoryOptions();
  renderLocationOptions();
  categoryFilter.value = state.activeCategory;
  if (items.length === 0) {
    const isSearch = state.query || state.activeCategory !== "all" || state.activeLocation !== "all";
    itemGrid.innerHTML = `<div class="empty-state"><div class="empty-illustration">${isSearch ? "⌕" : "＋"}</div><h2>${isSearch ? "没有找到相关物品" : "仓库还是空的"}</h2><p>${isSearch ? "换个关键词或分类试试看。" : "先把常用的小物记下来吧。"}</p>${isSearch ? `<button class="button button-secondary" id="reset-filters" type="button">清除筛选</button>` : `<button class="button button-primary" id="empty-add-item" type="button">添加第一件物品</button>`}</div>`;
    $("#reset-filters")?.addEventListener("click", clearFilters);
    $("#empty-add-item")?.addEventListener("click", () => openForm());
    return;
  }
  itemGrid.innerHTML = items.map((item) => `<article class="item-card" tabindex="0" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}，${escapeHtml(item.location || "尚未记录位置")}">
    <div class="card-photo">${iconMarkup(item)}<span class="category-tag">${escapeHtml(item.category)}</span></div>
    <div class="card-body"><div class="card-title-row"><h2 class="card-title">${escapeHtml(item.name)}</h2><span class="quantity">× ${item.quantity}</span></div>
      <p class="card-location">${locationIcon()}<span>${escapeHtml(item.location || "尚未记录位置")}</span></p></div>
    </article>`).join("");
  itemGrid.querySelectorAll(".item-card").forEach((card) => {
    card.addEventListener("click", () => showDetail(card.dataset.id));
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showDetail(card.dataset.id); } });
  });
}

function clearFilters() {
  state.query = "";
  state.activeCategory = "all";
  state.activeLocation = "all";
  $("#search-input").value = "";
  render();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2100);
}

function renderIconOptions() {
  $("#emoji-options").innerHTML = ITEM_ICONS.map((icon) => `<button class="emoji-option${state.draftIcon === icon ? " selected" : ""}" type="button" role="radio" aria-checked="${state.draftIcon === icon}" aria-label="${escapeHtml(icon)}" data-icon="${escapeHtml(icon)}">${icon}</button>`).join("");
}

function openForm(item = null) {
  state.editingId = item?.id ?? null;
  state.draftIcon = ITEM_ICONS.includes(item?.icon) ? item.icon : ITEM_ICONS[0];
  itemForm.reset();
  $("#dialog-title").textContent = item ? "编辑物品" : "添加一件物品";
  $("#name-input").value = item?.name ?? "";
  $("#category-input").value = item?.category ?? state.categories[0];
  $("#quantity-input").value = item?.quantity ?? 1;
  $("#location-input").value = item?.location ?? "";
  $("#note-input").value = item?.note ?? "";
  $("#form-error").textContent = "";
  renderIconOptions();
  detailDialog.close();
  itemDialog.showModal();
  setTimeout(() => $("#name-input").focus(), 0);
}

function showDetail(id) {
  const item = state.items.find((record) => record.id === id);
  if (!item) return;
  $("#detail-content").innerHTML = `<div class="detail-hero">${iconMarkup(item)}<div class="detail-top-actions"><button class="icon-button" id="edit-item" type="button" aria-label="编辑">✎</button><button class="icon-button" id="delete-item" type="button" aria-label="删除">⌫</button><button class="icon-button" id="close-detail" type="button" aria-label="关闭">×</button></div></div>
    <div class="detail-content"><h2>${escapeHtml(item.name)}</h2><p class="detail-meta">${escapeHtml(item.category)} · 数量 ${item.quantity}</p><div class="detail-location">${locationIcon()}<span>${escapeHtml(item.location || "尚未记录位置")}</span></div>${item.note ? `<p class="detail-note">${escapeHtml(item.note)}</p>` : ""}<p class="detail-stamp">添加于 ${new Date(item.createdAt).toLocaleDateString("zh-CN")}</p></div>`;
  detailDialog.showModal();
  $("#close-detail").addEventListener("click", () => detailDialog.close());
  $("#edit-item").addEventListener("click", () => openForm(item));
  $("#delete-item").addEventListener("click", async () => {
    if (!window.confirm(`确定删除“${item.name}”吗？此操作无法撤销。`)) return;
    try {
      await removeItem(item.id);
    } catch (error) {
      showToast(`删除失败：${error.message || "请重试"}`);
      return;
    }
    state.items = state.items.filter((record) => record.id !== item.id);
    detailDialog.close();
    render();
    showToast("物品已删除");
  });
}

function renderCategoryManager() {
  const list = $("#category-manage-list");
  list.innerHTML = state.categories.map((category, index) => {
    const usedCount = state.items.filter((item) => item.category === category).length;
    const protectedCategory = category === "其他";
    return `<div class="category-manage-row" data-index="${index}"><span class="category-manage-name">${escapeHtml(category)}</span><span class="category-usage">${usedCount} 件物品</span><button class="category-action" type="button" data-action="rename" aria-label="重命名${escapeHtml(category)}">改名</button><button class="category-action danger" type="button" data-action="delete" aria-label="删除${escapeHtml(category)}"${protectedCategory ? " disabled title=\"其他分类用于接收被删除分类中的物品\"" : ""}>删除</button></div>`;
  }).join("");
}

function showCategoryError(message = "") { $("#category-error").textContent = message; }

async function renameCategory(oldName, newName) {
  const name = normalizeCategoryName(newName);
  if (!name) { showCategoryError("分类名称不能为空。"); return; }
  if (state.categories.some((category) => category.toLocaleLowerCase() === name.toLocaleLowerCase())) { showCategoryError("这个分类名称已经存在。"); return; }
  const categories = state.categories.map((category) => category === oldName ? name : category);
  const now = new Date().toISOString();
  const changedItems = state.items.filter((item) => item.category === oldName).map((item) => ({ ...item, category: name, updatedAt: now }));
  try {
    await writeCategoryChange(categories, changedItems);
    state.categories = categories;
    state.items = state.items.map((item) => item.category === oldName ? { ...item, category: name, updatedAt: now } : item);
    if (state.activeCategory === oldName) state.activeCategory = name;
    showCategoryError();
    renderCategoryManager();
    render();
    showToast("分类名称已更新");
  } catch (error) { showCategoryError(`保存失败：${error.message || "请重试"}`); }
}

async function deleteCategory(category) {
  if (category === "其他") return;
  const usedItems = state.items.filter((item) => item.category === category);
  const prompt = usedItems.length
    ? `“${category}”中有 ${usedItems.length} 件物品。删除后会将它们移至“其他”，确定继续吗？`
    : `确定删除“${category}”分类吗？`;
  if (!window.confirm(prompt)) return;
  const categories = state.categories.filter((item) => item !== category);
  const now = new Date().toISOString();
  const changedItems = usedItems.map((item) => ({ ...item, category: "其他", updatedAt: now }));
  try {
    await writeCategoryChange(categories, changedItems);
    state.categories = categories;
    state.items = state.items.map((item) => item.category === category ? { ...item, category: "其他", updatedAt: now } : item);
    if (state.activeCategory === category) state.activeCategory = "all";
    showCategoryError();
    renderCategoryManager();
    render();
    showToast(usedItems.length ? "分类已删除，相关物品已移至其他" : "分类已删除");
  } catch (error) { showCategoryError(`删除失败：${error.message || "请重试"}`); }
}

function renderLocationManager() {
  const usedLocations = [...new Set(state.items.map((item) => item.location?.trim()).filter(Boolean))];
  state.locations = [...new Set([...state.locations, ...usedLocations])].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const list = $("#location-manage-list");
  list.innerHTML = state.locations.length ? state.locations.map((location, index) => {
    const usedCount = state.items.filter((item) => item.location?.trim() === location).length;
    return `<div class="category-manage-row" data-index="${index}"><span class="category-manage-name" title="${escapeHtml(location)}">${escapeHtml(location)}</span><span class="category-usage">${usedCount} 件物品</span><button class="category-action" type="button" data-action="rename" aria-label="重命名位置${escapeHtml(location)}">改名</button><button class="category-action danger" type="button" data-action="delete" aria-label="删除位置${escapeHtml(location)}">删除</button></div>`;
  }).join("") : `<div class="empty-state location-manager-empty"><h2>还没有存放位置</h2><p>可以先添加一个常用位置。</p></div>`;
}

function showLocationError(message = "") { $("#location-error").textContent = message; }

async function saveLocationList(locations, changedItems = []) {
  try {
    await writeCategoryChange(state.categories, changedItems);
    const transaction = database.transaction("settings", "readwrite");
    transaction.objectStore("settings").put({ key: "locations", value: locations });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("保存位置失败"));
      transaction.onabort = () => reject(transaction.error || new Error("位置变更未完成"));
    });
    state.locations = locations;
    state.items = state.items.map((item) => changedItems.find((changed) => changed.id === item.id) || item);
    showLocationError();
    renderLocationManager();
    render();
  } catch (error) { showLocationError(`保存失败：${error.message || "请重试"}`); throw error; }
}

async function renameLocation(oldName, newName) {
  const name = normalizeCategoryName(newName);
  if (!name) { showLocationError("位置名称不能为空。"); return; }
  if (state.locations.some((location) => location.toLocaleLowerCase() === name.toLocaleLowerCase())) { showLocationError("这个位置名称已经存在。"); return; }
  const locations = state.locations.map((location) => location === oldName ? name : location);
  const now = new Date().toISOString();
  const changedItems = state.items.filter((item) => item.location?.trim() === oldName).map((item) => ({ ...item, location: name, updatedAt: now }));
  try {
    await saveLocationList(locations, changedItems);
    if (state.activeLocation === oldName) state.activeLocation = name;
    renderLocationManager();
    render();
    showToast("存放位置已更新");
  } catch {}
}

async function deleteLocation(location) {
  const usedItems = state.items.filter((item) => item.location?.trim() === location);
  const prompt = usedItems.length
    ? `“${location}”正被 ${usedItems.length} 件物品使用。删除后会清空这些物品的位置，确定继续吗？`
    : `确定删除“${location}”吗？`;
  if (!window.confirm(prompt)) return;
  const locations = state.locations.filter((item) => item !== location);
  const now = new Date().toISOString();
  const changedItems = usedItems.map((item) => ({ ...item, location: "", updatedAt: now }));
  try {
    await saveLocationList(locations, changedItems);
    if (state.activeLocation === location) state.activeLocation = "all";
    renderLocationManager();
    render();
    showToast(usedItems.length ? "位置已删除，相关物品的位置已清空" : "存放位置已删除");
  } catch {}
}

$("#add-item").addEventListener("click", () => openForm());
$("#close-dialog").addEventListener("click", () => itemDialog.close());
$("#cancel-dialog").addEventListener("click", () => itemDialog.close());
itemDialog.addEventListener("click", (event) => { if (event.target === itemDialog) itemDialog.close(); });
detailDialog.addEventListener("click", (event) => { if (event.target === detailDialog) detailDialog.close(); });
$("#search-input").addEventListener("input", (event) => { state.query = event.target.value; render(); });
categoryFilter.addEventListener("change", (event) => { state.activeCategory = event.target.value; render(); });
categoryList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.activeCategory = button.dataset.category;
  render();
});
$("#location-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-location]");
  if (!button) return;
  state.activeLocation = button.dataset.location;
  render();
});
const categoriesDialog = $("#categories-dialog");
$("#manage-categories").addEventListener("click", () => {
  showCategoryError();
  renderCategoryManager();
  categoriesDialog.showModal();
});
$("#close-categories").addEventListener("click", () => categoriesDialog.close());
categoriesDialog.addEventListener("click", (event) => { if (event.target === categoriesDialog) categoriesDialog.close(); });
$("#category-create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#new-category-name");
  const name = normalizeCategoryName(input.value);
  if (!name) { showCategoryError("请先输入分类名称。"); input.focus(); return; }
  if (state.categories.some((category) => category.toLocaleLowerCase() === name.toLocaleLowerCase())) { showCategoryError("这个分类名称已经存在。"); input.focus(); return; }
  const categories = [...state.categories.filter((category) => category !== "其他"), name, "其他"];
  try {
    await writeCategoryChange(categories);
    state.categories = categories;
    input.value = "";
    showCategoryError();
    renderCategoryManager();
    render();
    showToast("新分类已添加");
  } catch (error) { showCategoryError(`保存失败：${error.message || "请重试"}`); }
});
$("#category-manage-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const category = state.categories[Number(button.closest("[data-index]").dataset.index)];
  if (button.dataset.action === "delete") { deleteCategory(category); return; }
  const proposed = window.prompt("输入新的分类名称：", category);
  if (proposed !== null && proposed !== category) renameCategory(category, proposed);
});
const locationsDialog = $("#locations-dialog");
$("#manage-locations").addEventListener("click", () => {
  showLocationError();
  renderLocationManager();
  locationsDialog.showModal();
});
$("#close-locations").addEventListener("click", () => locationsDialog.close());
locationsDialog.addEventListener("click", (event) => { if (event.target === locationsDialog) locationsDialog.close(); });
$("#location-create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#new-location-name");
  const name = normalizeCategoryName(input.value);
  if (!name) { showLocationError("请先输入位置名称。"); input.focus(); return; }
  if (state.locations.some((location) => location.toLocaleLowerCase() === name.toLocaleLowerCase())) { showLocationError("这个位置名称已经存在。"); input.focus(); return; }
  try {
    const locations = [...state.locations, name].sort((a, b) => a.localeCompare(b, "zh-CN"));
    await saveLocationList(locations);
    input.value = "";
    showToast("存放位置已添加");
  } catch {}
});
$("#location-manage-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const location = state.locations[Number(button.closest("[data-index]").dataset.index)];
  if (button.dataset.action === "delete") { deleteLocation(location); return; }
  const proposed = window.prompt("输入新的位置名称或路径：", location);
  if (proposed !== null && proposed !== location) renameLocation(location, proposed);
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#search-input").focus(); }
  if (event.key === "Escape" && itemDialog.open) { itemDialog.close(); }
});

$("#emoji-options").addEventListener("click", (event) => {
  const button = event.target.closest("[data-icon]");
  if (!button) return;
  state.draftIcon = button.dataset.icon;
  renderIconOptions();
});

itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#name-input").value.trim();
  const quantity = Number($("#quantity-input").value);
  if (!name) { $("#form-error").textContent = "请填写物品名称。"; $("#name-input").focus(); return; }
  if (!$("#category-input").value) { $("#form-error").textContent = "请选择一个物品分类。"; $("#category-input").focus(); return; }
  if (!$("#quantity-input").value || !Number.isInteger(quantity) || quantity < 1) { $("#form-error").textContent = "数量需要是大于或等于 1 的整数。"; $("#quantity-input").focus(); return; }
  const now = new Date().toISOString();
  const existing = state.items.find((item) => item.id === state.editingId);
  const record = { id: existing?.id ?? crypto.randomUUID(), name, category: $("#category-input").value, quantity, location: $("#location-input").value.trim(), note: $("#note-input").value.trim(), icon: state.draftIcon, createdAt: existing?.createdAt ?? now, updatedAt: now };
  const saveButton = itemForm.querySelector('[type="submit"]');
  saveButton.disabled = true;
  try {
    await saveItem(record);
    state.items = existing ? state.items.map((item) => item.id === existing.id ? record : item) : [record, ...state.items];
    itemDialog.close();
    render();
    showToast(existing ? "物品信息已更新" : "物品已添加");
  } catch (error) {
    $("#form-error").textContent = `保存失败：${error.message || "浏览器存储空间可能不足"}`;
  } finally {
    saveButton.disabled = false;
  }
});

initCategoryOptions();
openDatabase().then(async (openedDatabase) => {
  database = openedDatabase;
  state.items = await readItems();
  const savedCategories = await readCategories();
  state.categories = Array.isArray(savedCategories) && savedCategories.length ? [...new Set([...savedCategories, "其他"])] : [...DEFAULT_CATEGORIES];
  const missingCategories = [...new Set(state.items.map((item) => item.category).filter((category) => category && !state.categories.includes(category)))];
  if (missingCategories.length) {
    state.categories = [...new Set([...state.categories.filter((category) => category !== "其他"), ...missingCategories, "其他"] )];
    await writeCategoryChange(state.categories);
  }
  const savedLocations = await readLocations();
  state.locations = [...new Set([...(Array.isArray(savedLocations) ? savedLocations : []), ...state.items.map((item) => item.location?.trim()).filter(Boolean)])];
  const locationTransaction = database.transaction("settings", "readwrite");
  locationTransaction.objectStore("settings").put({ key: "locations", value: state.locations });
  await new Promise((resolve, reject) => {
    locationTransaction.oncomplete = resolve;
    locationTransaction.onerror = () => reject(locationTransaction.error || new Error("保存位置设置失败"));
    locationTransaction.onabort = () => reject(locationTransaction.error || new Error("保存位置设置失败"));
  });
  render();
}).catch((error) => {
  itemGrid.innerHTML = `<div class="empty-state"><div class="empty-illustration">!</div><h2>无法读取本地物品</h2><p>${escapeHtml(error.message || "请检查浏览器存储设置后刷新页面。")}</p></div>`;
});
