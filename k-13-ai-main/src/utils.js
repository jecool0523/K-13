// 디버그 모드 전역 변수
const DEBUG_MODE = true; // 공개시 false로 변경

export function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  return crypto.subtle.digest('SHA-256', data)
    .then(buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(''));
}

export function verifyPassword(password, hash, salt) {
  return hashPassword(password, salt).then(newHash => newHash === hash);
}

// 디버그 로그 저장소
export const debugLogs = [];

// 로그 기록 함수 (사용자에게도 노출)
export async function logError(error, env, context = '') {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    context,
    message: error.message,
    stack: error.stack,
    type: 'error'
  };
  
  // Workers 로그에 출력
  console.error('=== 에러 로그 ===');
  console.error(`시간: ${timestamp}`);
  console.error(`컨텍스트: ${context}`);
  console.error(`메시지: ${error.message}`);
  console.error(`스택 트레이스: ${error.stack}`);
  console.error('================');
  
  // 디버그 모드일 때 로그 저장
  if (DEBUG_MODE) {
    debugLogs.push(logEntry);
    // 최대 100개의 로그만 유지
    if (debugLogs.length > 100) {
      debugLogs.shift();
    }
  }
}

// 일반 디버그 로그 함수 추가
export function logDebug(message, context = '', data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    context,
    message,
    data,
    type: 'debug'
  };
  
  console.log(`[DEBUG] ${context}: ${message}`, data || '');
  
  if (DEBUG_MODE) {
    debugLogs.push(logEntry);
    if (debugLogs.length > 100) {
      debugLogs.shift();
    }
  }
}

// 로그 조회 함수
export function getDebugLogs() {
  return DEBUG_MODE ? debugLogs : [];
}

// 로그 클리어 함수
export function clearDebugLogs() {
  if (DEBUG_MODE) {
    debugLogs.length = 0;
  }
}
