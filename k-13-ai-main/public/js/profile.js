// profile.js
window.onload = async function() {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('로그인이 필요합니다.');
    window.location.href = '/login.html';
    return;
  }
  // 이메일 표시
  const payload = JSON.parse(atob(token.split('.')[1]));
  document.getElementById('user-email').textContent = `이메일: ${payload.email}`;
};

document.getElementById('api-key-form').onsubmit = async (e) => {
  e.preventDefault();
  const apiKey = document.getElementById('apiKey').value;
  const token = localStorage.getItem('token');
  const res = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, apiKey })
  });
  const data = await res.json();
  if (data.success) {
    alert('API 키가 저장되었습니다.');
  } else {
    alert(data.error || 'API 키 저장 실패');
  }
};

document.getElementById('password-form').onsubmit = async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const token = localStorage.getItem('token');
  const res = await fetch('/api/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, currentPassword, newPassword })
  });
  const data = await res.json();
  if (data.success) {
    alert('비밀번호가 변경되었습니다. 다시 로그인 해주세요.');
    localStorage.removeItem('token');
    window.location.href = '/login.html';
  } else {
    alert(data.error || '비밀번호 변경 실패');
  }
};

document.getElementById('logout-btn').onclick = () => {
  localStorage.removeItem('token');
  window.location.href = '/login.html';
}; 