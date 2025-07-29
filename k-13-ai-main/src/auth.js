import { generateSalt, hashPassword, verifyPassword } from './utils.js';
import { logError, logDebug } from './utils.js';

export const handleAuth = {
  async login(request, env) {
    try {
      const formData = await request.formData();
      const username = formData.get('username');
      const password = formData.get('password');
      const turnstileToken = formData.get('cf-turnstile-response');
      
      logDebug('로그인 시도', 'Auth Login', { username });
      
      // Turnstile 검증
      const turnstileValid = await verifyTurnstile(turnstileToken, env);
      if (!turnstileValid) {
        logDebug('Turnstile 검증 실패', 'Auth Login');
        return new Response('으....이....', { status: 400 });
      }
      
      // 사용자 조회
      const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?')
        .bind(username).first();
      
      if (!user || !(await verifyPassword(password, user.password_hash, user.salt))) {
        logDebug('사용자 인증 실패', 'Auth Login');
        return new Response('으....이....', { status: 401 });
      }
      
      // JWT 토큰 생성 (만료 시간 연장)
      const token = btoa(JSON.stringify({ 
        userId: user.id, 
        exp: Date.now() + (24 * 60 * 60 * 1000), // 24시간
        iat: Date.now() // 발급 시간 추가
      }));
      
      logDebug('토큰 생성 완료', 'Auth Login', { userId: user.id, tokenLength: token.length });
      
      const url = new URL(request.url);
      const isSecure = url.protocol === 'https:';
      
      const response = new Response(JSON.stringify({ success: true }), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
      
      // 쿠키 설정 강화
      const cookieOptions = [
        `token=${token}`,
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=86400',
        'Path=/'
      ];
      
      // 도메인 설정 개선
      if (!url.hostname.includes('localhost') && 
          !url.hostname.includes('127.0.0.1') && 
          !url.hostname.includes('.local')) {
        cookieOptions.push(`Domain=${url.hostname}`);
      }
      
      if (isSecure) {
        cookieOptions.push('Secure');
      }
      
      const cookieString = cookieOptions.join('; ');
      logDebug('쿠키 설정', 'Auth Login', { cookie: cookieString.substring(0, 100) + '...' });
      
      response.headers.set('Set-Cookie', cookieString);
      
      return response;
    } catch (error) {
      await logError(error, env, 'Auth Login');
      return new Response('으....이....', { status: 500 });
    }
  },
  
  async register(request, env) {
    try {
      const formData = await request.formData();
      const username = formData.get('username');
      const password = formData.get('password');
      const nickname = formData.get('nickname');
      const geminiApiKey = formData.get('gemini_api_key') || null;
      const turnstileToken = formData.get('cf-turnstile-response');
      
      // Turnstile 검증
      const turnstileValid = await verifyTurnstile(turnstileToken, env);
      if (!turnstileValid) {
        return new Response('으....이....', { status: 400 });
      }
      
      // 중복 사용자 확인
      const existingUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?')
        .bind(username).first();
      
      if (existingUser) {
        return new Response('으....이....', { status: 409 });
      }
      
      // 비밀번호 해싱
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);
      
      // 사용자 생성
      await env.DB.prepare(
        'INSERT INTO users (username, nickname, password_hash, salt, gemini_api_key) VALUES (?, ?, ?, ?, ?)'
      ).bind(username, nickname, passwordHash, salt, geminiApiKey).run();
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      await logError(error, env, 'Auth Register');
      return new Response('으....이....', { status: 500 });
    }
  },
  
  async logout(request, env) {
    const url = new URL(request.url);
    const isSecure = url.protocol === 'https:';
    
    const response = new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    const cookieOptions = [
      'token=',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0',
      'Path=/'
    ];
    
    if (!url.hostname.includes('localhost') && 
        !url.hostname.includes('127.0.0.1') && 
        !url.hostname.includes('.local')) {
      cookieOptions.push(`Domain=${url.hostname}`);
    }
    
    if (isSecure) {
      cookieOptions.push('Secure');
    }
    
    response.headers.set('Set-Cookie', cookieOptions.join('; '));
    return response;
  }
};

async function verifyTurnstile(token, env) {
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token
      })
    });
    
    const result = await response.json();
    return result.success;
  } catch {
    return false;
  }
}
