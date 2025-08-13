import { handleAuth } from './auth.js';
import { handleChat } from './gemini.js';
import { logError, logDebug, getDebugLogs, clearDebugLogs, generateSalt, hashPassword, verifyPassword } from './utils.js';
import redis from '../server/redisClient.js';

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      
      logDebug(`요청 받음: ${request.method} ${path}`, 'Main Router');
      
      // 정적 파일 서빙 (이미지 경로 추가)
      if (path.startsWith('/css/') || path.startsWith('/js/') || path.startsWith('/images/')) {
        return handleStaticFiles(path, env);
      }
      
      // API 라우팅
      if (path.startsWith('/api/')) {
        return handleAPI(request, env, path);
      }
      
      // 페이지 라우팅
      return handlePages(request, env);
    } catch (error) {
      await logError(error, env, 'Main Router');
      return new Response('으....이....', { status: 500 });
    }
  }
};

// 정적 파일 서빙 함수
async function handleStaticFiles(path, env) {
  try {
    logDebug(`정적 파일 요청: ${path}`, 'Static Files');
    
    if (env.ASSETS) {
      const file = await env.ASSETS.fetch(new Request(`https://dummy${path}`));
      logDebug(`정적 파일 제공 성공: ${path}`, 'Static Files');
      return file;
    } else {
      logDebug('ASSETS 바인딩 없음', 'Static Files');
      return new Response('정적 파일 서비스를 사용할 수 없습니다', { status: 503 });
    }
  } catch (error) {
    await logError(error, env, 'Static Files');
    return new Response('정적 파일 로드 오류', { status: 500 });
  }
}

// API 라우팅 함수
async function handleAPI(request, env, path) {
  const method = request.method;
  
  logDebug(`API 요청: ${method} ${path}`, 'API Router');
  
  switch (path) {
    case '/api/auth/login':
      if (method === 'POST') return handleAuth.login(request, env);
      return new Response('으....이....', { status: 405 });
      
    case '/api/auth/register':
      if (method === 'POST') return handleAuth.register(request, env);
      return new Response('으....이....', { status: 405 });
      
    case '/api/auth/logout':
      if (method === 'POST') return handleAuth.logout(request, env);
      return new Response('으....이....', { status: 405 });
      
    case '/api/chat':
      if (method === 'POST') return handleChat(request, env);
      return new Response('으....이....', { status: 405 });
      
    case '/api/user/info':
      if (method === 'GET') return getUserInfo(request, env);
      return new Response('으....이....', { status: 405 });
      
    case '/api/conversations':
      if (method === 'GET') return handleConversations(request, env);
      if (method === 'POST') return createConversation(request, env);
      return new Response('으....이....', { status: 405 });
      
    case '/api/user/update':
      if (method === 'POST') return handleUserUpdate(request, env);
      return new Response('으....이....', { status: 405 });
      
    case '/api/admin/notice':
      if (method === 'GET') return getNotice(request, env);
      if (method === 'POST') return updateNotice(request, env);
      return new Response('으....이....', { status: 405 });
      
    case '/api/admin/login':
      if (method === 'POST') return adminLogin(request, env);
      return new Response('으....이....', { status: 405 });
      
    case '/api/debug/logs':
      if (method === 'GET') return getDebugLogsAPI(request, env);
      if (method === 'DELETE') return clearDebugLogsAPI(request, env);
      return new Response('으....이....', { status: 405 });
      
    case '/api/debug/auth':
      if (method === 'GET') return debugAuthStatus(request, env);
      return new Response('으....이....', { status: 405 });
      
    // 🔧 변경: presigned URL 대신 직접 업로드 처리
    case '/api/upload/direct':
      if (method === 'POST') return handleDirectUpload(request, env);
      return new Response('으....이....', { status: 405 });
      
    default:
      // 대화방 개별 조회/삭제 처리
      const conversationMatch = path.match(/^\/api\/conversations\/(\d+)$/);
      if (conversationMatch) {
        const conversationId = parseInt(conversationMatch[1]);
        if (method === 'GET') return getConversationMessages(request, env, conversationId);
        if (method === 'DELETE') return deleteConversation(request, env, conversationId);
        return new Response('으....이....', { status: 405 });
      }
      
      // 업로드된 이미지 서빙
      const imageMatch = path.match(/^\/api\/images\/(.+)$/);
      if (imageMatch) {
        const fileName = imageMatch[1];
        if (method === 'GET') return serveImage(request, env, fileName);
        return new Response('으....이....', { status: 405 });
      }
      
      return new Response('으....이....', { status: 404 });
  }
}

// 페이지 라우팅 함수
async function handlePages(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  let fileName = '';
  
  logDebug(`페이지 요청: ${path}`, 'Page Router');
  
  switch (path) {
    case '/':
      logDebug('랜딩 페이지 요청', 'Page Router');
      return getLandingPage();
      
    case '/chat':
      logDebug('채팅 페이지 요청', 'Page Router');
      fileName = 'chat.html';
      break;
      
    case '/login':
      logDebug('로그인 페이지 요청', 'Page Router');
      fileName = 'login.html';
      break;
      
    case '/register':
      logDebug('회원가입 페이지 요청', 'Page Router');
      fileName = 'register.html';
      break;
      
    case '/admin':
      logDebug('관리자 페이지 요청', 'Page Router');
      fileName = 'admin.html';
      break;
      
    case '/debug':
      return getDebugPage(request, env);
      
    default:
      logDebug(`알 수 없는 페이지 요청: ${path}`, 'Page Router');
      return new Response('으....이....', { status: 404 });
  }
  
  try {
    if (env.ASSETS) {
      const file = await env.ASSETS.fetch(new Request(`https://dummy/${fileName}`));
      logDebug(`파일 제공 성공: ${fileName}`, 'Page Router');
      return file;
    } else {
      logDebug('ASSETS 바인딩 없음', 'Page Router');
      return new Response('정적 파일 서비스를 사용할 수 없습니다', { status: 503 });
    }
  } catch (error) {
    await logError(error, env, 'Page Routing');
    return new Response('으....이....', { status: 404 });
  }
}

// 🔧 새로운 직접 업로드 처리 함수
async function handleDirectUpload(request, env) {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user || !user.gemini_api_key) {
      return new Response('으....이....', { status: 403 });
    }
    
    const formData = await request.formData();
    const file = formData.get('file');
    const conversationId = formData.get('conversationId');
    
    if (!file) {
      return new Response('으....이....', { status: 400 });
    }
    
    // 파일 검증
    if (!validateFile(file.name, file.size, file.type)) {
      return new Response('으....이....', { status: 400 });
    }
    
    // 고유 파일명 생성
    const uniqueFileName = generateUniqueFileName(file.name);
    const r2Key = `image_uploads/${uniqueFileName}`;
    
    // R2에 직접 업로드 (바인딩 사용)
    await env.R2.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });
    
    // 파일 메타데이터 DB 저장
    const fileResult = await env.DB.prepare(
      'INSERT INTO files (user_id, filename, original_name, file_size, mime_type, r2_key) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
    ).bind(user.id, uniqueFileName, file.name, file.size, file.type, r2Key).run();
    
    const fileId = fileResult.meta.last_row_id;
    
    // 이미지 메시지 생성
    await env.DB.prepare(
      'INSERT INTO messages (conversation_id, role, content, message_type, file_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(conversationId, 'user', file.name, 'image', fileId).run();
    
    return new Response(JSON.stringify({
      success: true,
      fileId,
      imageUrl: `/api/images/${uniqueFileName}`,
      fileName: uniqueFileName
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await logError(error, env, 'Direct Upload');
    return new Response('으....이....', { status: 500 });
  }
}

async function serveImage(request, env, fileName) {
  try {
    const r2Key = `image_uploads/${fileName}`;
    const object = await env.R2.get(r2Key);
    
    if (!object) {
      return new Response('으....이....', { status: 404 });
    }
    
    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata.contentType || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=31536000');
    
    return new Response(object.body, { headers });
  } catch (error) {
    await logError(error, env, 'Serve Image');
    return new Response('으....이....', { status: 500 });
  }
}

// 🔧 강화된 파일 검증 함수
function validateFile(fileName, fileSize, mimeType) {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB
  
  // MIME 타입 검증
  if (!allowedTypes.includes(mimeType)) {
    return false;
  }
  
  // 파일 크기 검증
  if (fileSize > maxSize || fileSize <= 0) {
    return false;
  }
  
  // 파일명 검증
  if (!fileName || fileName.length > 255) {
    return false;
  }
  
  // 확장자 검증
  const ext = fileName.split('.').pop()?.toLowerCase();
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
  
  if (!ext || !allowedExts.includes(ext)) {
    return false;
  }
  
  return true;
}

// 고유 파일명 생성 함수
function generateUniqueFileName(originalName) {
  const ext = originalName.split('.').pop();
  const uuid = crypto.randomUUID();
  const timestamp = Date.now();
  return `${uuid}_${timestamp}.${ext}`;
}

// 사용자 인증 확인 함수
async function getUserFromRequest(request, env) {
  try {
    const cookies = request.headers.get('Cookie');
    
    if (!cookies) {
      return null;
    }
    
    const tokenMatch = cookies.match(/token=([^;]+)/);
    if (!tokenMatch) {
      return null;
    }
    
    let tokenData;
    try {
      tokenData = JSON.parse(atob(tokenMatch[1]));
    } catch (decodeError) {
      return null;
    }
    
    // 토큰 만료 확인
    if (tokenData.exp < Date.now()) {
      return null;
    }

    const sessionExists = await redis.get(`session:${tokenMatch[1]}`);
    if (!sessionExists) {
      return null;
    }
    
    // 사용자 조회
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(tokenData.userId).first();
    
    return user;
  } catch (error) {
    console.error('인증 확인 중 오류:', error);
    return null;
  }
}

// 나머지 API 함수들 (기존과 동일)
async function getUserInfo(request, env) {
  try {
    logDebug('사용자 정보 조회 요청', 'Get User Info');
    
    const user = await getUserFromRequest(request, env);
    if (!user) {
      logDebug('인증되지 않은 사용자 - 401 응답', 'Get User Info');
      return new Response('으....이....', { status: 401 });
    }
    
    const userInfo = {
      username: user.username,
      nickname: user.nickname,
      has_api_key: !!user.gemini_api_key
    };
    
    logDebug('사용자 정보 조회 성공', 'Get User Info', userInfo);
    
    return new Response(JSON.stringify(userInfo), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await logError(error, env, 'Get User Info');
    return new Response('으....이....', { status: 500 });
  }
}

async function handleConversations(request, env) {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response('으....이....', { status: 401 });
    }
    
    const { results } = await env.DB.prepare(
      'SELECT id, title, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(user.id).all();
    
    return new Response(JSON.stringify(results || []), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await logError(error, env, 'Handle Conversations');
    return new Response('으....이....', { status: 500 });
  }
}

async function createConversation(request, env) {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response('으....이....', { status: 401 });
    }
    
    const body = await request.json().catch(() => ({}));
    const title = body.title || `대화 ${new Date().toLocaleString('ko-KR')}`;
    
    const result = await env.DB.prepare(
      'INSERT INTO conversations (user_id, title) VALUES (?, ?) RETURNING id'
    ).bind(user.id, title).run();
    
    return new Response(JSON.stringify({ id: result.meta.last_row_id }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await logError(error, env, 'Create Conversation');
    return new Response('으....이....', { status: 500 });
  }
}

async function getConversationMessages(request, env, conversationId) {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response('으....이....', { status: 401 });
    }
    
    const conversation = await env.DB.prepare(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(conversationId, user.id).first();
    
    if (!conversation) {
      return new Response('으....이....', { status: 404 });
    }
    
    const { results } = await env.DB.prepare(
      `SELECT m.role, m.content, m.created_at, m.message_type, m.file_id, f.filename 
       FROM messages m 
       LEFT JOIN files f ON m.file_id = f.id 
       WHERE m.conversation_id = ? 
       ORDER BY m.created_at ASC`
    ).bind(conversationId).all();
    
    return new Response(JSON.stringify(results || []), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await logError(error, env, 'Get Conversation Messages');
    return new Response('으....이....', { status: 500 });
  }
}

async function deleteConversation(request, env, conversationId) {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response('으....이....', { status: 401 });
    }
    
    const conversation = await env.DB.prepare(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(conversationId, user.id).first();
    
    if (!conversation) {
      return new Response('으....이....', { status: 404 });
    }
    
    await env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(conversationId).run();
    await env.DB.prepare('DELETE FROM conversations WHERE id = ?').bind(conversationId).run();
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await logError(error, env, 'Delete Conversation');
    return new Response('으....이....', { status: 500 });
  }
}

async function handleUserUpdate(request, env) {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response('으....이....', { status: 401 });
    }
    
    const { type, ...data } = await request.json();
    
    switch (type) {
      case 'password':
        const { current_password, new_password } = data;
        const isValidPassword = await verifyPassword(current_password, user.password_hash, user.salt);
        
        if (!isValidPassword) {
          return new Response('으....이....', { status: 400 });
        }
        
        const salt = generateSalt();
        const passwordHash = await hashPassword(new_password, salt);
        
        await env.DB.prepare(
          'UPDATE users SET password_hash = ?, salt = ? WHERE id = ?'
        ).bind(passwordHash, salt, user.id).run();
        break;
        
      case 'nickname':
        await env.DB.prepare(
          'UPDATE users SET nickname = ? WHERE id = ?'
        ).bind(data.new_nickname, user.id).run();
        break;
        
      case 'api_key':
        await env.DB.prepare(
          'UPDATE users SET gemini_api_key = ? WHERE id = ?'
        ).bind(data.api_key || null, user.id).run();
        break;
        
      case 'delete_api_key':
        await env.DB.prepare(
          'UPDATE users SET gemini_api_key = NULL WHERE id = ?'
        ).bind(user.id).run();
        break;
        
      default:
        return new Response('으....이....', { status: 400 });
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await logError(error, env, 'Handle User Update');
    return new Response('으....이....', { status: 500 });
  }
}

async function getNotice(request, env) {
  try {
    const result = await env.DB.prepare('SELECT content FROM notices ORDER BY id DESC LIMIT 1').first();
    return new Response(JSON.stringify({ notice: result?.content || '' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await logError(error, env, 'Get Notice');
    return new Response('으....이....', { status: 500 });
  }
}

async function updateNotice(request, env) {
  try {
    const { password, content } = await request.json();
    
    if (password !== env.ADMIN_PASSWORD) {
      return new Response('으....이....', { status: 401 });
    }
    
    await env.DB.prepare('UPDATE notices SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1')
      .bind(content).run();
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await logError(error, env, 'Update Notice');
    return new Response('으....이....', { status: 500 });
  }
}

async function adminLogin(request, env) {
  try {
    const { password } = await request.json();
    
    if (password === env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response('으....이....', { status: 401 });
    }
  } catch (error) {
    await logError(error, env, 'Admin Login');
    return new Response('으....이....', { status: 500 });
  }
}

async function getDebugLogsAPI(request, env) {
  const logs = getDebugLogs();
  return new Response(JSON.stringify(logs, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function clearDebugLogsAPI(request, env) {
  clearDebugLogs();
  return new Response(JSON.stringify({ message: '로그가 클리어되었습니다.' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function debugAuthStatus(request, env) {
  const user = await getUserFromRequest(request, env);
  const cookies = request.headers.get('Cookie');
  
  return new Response(JSON.stringify({
    authenticated: !!user,
    user: user ? { id: user.id, username: user.username, nickname: user.nickname } : null,
    cookies: cookies ? '존재' : '없음',
    timestamp: new Date().toISOString()
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function getLandingPage() {
  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>카나데 챗봇</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .landing-container {
            text-align: center;
            background: white;
            padding: 60px 40px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            max-width: 500px;
            width: 90%;
        }
        .profile-image {
            width: 150px;
            height: 150px;
            border-radius: 50%;
            object-fit: cover;
            margin-bottom: 30px;
            border: 4px solid #87CEEB;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .welcome-title {
            font-size: 2.5rem;
            color: #333;
            margin-bottom: 15px;
            font-weight: 600;
        }
        .welcome-subtitle {
            font-size: 1.1rem;
            color: #666;
            margin-bottom: 40px;
        }
        .btn-custom {
            background-color: #87CEEB;
            border: none;
            color: #333;
            padding: 15px 40px;
            font-size: 1.1rem;
            border-radius: 50px;
            transition: all 0.3s ease;
            margin: 10px;
            text-decoration: none;
            display: inline-block;
            font-weight: 600;
        }
        .btn-custom:hover {
            background-color: #4682B4;
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.2);
        }
        .description {
            font-size: 0.95rem;
            color: #888;
            margin-top: 30px;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="landing-container">
        <img src="/images/kanade-profile.webp" alt="요이사키 카나데" class="profile-image" onerror="this.style.display='none'">
        <h1 class="welcome-title">카나데 챗봇</h1>
        <p class="welcome-subtitle">Gemini 기반 카나데 AI 챗봇</p>
        
        <div>
            <a href="/login" class="btn-custom">로그인</a>
            <a href="/register" class="btn-custom">회원가입</a>
        </div>
        
        <p class="description">
            내아내임.... 아니 딸인가?<br>
            아무튼 애호해주세요
        </p>
    </div>
</body>
</html>`;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

async function getDebugPage(request, env) {
  const logs = getDebugLogs();
  const user = await getUserFromRequest(request, env);
  
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>디버그 페이지</title>
    <style>
        body { font-family: monospace; padding: 20px; }
        .log-entry { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
        .error { background: #ffebee; }
        .debug { background: #e8f5e9; }
        .auth-status { background: #e3f2fd; padding: 15px; margin-bottom: 20px; }
        pre { white-space: pre-wrap; }
    </style>
</head>
<body>
    <h1>디버그 페이지</h1>
    
    <div class="auth-status">
        <h2>인증 상태</h2>
        <p>인증됨: ${user ? '예' : '아니오'}</p>
        ${user ? `<p>사용자: ${user.username} (${user.nickname})</p>` : ''}
        <p>쿠키: ${request.headers.get('Cookie') ? '존재' : '없음'}</p>
    </div>
    
    <h2>로그 (최근 ${logs.length}개)</h2>
    <button onclick="clearLogs()">로그 클리어</button>
    <button onclick="location.reload()">새로고침</button>
    
    <div id="logs">
        ${logs.map(log => `
            <div class="log-entry ${log.type}">
                <strong>${log.timestamp}</strong> [${log.context}]<br>
                ${log.message}<br>
                ${log.data ? `<pre>${JSON.stringify(log.data, null, 2)}</pre>` : ''}
                ${log.stack ? `<pre>${log.stack}</pre>` : ''}
            </div>
        `).join('')}
    </div>
    
    <script>
        async function clearLogs() {
            await fetch('/api/debug/logs', { method: 'DELETE' });
            location.reload();
        }
    </script>
</body>
</html>`;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
