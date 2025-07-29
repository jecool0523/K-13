let currentConversationId = null;
let userInfo = null;
let lastUploadedImageData = null; // 🔧 추가: 마지막 업로드된 이미지 데이터 저장

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('페이지 로딩 시작 - 초기화 진행');
        
        // 인증 상태를 먼저 확인
        const isAuthenticated = await checkAuthentication();
        
        if (!isAuthenticated) {
            console.log('인증 실패 - 로그인 페이지로 리다이렉트');
            window.location.href = '/login';
            return;
        }
        
        console.log('인증 성공 - 초기화 시작');
        
        // 인증된 경우에만 초기화 진행
        await loadUserInfo();
        await loadNotice();
        await loadConversations();
        
        // 이벤트 리스너 설정
        setupEventListeners();
        
        console.log('초기화 완료');
    } catch (error) {
        console.error('초기화 중 오류:', error);
        window.location.href = '/login';
    }
});

// 인증 상태 확인 함수
async function checkAuthentication() {
    try {
        const response = await fetch('/api/user/info');
        return response.ok;
    } catch (error) {
        console.error('인증 확인 실패:', error);
        return false;
    }
}

// 🔧 수정된 setupEventListeners 함수
function setupEventListeners() {
    // 이미지 토글 툴팁 초기화
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    // 사이드바 토글
    document.getElementById('sidebarToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });
    
    // 메시지 전송 - Enter 키 이벤트
    document.getElementById('sendButton').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 이미지 업로드 관련 이벤트
    document.getElementById('imageUploadBtn').addEventListener('click', () => {
        if (!userInfo.has_api_key) {
            alert('이미지 업로드는 개인 Gemini API 키가 등록된 사용자만 이용할 수 있습니다.');
            return;
        }
        document.getElementById('imageInput').click();
    });
    
    document.getElementById('imageInput').addEventListener('change', handleImageUpload);
    
    // 새 대화 시작 버튼
    document.getElementById('newConversationBtn').addEventListener('click', startNewConversation);
    
    // 폼 이벤트들
    document.getElementById('changePasswordForm').addEventListener('submit', changePassword);
    document.getElementById('changeNicknameForm').addEventListener('submit', changeNickname);
    document.getElementById('apiKeyForm').addEventListener('submit', manageApiKey);
    document.getElementById('deleteApiKeyBtn').addEventListener('click', deleteApiKey);
    document.getElementById('logoutBtn').addEventListener('click', logout);
}

// 🔧 수정된 이미지 업로드 함수 (Workers 프록시 방식 + 자동 답변 제거)
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 개인 API 키 재확인
    if (!userInfo.has_api_key) {
        alert('이미지 업로드는 개인 Gemini API 키가 등록된 사용자만 이용할 수 있습니다.');
        return;
    }
    
    // 파일 검증 (5MB로 수정)
    if (!validateImageFile(file)) {
        alert('지원하지 않는 파일 형식이거나 크기가 5MB를 초과합니다.');
        return;
    }
    
    // 대화방이 없으면 자동 생성
    if (!currentConversationId) {
        await startNewConversation();
        if (!currentConversationId) {
            alert('대화방 생성에 실패했습니다.');
            return;
        }
    }
    
    const uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
    
    try {
        uploadModal.show();
        
        // FormData 생성 (Workers 프록시 방식)
        const formData = new FormData();
        formData.append('file', file);
        formData.append('conversationId', currentConversationId);
        
        // Workers를 통해 직접 업로드
        const uploadResponse = await fetch('/api/upload/direct', {
            method: 'POST',
            body: formData
        });
        
        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`업로드 실패: ${uploadResponse.status} - ${errorText}`);
        }
        
        const { fileId, imageUrl, fileName } = await uploadResponse.json();
        
        // Base64 변환 (Gemini API용) - 나중에 사용하기 위해 저장
        const base64Data = await fileToBase64(file);
        lastUploadedImageData = {
            base64Data: base64Data,
            mimeType: file.type,
            fileName: file.name
        };
        
        // UI에 이미지만 표시 (🔧 자동 답변 제거)
        addImageMessage('user', file.name, imageUrl);
        await loadConversations();
        
        // 🔧 업로드 완료 메시지 표시
        addMessage('system', '이미지가 업로드되었습니다. 메시지를 입력하면 카나데가 이미지를 참고해서 답변합니다.');
        
    } catch (error) {
        console.error('이미지 업로드 실패:', error);
        alert(`업로드 실패: ${error.message}`);
    } finally {
        uploadModal.hide();
        event.target.value = '';
    }
}

// Base64 변환 함수
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1]; // "data:image/jpeg;base64," 제거
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 🔧 수정된 sendMessage 함수 (이미지 토글 확인)
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    const selectedModel = document.getElementById('modelSelect').value;
    const imageToggle = document.getElementById('imageToggle').checked;
    
    // 대화방이 없으면 자동 생성
    if (!currentConversationId) {
        await startNewConversation();
        if (!currentConversationId) {
            alert('으....이....');
            return;
        }
    }
    
    // 사용자 메시지 표시
    addMessage('user', message);
    input.value = '';
    
    // 로딩 표시
    const loadingDiv = addMessage('assistant', '...');
    
    try {
        // 요청 본문 구성
        const requestBody = {
            message,
            model: selectedModel,
            conversationId: currentConversationId
        };
        
        // 🔧 이미지 토글이 켜져있고 마지막 업로드된 이미지가 있으면 포함
        if (imageToggle && lastUploadedImageData) {
            requestBody.imageData = lastUploadedImageData;
        }
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // 커스텀 이모지 파싱
            const { text, emoji } = parseCustomEmoji(data.response);
            
            // 메시지 텍스트 업데이트
            loadingDiv.textContent = text;
            
            // 이모지가 있으면 이미지로 표시
            if (emoji) {
                const emojiDiv = document.createElement('div');
                emojiDiv.className = 'custom-emoji';
                emojiDiv.innerHTML = `<img src="/images/emojis/${emoji}" alt="emoji" class="emoji-image">`;
                
                const messageContent = loadingDiv.parentElement;
                messageContent.appendChild(emojiDiv);
            }
            
            await loadConversations();
        } else if (response.status === 401) {
            window.location.href = '/login';
        } else {
            loadingDiv.textContent = '으....이....';
        }
    } catch (error) {
        loadingDiv.textContent = '으....이....';
    }
}

// 🔧 수정된 이미지 파일 검증 (5MB로 변경)
function validateImageFile(file) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 🔥 1MB → 5MB로 변경
    
    if (!allowedTypes.includes(file.type)) {
        return false;
    }
    
    if (file.size > maxSize || file.size <= 0) {
        return false;
    }
    
    return true;
}

// 이미지 메시지 추가
function addImageMessage(role, fileName, imageUrl) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    if (role === 'user') {
        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="image-message">
                    <img src="${imageUrl}" alt="${fileName}" class="uploaded-image">
                    <div class="image-info">${fileName}</div>
                </div>
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            <img src="/images/kanade-profile.webp" alt="카나데" class="message-avatar">
            <div class="message-content">
                <div class="image-message">
                    <img src="${imageUrl}" alt="${fileName}" class="uploaded-image">
                    <div class="image-info">${fileName}</div>
                </div>
            </div>
        `;
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// 🔧 수정된 새 대화 시작 함수 (이미지 데이터 초기화)
async function startNewConversation() {
    try {
        const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: `대화 ${new Date().toLocaleString()}` })
        });
        
        if (response.ok) {
            const data = await response.json();
            currentConversationId = data.id;
            
            // 🔧 이미지 데이터 초기화
            lastUploadedImageData = null;
            
            // 채팅 화면 초기화
            document.getElementById('chatMessages').innerHTML = `
                <div class="message assistant">
                    <img src="/images/kanade-profile.webp" alt="카나데" class="message-avatar">
                    <div class="message-content">
                        <div class="message-bubble">. . .</div>
                    </div>
                </div>
            `;
            
            await loadConversations();
        } else if (response.status === 401) {
            window.location.href = '/login';
        } else {
            alert('으....이....');
        }
    } catch (error) {
        alert('으....이....');
    }
}

async function loadUserInfo() {
    try {
        console.log('사용자 정보 로딩 시작');
        const response = await fetch('/api/user/info');
        console.log('사용자 정보 응답:', response.status);
        
        if (response.ok) {
            userInfo = await response.json();
            console.log('사용자 정보:', userInfo);
            document.getElementById('userInfo').innerHTML = `
                아이디: ${userInfo.username}<br>
                닉네임: ${userInfo.nickname}
            `;
            
            // API 키 관리 UI 업데이트
            updateApiKeyUI();
            
            // 모델 선택 UI 업데이트
            updateModelSelector();
            
            // 이미지 업로드 버튼 상태 업데이트
            updateImageUploadButton();
            
        } else if (response.status === 401) {
            console.log('인증 만료 - 로그인 페이지로 이동');
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('사용자 정보 로드 실패:', error);
        window.location.href = '/login';
    }
}

// 이미지 업로드 버튼 상태 업데이트
function updateImageUploadButton() {
    const uploadBtn = document.getElementById('imageUploadBtn');
    if (uploadBtn) {
        if (userInfo.has_api_key) {
            uploadBtn.style.opacity = '1';
            uploadBtn.style.cursor = 'pointer';
            uploadBtn.title = '이미지 업로드';
        } else {
            uploadBtn.style.opacity = '0.5';
            uploadBtn.style.cursor = 'not-allowed';
            uploadBtn.title = '개인 API 키가 필요합니다';
        }
    }
}

async function loadNotice() {
    try {
        const response = await fetch('/api/admin/notice');
        if (response.ok) {
            const data = await response.json();
            // 줄바꿈을 <br> 태그로 변환
            const formattedNotice = data.notice.replace(/\n/g, '<br>');
            document.getElementById('noticeContent').innerHTML = formattedNotice;
        }
    } catch (error) {
        console.error('공지사항 로드 실패:', error);
    }
}

async function loadConversations() {
    try {
        const response = await fetch('/api/conversations');
        if (response.ok) {
            const conversations = await response.json();
            const listElement = document.getElementById('conversationList');
            listElement.innerHTML = '';
            
            conversations.forEach(conv => {
                const item = document.createElement('div');
                item.className = 'conversation-item';
                if (conv.id === currentConversationId) {
                    item.classList.add('active');
                }
                item.innerHTML = `
                    <span onclick="loadConversation(${conv.id})" style="cursor: pointer; flex: 1;">
                        ${conv.title}
                    </span>
                    <i class="bi bi-trash delete-conversation" onclick="deleteConversation(${conv.id})"></i>
                `;
                listElement.appendChild(item);
            });
        } else if (response.status === 401) {
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('대화내역 로드 실패:', error);
    }
}

async function loadConversation(id) {
    currentConversationId = id;
    
    try {
        const response = await fetch(`/api/conversations/${id}`);
        if (response.ok) {
            const messages = await response.json();
            const messagesDiv = document.getElementById('chatMessages');
            messagesDiv.innerHTML = '';
            
            // 기본 인사말 추가
            if (messages.length === 0) {
                messagesDiv.innerHTML = `
                    <div class="message assistant">
                        <img src="/images/kanade-profile.webp" alt="카나데" class="message-avatar">
                        <div class="message-content">
                            <div class="message-bubble">. . .</div>
                        </div>
                    </div>
                `;
            } else {
                messages.forEach(msg => {
                    if (msg.message_type === 'image' && msg.filename) {
                        // 이미지 메시지 표시
                        addImageMessage(msg.role, msg.content, `/api/images/${msg.filename}`);
                    } else {
                        // 텍스트 메시지 표시 (이모지 파싱 포함)
                        addMessage(msg.role, msg.content);
                    }
                });
            }
            
            // 대화내역 목록에서 활성 상태 업데이트
            await loadConversations();
        } else if (response.status === 401) {
            window.location.href = '/login';
        }
    } catch (error) {
        alert('으....이....');
    }
}

// 커스텀 이모지 파싱 함수 (한글 파일명 지원)
function parseCustomEmoji(content) {
    // 한글을 포함한 모든 문자를 매칭하는 정규표현식
    const emojiRegex = /::([\가-힣\w\s\-_.ㄱ-ㅎㅏ-ㅣ]+\.(jpg|jpeg|png|gif))::/g;
    const match = content.match(emojiRegex);
    
    if (match) {
        const emojiFileName = match[0].replace(/::/g, '');
        const text = content.replace(emojiRegex, '').trim();
        return {
            text: text,
            emoji: emojiFileName
        };
    }
    
    return { text: content, emoji: null };
}

// 🔧 수정된 addMessage 함수 (시스템 메시지 지원)
function addMessage(role, content) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    // 커스텀 이모지 처리
    const { text, emoji } = parseCustomEmoji(content);
    
    if (role === 'assistant') {
        messageDiv.innerHTML = `
            <img src="/images/kanade-profile.webp" alt="카나데" class="message-avatar">
            <div class="message-content">
                <div class="message-bubble">${text}</div>
                ${emoji ? `<div class="custom-emoji"><img src="/images/emojis/${emoji}" alt="emoji" class="emoji-image"></div>` : ''}
            </div>
        `;
    } else if (role === 'system') {
        // 🔧 시스템 메시지 스타일
        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-bubble system-message">${text}</div>
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-bubble">${text}</div>
            </div>
        `;
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    return messageDiv.querySelector('.message-bubble');
}

function updateApiKeyUI() {
    const input = document.getElementById('apiKeyInput');
    const submitBtn = document.getElementById('apiKeySubmitBtn');
    const deleteBtn = document.getElementById('deleteApiKeyBtn');
    
    if (userInfo.has_api_key) {
        input.value = '●●●●●●●●●●●●●●●●';
        submitBtn.textContent = '변경하기';
        deleteBtn.style.display = 'inline-block';
    } else {
        input.value = '';
        submitBtn.textContent = '등록하기';
        deleteBtn.style.display = 'none';
    }
}

function updateModelSelector() {
    // Pro 모델은 개인 API 키가 있을 때만 활성화
    const modelSelect = document.getElementById('modelSelect');
    const proOption = modelSelect.querySelector('option[value="gemini-2.5-pro"]');
    
    if (proOption) {
        proOption.disabled = !userInfo.has_api_key;
        
        // Pro 모델이 선택되어 있는데 API 키가 없으면 기본 모델로 변경
        if (!userInfo.has_api_key && modelSelect.value === 'gemini-2.5-pro') {
            modelSelect.value = 'gemini-2.5-flash';
        }
    }
}

// 나머지 함수들은 기존과 동일
async function changePassword(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const newPassword = formData.get('new_password');
    const confirmPassword = formData.get('confirm_password');
    
    if (newPassword !== confirmPassword) {
        alert('으....이....');
        return;
    }
    
    try {
        const response = await fetch('/api/user/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'password',
                current_password: formData.get('current_password'),
                new_password: newPassword
            })
        });
        
        if (response.ok) {
            alert('비밀번호가 변경되었습니다.');
            e.target.reset();
        } else if (response.status === 401) {
            window.location.href = '/login';
        } else {
            alert('으....이....');
        }
    } catch (error) {
        alert('으....이....');
    }
}

async function changeNickname(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    
    try {
        const response = await fetch('/api/user/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'nickname',
                new_nickname: formData.get('new_nickname')
            })
        });
        
        if (response.ok) {
            alert('닉네임이 변경되었습니다.');
            e.target.reset();
            await loadUserInfo();
        } else if (response.status === 401) {
            window.location.href = '/login';
        } else {
            alert('으....이....');
        }
    } catch (error) {
        alert('으....이....');
    }
}

async function manageApiKey(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const apiKey = formData.get('api_key');
    
    if (apiKey === '●●●●●●●●●●●●●●●●') {
        alert('으....이....');
        return;
    }
    
    try {
        const response = await fetch('/api/user/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'api_key',
                api_key: apiKey
            })
        });
        
        if (response.ok) {
            alert('API 키가 등록/변경되었습니다.');
            await loadUserInfo();
        } else if (response.status === 401) {
            window.location.href = '/login';
        } else {
            alert('으....이....');
        }
    } catch (error) {
        alert('으....이....');
    }
}

async function deleteApiKey() {
    if (!confirm('API 키를 삭제하시겠습니까?')) return;
    
    try {
        const response = await fetch('/api/user/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'delete_api_key'
            })
        });
        
        if (response.ok) {
            alert('API 키가 삭제되었습니다.');
            await loadUserInfo();
        } else if (response.status === 401) {
            window.location.href = '/login';
        } else {
            alert('으....이....');
        }
    } catch (error) {
        alert('으....이....');
    }
}

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/'; // 루트 페이지로 이동
    } catch (error) {
        alert('으....이....');
    }
}

async function deleteConversation(id) {
    if (!confirm('대화내역을 삭제하시겠습니까?')) return;
    
    try {
        const response = await fetch(`/api/conversations/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadConversations();
            if (currentConversationId === id) {
                currentConversationId = null;
                document.getElementById('chatMessages').innerHTML = `
                    <div class="message assistant">
                        <img src="/images/kanade-profile.webp" alt="카나데" class="message-avatar">
                        <div class="message-content">
                            <div class="message-bubble">안녕… 카나데야. 무슨 일이든 말해줘.</div>
                        </div>
                    </div>
                `;
            }
        } else if (response.status === 401) {
            window.location.href = '/login';
        }
    } catch (error) {
        alert('으....이....');
    }
}

const token = localStorage.getItem('token');
let sessionId = localStorage.getItem('sessionId');

// 세션ID 없으면 새로 생성
async function ensureSession() {
  if (!sessionId) {
    const res = await fetch('/api/new-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    sessionId = data.sessionId;
    localStorage.setItem('sessionId', sessionId);
  }
}

// 소켓 연결 (세션ID 포함)
const socket = io({
  auth: { token, sessionId }
});

const chatWindow = document.getElementById('chat-window');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');

// 에러 메시지 UI
const chatErrorDiv = document.createElement('div');
chatErrorDiv.id = 'chat-error';
chatErrorDiv.style.color = '#e11d48';
chatErrorDiv.style.margin = '8px 0';
chatForm.parentNode.insertBefore(chatErrorDiv, chatForm);

// 로딩 인디케이터
const loadingDiv = document.createElement('div');
loadingDiv.id = 'chat-loading';
loadingDiv.textContent = 'AI가 답변 중입니다...';
loadingDiv.style.color = '#6366f1';
loadingDiv.style.margin = '8px 0';
loadingDiv.style.display = 'none';
chatForm.parentNode.insertBefore(loadingDiv, chatForm);

function appendMessage(text, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  const bubble = document.createElement('div');
  bubble.className = `bubble ${sender}`;
  bubble.textContent = text;
  msgDiv.appendChild(bubble);
  chatWindow.appendChild(msgDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

let isWaiting = false;

// 대화내역 불러오기
async function loadChatSessions() {
  const res = await fetch(`/api/chat-sessions?token=${encodeURIComponent(token)}`);
  const data = await res.json();
  const list = document.getElementById('chat-history-list');
  list.innerHTML = '';
  data.sessions.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'chat-history-item';
    div.textContent = `${new Date(s.startedAt).toLocaleString()}${s.preview ? ' - ' + s.preview : ''}`;
    div.onclick = () => loadSession(s.sessionId);
    list.appendChild(div);
  });
}

// 특정 세션 불러오기
async function loadSession(sid) {
  sessionId = sid;
  localStorage.setItem('sessionId', sessionId);
  chatWindow.innerHTML = '';
  const res = await fetch(`/api/chatlog?token=${encodeURIComponent(token)}&session=${encodeURIComponent(sessionId)}`);
  const data = await res.json();
  data.logs.forEach(log => appendMessage(log.message, log.role));
}

// 새 대화 시작
const newChatBtn = document.createElement('button');
newChatBtn.textContent = '새 대화';
newChatBtn.className = 'new-chat-btn';
document.querySelector('.chat-history-section').prepend(newChatBtn);
newChatBtn.onclick = async () => {
  const res = await fetch('/api/new-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  const data = await res.json();
  sessionId = data.sessionId;
  localStorage.setItem('sessionId', sessionId);
  chatWindow.innerHTML = '';
  await loadChatSessions();
};

// 최초 실행
(async () => {
  await ensureSession();
  await loadChatSessions();
  await loadSession(sessionId);
})();

let selectedModel = document.getElementById('model-select')?.value || 'Gemini 2.5 Pro';
const modelSelect = document.getElementById('model-select');
if (modelSelect) {
  modelSelect.addEventListener('change', function() {
    selectedModel = this.value;
  });
}

chatForm.addEventListener('submit', e => {
  e.preventDefault();
  chatErrorDiv.textContent = '';
  if (isWaiting) return;
  const text = userInput.value.trim();
  if (!text) return;
  appendMessage(text, 'user');
  userInput.value = '';
  userInput.disabled = true;
  chatForm.querySelector('button').disabled = true;
  loadingDiv.style.display = 'block';
  isWaiting = true;
  socket.emit('chat', { text, model: selectedModel });
});

userInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

socket.on('chat', (data) => {
  appendMessage(data, 'ai');
  userInput.disabled = false;
  chatForm.querySelector('button').disabled = false;
  loadingDiv.style.display = 'none';
  isWaiting = false;
});

socket.on('connect_error', (err) => {
  chatErrorDiv.textContent = '서버와 연결할 수 없습니다.';
  userInput.disabled = true;
  chatForm.querySelector('button').disabled = true;
  loadingDiv.style.display = 'none';
});

socket.on('error', (err) => {
  chatErrorDiv.textContent = '알 수 없는 오류가 발생했습니다.';
  userInput.disabled = false;
  chatForm.querySelector('button').disabled = false;
  loadingDiv.style.display = 'none';
  isWaiting = false;
});

// 세션 만료/인증 실패 시
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    chatErrorDiv.textContent = '세션이 만료되었습니다. 다시 로그인 해주세요.';
    setTimeout(() => window.location.href = '/login.html', 1500);
  }
});

// 모바일 환경 감지 및 모바일 UI 적용
function isMobile() {
  return /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 600;
}
if (isMobile()) {
  document.body.classList.add('mobile');
}

// 모바일 패널 토글
const sidePanel = document.getElementById('side-panel');
const sideToggleBtn = document.getElementById('side-toggle-btn');
const sideCloseBtn = document.getElementById('side-close-btn');
if (sideToggleBtn && sidePanel) {
  sideToggleBtn.onclick = () => sidePanel.classList.add('open');
}
if (sideCloseBtn && sidePanel) {
  sideCloseBtn.onclick = () => sidePanel.classList.remove('open');
}
// 패널 바깥 클릭 시 닫기
window.addEventListener('click', (e) => {
  if (window.innerWidth <= 900 && sidePanel.classList.contains('open')) {
    if (!sidePanel.contains(e.target) && e.target !== sideToggleBtn) {
      sidePanel.classList.remove('open');
    }
  }
});

// 모바일 키보드 대응 (입력창이 가려지지 않게)
function isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 600;
}
if (isMobile()) {
  window.addEventListener('focusin', (e) => {
    if (e.target === userInput) {
      document.body.classList.add('mobile-keyboard');
      setTimeout(() => {
        userInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 100);
    }
  });
  window.addEventListener('focusout', (e) => {
    if (e.target === userInput) {
      document.body.classList.remove('mobile-keyboard');
    }
  });
}

// 로그인한 사용자 정보 표시
(function showUserInfo() {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    document.getElementById('user-email').textContent = payload.id;
    document.getElementById('user-nick').textContent = payload.nickname;
  } catch {}
})();

// 공지/업데이트 동적 불러오기
(async function loadNoticeUpdate() {
  try {
    const res = await fetch('/api/notice');
    const data = await res.json();
    document.getElementById('notice-content').textContent = data.notice || '';
    const updateUl = document.querySelector('.update-section ul');
    updateUl.innerHTML = '';
    (data.update || '').split('\n').forEach(x => {
      const li = document.createElement('li');
      li.textContent = x;
      updateUl.appendChild(li);
    });
  } catch {}
})();
