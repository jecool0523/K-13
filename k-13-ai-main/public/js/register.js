const errorDiv = document.createElement('div');
errorDiv.id = 'register-error';
errorDiv.style.color = '#e11d48';
errorDiv.style.margin = '10px 0';
document.querySelector('.login-card, #register-container, body').prepend(errorDiv);

document.getElementById('register-form').onsubmit = async (e) => {
  e.preventDefault();
  errorDiv.textContent = '';
  const id = document.getElementById('id').value.trim();
  const password = document.getElementById('password').value;
  const nickname = document.getElementById('nickname').value.trim();
  const apiKey = document.getElementById('apiKey').value;
  if (!id || !password || !nickname) {
    errorDiv.textContent = '아이디, 비밀번호, 닉네임을 모두 입력하세요.';
    return;
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(id)) {
    errorDiv.textContent = '아이디는 3~20자의 영문, 숫자, 언더바만 가능합니다.';
    return;
  }
  if (password.length < 6) {
    errorDiv.textContent = '비밀번호는 6자 이상이어야 합니다.';
    return;
  }
  if (nickname.length < 2) {
    errorDiv.textContent = '닉네임은 2자 이상이어야 합니다.';
    return;
  }
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password, nickname, apiKey })
    });
    const data = await res.json();
    if (data.success) {
      alert('회원가입 성공! 로그인 해주세요.');
      window.location.href = '/login.html';
    } else {
      errorDiv.textContent = data.error || '회원가입 실패';
    }
  } catch (err) {
    errorDiv.textContent = '서버와 통신에 실패했습니다.';
  }
};
