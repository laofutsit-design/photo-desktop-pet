const summary = document.querySelector('#managerSummary');
const list = document.querySelector('#managerList');
const status = document.querySelector('#managerStatus');
const addButton = document.querySelector('#addPhotos');
const closeButton = document.querySelector('#closeManager');
const groupSelect = document.querySelector('#groupSelect');
const groupName = document.querySelector('#groupName');
const renameGroupButton = document.querySelector('#renameGroup');
const createGroupButton = document.querySelector('#createGroup');
const deleteGroupButton = document.querySelector('#deleteGroup');
const formBubbleEditor = document.querySelector('#formBubbleEditor');
const formPhrases = document.querySelector('#formPhrases');
const formBubbleStatus = document.querySelector('#formBubbleStatus');
const saveFormPhrasesButton = document.querySelector('#saveFormPhrases');
const cancelFormPhrasesButton = document.querySelector('#cancelFormPhrases');
const managerDragHandle = document.querySelector('#managerDragHandle');
const formBubbleDragHandle = document.querySelector('#formBubbleDragHandle');

const PAGE_SIZE = 4;
const WHEEL_DELAY = 160;
let forms = [];
let formMetadata = [];
let groups = [];
let activeIndex = 0;
let activeGroupId = 'default';
let selectedGroupId = 'default';
let editingFormIndex = -1;
let page = 0;
let busy = false;
let lastWheelAt = 0;
let managerDrag;
let nextManagerDragId = 0;

function applyState(state, keepSelection = true) {
  if (Array.isArray(state?.forms)) forms = state.forms;
  if (Array.isArray(state?.formMetadata)) formMetadata = state.formMetadata;
  else if (formMetadata.length !== forms.length) {
    formMetadata = forms.map(() => ({ groupId: 'default', phrases: [] }));
  }
  if (Array.isArray(state?.groups) && state.groups.length > 0) groups = state.groups;
  else if (groups.length === 0) groups = [{ id: 'default', name: '角色 1' }];
  if (Number.isInteger(state?.activeIndex)) activeIndex = state.activeIndex;
  activeGroupId = state?.activeGroupId || formMetadata[activeIndex]?.groupId || groups[0].id;
  if (!keepSelection || !groups.some((group) => group.id === selectedGroupId)) {
    selectedGroupId = activeGroupId;
  }
}

function currentIndices() {
  return formMetadata
    .map((form, index) => (form.groupId === selectedGroupId ? index : -1))
    .filter((index) => index >= 0 && forms[index]);
}

function renderGroups() {
  groupSelect.replaceChildren(...groups.map((group) => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.id === activeGroupId ? `${group.name}（当前）` : group.name;
    return option;
  }));
  groupSelect.value = selectedGroupId;
  const selected = groups.find((group) => group.id === selectedGroupId);
  groupName.value = selected?.name || '';
  for (const element of [groupSelect, groupName, renameGroupButton, createGroupButton, deleteGroupButton]) {
    element.disabled = busy;
  }
  deleteGroupButton.disabled = busy || groups.length <= 1;
}

function render() {
  const indices = currentIndices();
  const pageCount = Math.max(1, Math.ceil(indices.length / PAGE_SIZE));
  page = Math.max(0, Math.min(pageCount - 1, page));
  const group = groups.find((item) => item.id === selectedGroupId);
  summary.textContent = `${group?.name || '角色'} · ${indices.length} 张 · 第 ${page + 1}/${pageCount} 页 · 滚轮翻页`;
  addButton.disabled = busy;
  closeButton.disabled = busy;
  renderGroups();
  list.replaceChildren();

  if (indices.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'manager-empty';
    empty.textContent = '这个角色还没有照片，点击下方“添加照片”。';
    list.append(empty);
    return;
  }

  indices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach((index, localIndex) => {
    const item = document.createElement('div');
    item.className = 'manager-item';
    item.setAttribute('role', 'listitem');
    if (index === activeIndex) item.classList.add('active');

    const selectButton = document.createElement('button');
    selectButton.className = 'manager-select';
    selectButton.type = 'button';
    selectButton.disabled = busy;
    selectButton.title = `切换到第 ${localIndex + 1} 张照片`;
    selectButton.addEventListener('click', () => selectForm(index));
    const thumbnail = document.createElement('img');
    thumbnail.src = forms[index];
    thumbnail.alt = `桌宠照片 ${localIndex + 1}`;
    thumbnail.draggable = false;
    const label = document.createElement('span');
    label.textContent = index === activeIndex ? `第 ${localIndex + 1} 张（当前）` : `第 ${localIndex + 1} 张`;
    selectButton.append(thumbnail, label);

    const tools = document.createElement('div');
    tools.className = 'item-tools';
    const bubbleButton = document.createElement('button');
    bubbleButton.type = 'button';
    bubbleButton.textContent = formMetadata[index]?.phrases?.length
      ? `气泡 ${formMetadata[index].phrases.length}` : '气泡';
    bubbleButton.title = '编辑这张照片的专属气泡';
    bubbleButton.addEventListener('click', () => openFormBubbleEditor(index));
    const moveSelect = document.createElement('select');
    moveSelect.title = '移动到其他角色';
    moveSelect.append(...groups.map((group) => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      return option;
    }));
    moveSelect.value = formMetadata[index]?.groupId || selectedGroupId;
    moveSelect.addEventListener('change', () => moveForm(index, moveSelect.value));
    tools.append(bubbleButton, moveSelect);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'manager-delete';
    deleteButton.type = 'button';
    deleteButton.disabled = busy;
    deleteButton.textContent = '×';
    deleteButton.title = '删除这张照片';
    deleteButton.addEventListener('click', () => deleteForm(index));
    item.append(selectButton, tools, deleteButton);
    list.append(item);
  });
}

async function refresh() {
  busy = false;
  applyState(await window.desktopPet.getManagerState());
  const indices = currentIndices();
  page = Math.max(0, Math.floor(Math.max(0, indices.indexOf(activeIndex)) / PAGE_SIZE));
  status.textContent = '';
  render();
}

async function run(action, successText = '') {
  if (busy) return;
  busy = true;
  render();
  try {
    const result = await action();
    if (result && typeof result === 'object') applyState(result);
    status.textContent = successText;
  } catch (error) {
    status.textContent = error.message || '操作失败，请重试。';
  } finally {
    busy = false;
    render();
  }
}

function selectForm(index) {
  return run(async () => {
    const state = await window.desktopPet.activateManagedForm(index);
    activeIndex = state.activeIndex;
    activeGroupId = state.activeGroupId;
  }, '已切换桌宠形态。');
}

function deleteForm(index) {
  return run(() => window.desktopPet.deleteManagedForm(index), '照片已删除。');
}

function moveForm(index, groupId) {
  return run(() => window.desktopPet.moveManagedForm(index, groupId), '照片已移动到目标角色。');
}

function openFormBubbleEditor(index) {
  editingFormIndex = index;
  formPhrases.value = (formMetadata[index]?.phrases || []).join('\n');
  formBubbleStatus.textContent = '';
  formBubbleEditor.hidden = false;
  formPhrases.focus();
}

function closeFormBubbleEditor() {
  editingFormIndex = -1;
  formBubbleEditor.hidden = true;
}

function finishManagerDrag(event) {
  if (!managerDrag || (event && event.pointerId !== managerDrag.pointerId)) return;
  const drag = managerDrag;
  managerDrag = undefined;
  window.desktopPet.endManagerDrag(drag.id);
  if (drag.handle.hasPointerCapture?.(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
}

function startManagerDrag(event) {
  if (event.button !== 0 || managerDrag) return;
  event.preventDefault();
  nextManagerDragId = (nextManagerDragId % Number.MAX_SAFE_INTEGER) + 1;
  managerDrag = {
    id: nextManagerDragId,
    pointerId: event.pointerId,
    handle: event.currentTarget,
    startX: event.screenX,
    startY: event.screenY,
    started: false,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  window.desktopPet.beginManagerDrag({ id: nextManagerDragId });
}

function moveManagerDrag(event) {
  if (!managerDrag || event.pointerId !== managerDrag.pointerId) return;
  if ((event.buttons & 1) === 0) {
    finishManagerDrag(event);
    return;
  }
  if (!managerDrag.started
    && Math.hypot(event.screenX - managerDrag.startX, event.screenY - managerDrag.startY) > 4) {
    managerDrag.started = true;
    window.desktopPet.dragManagerTo({ id: managerDrag.id });
  }
}

function attachManagerDrag(handle) {
  handle.addEventListener('pointerdown', startManagerDrag);
  handle.addEventListener('pointermove', moveManagerDrag);
  handle.addEventListener('pointerup', finishManagerDrag);
  handle.addEventListener('pointercancel', finishManagerDrag);
  handle.addEventListener('lostpointercapture', finishManagerDrag);
}

attachManagerDrag(managerDragHandle);
attachManagerDrag(formBubbleDragHandle);

groupSelect.addEventListener('change', async () => {
  selectedGroupId = groupSelect.value;
  page = 0;
  const first = currentIndices()[0];
  if (first !== undefined) {
    await run(() => window.desktopPet.activateManagedGroup(selectedGroupId), '已切换角色。');
  } else {
    render();
  }
});
function renameSelectedGroup() {
  const nextName = groupName.value;
  return run(
    () => window.desktopPet.renameManagedGroup(selectedGroupId, nextName),
    '角色名称已保存。',
  );
}

renameGroupButton.addEventListener('click', renameSelectedGroup);
groupName.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  renameSelectedGroup();
});
createGroupButton.addEventListener('click', () => run(async () => {
  const state = await window.desktopPet.createManagedGroup();
  applyState(state);
  selectedGroupId = state.selectedGroupId;
}, '已创建新角色，请为它添加照片。'));
deleteGroupButton.addEventListener('click', () => run(
  () => window.desktopPet.deleteManagedGroup(selectedGroupId),
  '角色分组已删除。',
));

list.addEventListener('wheel', (event) => {
  if (busy) return;
  const pageCount = Math.ceil(currentIndices().length / PAGE_SIZE);
  if (pageCount <= 1) return;
  event.preventDefault();
  if (performance.now() - lastWheelAt < WHEEL_DELAY) return;
  const delta = event.deltaY || event.deltaX;
  if (!delta) return;
  const nextPage = Math.max(0, Math.min(pageCount - 1, page + Math.sign(delta)));
  if (nextPage === page) return;
  lastWheelAt = performance.now();
  page = nextPage;
  render();
}, { passive: false });

addButton.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  render();
  try {
    if (!await window.desktopPet.addManagedPhotos(selectedGroupId)) throw new Error('正在生成桌宠，请稍候。');
  } catch (error) {
    busy = false;
    status.textContent = error.message || '暂时无法添加照片。';
    render();
  }
});
saveFormPhrasesButton.addEventListener('click', async () => {
  if (editingFormIndex < 0) return;
  const phrases = [...new Set(formPhrases.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
  if (phrases.length > 50) {
    formBubbleStatus.textContent = '每张照片最多保存 50 条气泡。';
    return;
  }
  if (phrases.some((phrase) => phrase.length > 100)) {
    formBubbleStatus.textContent = '每条气泡不能超过 100 个字符。';
    return;
  }
  const index = editingFormIndex;
  saveFormPhrasesButton.disabled = true;
  try {
    applyState(await window.desktopPet.setManagedFormPhrases(index, phrases));
    closeFormBubbleEditor();
    status.textContent = '专属气泡已保存。';
    render();
  } catch (error) {
    formBubbleStatus.textContent = error.message || '保存失败，请重试。';
  } finally {
    saveFormPhrasesButton.disabled = false;
  }
});
cancelFormPhrasesButton.addEventListener('click', closeFormBubbleEditor);
closeButton.addEventListener('click', () => window.desktopPet.closePhotoManager());
document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || busy) return;
  if (!formBubbleEditor.hidden) closeFormBubbleEditor();
  else window.desktopPet.closePhotoManager();
});
window.desktopPet.onManagerRefresh(() => refresh().catch((error) => {
  status.textContent = error.message || '刷新照片失败。';
}));
window.desktopPet.onManagerActiveFormChanged((index) => {
  if (!Number.isInteger(index) || !forms[index]) return;
  activeIndex = index;
  activeGroupId = formMetadata[index]?.groupId || activeGroupId;
  selectedGroupId = activeGroupId;
  page = Math.max(0, Math.floor(currentIndices().indexOf(index) / PAGE_SIZE));
  render();
});
refresh().catch((error) => {
  status.textContent = error.message || '读取照片失败。';
  render();
});
