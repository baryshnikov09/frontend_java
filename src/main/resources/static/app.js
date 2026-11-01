'use strict';
const $ = id => document.getElementById(id);
const roleNames = { ADMIN: 'Администратор', TEACHER: 'Преподаватель', SUPER_ADMIN: 'Суперадминистратор' };
let session = null, section = 'students', rows = [], editing = null, deleting = null, loadVersion = 0, toastTimer;
try { session = JSON.parse(sessionStorage.getItem('student-session')); } catch { sessionStorage.removeItem('student-session'); }
const hasRole = role => session?.roles?.includes(role);
const endpoint = () => section === 'students' ? '/api/v1/student' : '/api/v1/users';
function notice(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4000); }
function logout(message = '') {
  session = null; rows = []; loadVersion++; sessionStorage.removeItem('student-session');
  $('editor').close(); $('delete-dialog').close(); $('workspace').hidden = true; $('login-screen').hidden = false;
  $('login-form').reset(); $('login-password').type = 'password'; $('toggle-password').setAttribute('aria-pressed', 'false'); $('toggle-password').setAttribute('aria-label', 'Показать пароль'); $('table-body').replaceChildren(); $('login-error').textContent = message;
}
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session.token}` } : {}) } }); }
  catch { throw new Error('Нет связи с сервером. Проверьте, что Spring Boot запущен.'); }
  const text = await response.text(); let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    if (response.status === 401 && session) logout('Сессия завершена. Войдите ещё раз.');
    const messages = { 400: 'Проверьте заполненные поля.', 401: 'Неверный email или пароль.', 403: 'Недостаточно прав для этого действия.', 404: 'Запись уже удалена или не найдена.', 409: 'Пользователь с таким email уже существует.' };
    throw new Error(messages[response.status] || (response.status >= 500 ? 'Ошибка сервера. Попробуйте позже.' : data?.message || 'Не удалось выполнить запрос.'));
  }
  return data;
}
async function busy(form, action, errorId) {
  const buttons = [...form.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true); $(errorId).textContent = '';
  try { await action(); } catch (error) { $(errorId).textContent = error.message; }
  finally { buttons.forEach(b => b.disabled = false); }
}
$('login-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  busy(form, async () => {
    const data = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: form.email.value.trim(), password: form.password.value }) });
    session = { token: data.token, roles: data.roles.map(r => r.replace(/^ROLE_/, '')), email: form.email.value.trim(), expires: Date.now() + data.expiresIn * 1000 };
    sessionStorage.setItem('student-session', JSON.stringify(session)); form.reset(); enter();
  }, 'login-error');
});
function enter() {
  $('login-screen').hidden = true; $('workspace').hidden = false;
  $('account-email').textContent = session.email; $('account-role').textContent = session.roles.map(r => roleNames[r] || r).join(', ');
  $('students-nav').hidden = !(hasRole('ADMIN') || hasRole('TEACHER')); $('users-nav').hidden = !hasRole('SUPER_ADMIN');
  if ($('students-nav').hidden && $('users-nav').hidden) { logout('Для аккаунта не назначены доступные роли.'); return; }
  switchSection($('students-nav').hidden ? 'users' : 'students');
}
function switchSection(next) {
  section = next; const students = section === 'students';
  $('students-nav').classList.toggle('active', students); $('users-nav').classList.toggle('active', !students);
  $('page-title').textContent = students ? 'Студенты' : 'Пользователи'; $('breadcrumb').textContent = $('page-title').textContent.toUpperCase();
  $('page-description').textContent = students ? 'Список студентов и их контактная информация.' : 'Учётные записи и права доступа к кабинету.';
  $('count-label').textContent = students ? 'Всего студентов' : 'Всего пользователей';
  $('access-note').textContent = students ? (hasRole('ADMIN') ? 'Добавляйте студентов и поддерживайте контакты в актуальном состоянии.' : 'Вам доступны список студентов и просмотр контактной информации.') : 'Создавайте аккаунты и назначайте роли вашей команде.';
  $('add').hidden = students && !hasRole('ADMIN'); $('add').textContent = students ? '+ Добавить студента' : '+ Добавить пользователя';
  $('search').placeholder = students ? 'Поиск по имени, фамилии или ID…' : 'Поиск по email, роли или ID…'; $('search').value = '';
  $('table-head').innerHTML = students ? '<tr><th>ID</th><th>Студент</th><th>Действия</th></tr>' : '<tr><th>ID</th><th>Email</th><th>Роли</th><th>Действия</th></tr>';
  load();
}
async function load() {
  const version = ++loadVersion; rows = []; render(); $('empty').textContent = 'Загружаем данные…'; $('page-error').textContent = ''; $('total').textContent = '—'; $('refresh').disabled = true;
  try { const data = await api(endpoint()); if (version !== loadVersion) return; rows = (section === 'students' ? data.response : data.responses) || []; $('total').textContent = data.totalCount; render(); }
  catch (error) { if (version === loadVersion) { $('page-error').textContent = error.message; $('empty').textContent = 'Данные не загружены. Нажмите «Обновить», чтобы повторить.'; } }
  finally { if (version === loadVersion) $('refresh').disabled = false; }
}
function cell(row, text) { const td = document.createElement('td'); if (text !== undefined) td.textContent = text; row.append(td); return td; }
function action(parent, label, callback) { const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet'; button.textContent = label; button.addEventListener('click', async () => { button.disabled = true; try { await callback(); } catch (error) { $('page-error').textContent = error.message; } finally { button.disabled = false; } }); parent.append(button); }
function render() {
  const query = $('search').value.trim().toLocaleLowerCase('ru');
  const filtered = rows.filter(row => [row.id, row.name, row.surname, row.email, ...(row.roles || []).map(r => roleNames[r] || r)].join(' ').toLocaleLowerCase('ru').includes(query));
  $('table-body').replaceChildren();
  filtered.forEach(item => {
    const tr = document.createElement('tr'); cell(tr, `#${item.id}`);
    if (section === 'students') {
      const td = cell(tr), person = document.createElement('div'), avatar = document.createElement('span'), name = document.createElement('span');
      person.className = 'person'; avatar.className = 'avatar'; avatar.textContent = `${item.name?.[0] || ''}${item.surname?.[0] || ''}`.toUpperCase(); name.textContent = `${item.name || ''} ${item.surname || ''}`; person.append(avatar, name); td.append(person);
    } else { cell(tr, item.email); const td = cell(tr); (item.roles || []).forEach(role => { const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = roleNames[role] || role; td.append(badge); }); }
    const actions = cell(tr); action(actions, section === 'students' && !hasRole('ADMIN') ? 'Открыть →' : 'Изменить', () => openEditor(item));
    if (section === 'users' || hasRole('ADMIN')) action(actions, 'Удалить', () => { deleting = { ...item, path: endpoint() }; $('delete-description').textContent = section === 'students' ? `${item.name} ${item.surname}` : item.email; $('delete-error').textContent = ''; $('delete-dialog').showModal(); });
    $('table-body').append(tr);
  });
  $('empty').hidden = filtered.length > 0; $('empty').textContent = query ? 'По вашему запросу ничего не найдено.' : 'Пока нет записей.'; $('shown').textContent = `Показано ${filtered.length} из ${rows.length}`;
}
function field(name, label, value = '', type = 'text', required = false, disabled = false) {
  const wrapper = document.createElement('label'), input = document.createElement('input'); wrapper.textContent = label;
  input.name = name; input.type = type; input.value = value || ''; input.required = required; input.disabled = disabled; input.maxLength = 255;
  if (type === 'password') input.autocomplete = 'new-password'; wrapper.append(input); $('fields').append(wrapper);
}
async function openEditor(item = null) {
  const currentSection = section; const data = item && section === 'students' ? await api(`${endpoint()}/${item.id}`) : item;
  if (!session || currentSection !== section) return;
  editing = { data, section, path: endpoint() }; $('fields').replaceChildren(); $('form-error').textContent = '';
  const readonly = section === 'students' && !hasRole('ADMIN'); $('save').hidden = readonly;
  $('editor-title').textContent = section === 'students' ? (data ? 'Карточка студента' : 'Новый студент') : (data ? 'Изменить пользователя' : 'Новый пользователь');
  if (section === 'students') {
    field('name', 'Имя', data?.name, 'text', true, !!data); field('surname', 'Фамилия', data?.surname, 'text', true, !!data);
    if (data && !readonly) { const note = document.createElement('p'); note.className = 'hint'; note.textContent = 'Можно изменить электронную почту и телефон.'; $('fields').append(note); }
    field('email', 'Email', data?.email, 'email', false, readonly); field('phoneNumber', 'Телефон', data?.phoneNumber, 'tel', false, readonly);
  } else {
    field('email', 'Email', data?.email, 'email', true); field('password', data ? 'Новый пароль (оставьте пустым, чтобы сохранить)' : 'Пароль', '', 'password', !data);
    const options = document.createElement('fieldset'); options.className = 'role-options'; const legend = document.createElement('legend'); legend.textContent = 'Роли'; options.append(legend);
    Object.entries(roleNames).forEach(([role, label]) => { const el = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.name = 'roles'; input.value = role; input.checked = !!data?.roles?.includes(role); el.append(input, document.createTextNode(label)); options.append(el); }); $('fields').append(options);
  }
  $('editor').showModal();
}
$('edit-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  busy(form, async () => {
    const values = new FormData(form), existing = editing.data; let payload;
    if (editing.section === 'students') {
      payload = { email: values.get('email').trim(), [existing ? 'phoneNumber' : 'phone_number']: values.get('phoneNumber').trim() };
      if (!existing) { payload.name = values.get('name').trim(); payload.surname = values.get('surname').trim(); if (!payload.name || !payload.surname) throw new Error('Введите имя и фамилию.'); }
    } else { payload = { email: values.get('email').trim(), password: values.get('password'), roles: values.getAll('roles') }; if (!payload.roles.length) throw new Error('Выберите хотя бы одну роль.'); }
    await api(`${editing.path}/${existing ? existing.id : 'save'}`, { method: existing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    $('editor').close(); notice('Изменения сохранены');
    if (editing.section === 'users' && existing?.email === session?.email) { logout('Ваш аккаунт изменён. Войдите снова.'); return; }
    await load();
  }, 'form-error');
});
$('delete-form').addEventListener('submit', event => {
  event.preventDefault(); busy(event.currentTarget, async () => { await api(`${deleting.path}/${deleting.id}`, { method: 'DELETE' }); $('delete-dialog').close(); notice('Запись удалена'); if (deleting.path.endsWith('/users') && deleting.email === session?.email) { logout('Аккаунт удалён.'); return; } await load(); }, 'delete-error');
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $('editor').close()));
$('cancel-delete').addEventListener('click', () => $('delete-dialog').close());
$('logout').addEventListener('click', () => logout()); $('search').addEventListener('input', render); $('refresh').addEventListener('click', load);
$('students-nav').addEventListener('click', () => switchSection('students')); $('users-nav').addEventListener('click', () => switchSection('users'));
$('add').addEventListener('click', () => openEditor());
if (session?.token && Array.isArray(session.roles) && session.expires > Date.now()) enter(); else logout();

// Password visibility is a local UI control; authentication API remains unchanged.
$('toggle-password').addEventListener('click', () => {
  const input = $('login-password');
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  $('toggle-password').setAttribute('aria-pressed', String(visible));
  $('toggle-password').setAttribute('aria-label', visible ? 'Скрыть пароль' : 'Показать пароль');
});

