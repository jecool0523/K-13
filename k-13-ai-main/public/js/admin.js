// admin.js
window.onload = async function() {
  const res = await fetch('/api/notice');
  const data = await res.json();
  document.getElementById('notice').value = data.notice || '';
  document.getElementById('update').value = data.update || '';
};

document.getElementById('admin-form').onsubmit = async (e) => {
  e.preventDefault();
  const adminPassword = document.getElementById('adminPassword').value;
  const notice = document.getElementById('notice').value;
  const update = document.getElementById('update').value;
  const msgDiv = document.getElementById('admin-msg');
  msgDiv.textContent = '';
  try {
    const res = await fetch('/api/notice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPassword, notice, update })
    });
    const data = await res.json();
    if (data.success) {
      msgDiv.style.color = '#22c55e';
      msgDiv.textContent = '저장되었습니다!';
    } else {
      msgDiv.style.color = '#e11d48';
      msgDiv.textContent = data.error || '저장 실패';
    }
  } catch (err) {
    msgDiv.style.color = '#e11d48';
    msgDiv.textContent = '서버와 통신에 실패했습니다.';
  }
}; 