const errorDiv = document.createElement('div');
errorDiv.id = 'login-error';
errorDiv.style.color = '#e11d48';
errorDiv.style.margin = '10px 0';
document.querySelector('.login-card')?.insertBefore(errorDiv, document.getElementById('login-form'));

document.getElementById('login-form').onsubmit = async (e) => {
  e.preventDefault();
  errorDiv.textContent = '';
  const id = document.getElementById('id').value.trim();
  const password = document.getElementById('password').value;
  if (!id || !password) {
    errorDiv.textContent = '아이디와 비밀번호를 모두 입력하세요.';
    return;
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(id)) {
    errorDiv.textContent = '아이디는 3~20자의 영문, 숫자, 언더바만 가능합니다.';
    return;
  }
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      window.location.href = '/chat.html';
    } else {
      errorDiv.textContent = data.error || '로그인 실패';
    }
  } catch (err) {
    errorDiv.textContent = '서버와 통신에 실패했습니다.';
  }
};
