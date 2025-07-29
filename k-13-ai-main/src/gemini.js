import { logError } from './utils.js';

export async function handleChat(request, env) {
  try {
    const { message, model, conversationId, imageData } = await request.json();
    
    // 사용자 인증 확인
    const user = await getUserFromToken(request, env);
    if (!user) {
      return new Response('으....이....', { status: 401 });
    }
    
    // 대화 기록 조회
    const history = await getChatHistory(conversationId, env);
    
    // SYSTEM_PROMPT를 env 변수에서 가져오기
    const systemPrompt = env.SYSTEM_PROMPT;
    
    // 현재 시간 (서울/도쿄 기준)
    const currentTime = getCurrentSeoulTime();
    
    // 최신 이미지 조회 (이미지가 있는 경우에만)
    let latestImageData = null;
    if (imageData) {
      // 현재 업로드된 이미지 사용
      latestImageData = imageData;
    } else {
      // 대화 기록에서 최신 이미지 찾기
      latestImageData = await getLatestImageFromHistory(conversationId, env);
    }
    
    // Gemini API 호출
    const apiKey = user.gemini_api_key || env.GEMINI_API_KEY;
    const response = await callGeminiAPI(message, model, history, user.nickname, apiKey, systemPrompt, currentTime, latestImageData);
    
    // 대화 기록 저장
    await saveChatMessage(conversationId, 'user', message, env);
    await saveChatMessage(conversationId, 'assistant', response, env);
    
    return new Response(JSON.stringify({ response }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await logError(error, env, 'Gemini Chat');
    return new Response('으....이....', { status: 500 });
  }
}

async function callGeminiAPI(message, model, history, nickname, apiKey, systemPrompt, currentTime, imageData = null) {
  try {
    const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    
    const textPrompt = `시스템 프롬프트
${systemPrompt}

현재 시간: ${currentTime}
대화 상대의 닉네임은 ${nickname} 입니다.

기존 대화기록
${historyText}

메시지
${message}`;

    // 요청 본문 구성
    const requestBody = {
      contents: [{
        parts: [{ text: textPrompt }]
      }]
    };

    // 이미지 데이터가 있을 때만 추가
    if (imageData && imageData.base64Data && imageData.mimeType) {
      requestBody.contents[0].parts.push({
        inline_data: {
          mime_type: imageData.mimeType,
          data: imageData.base64Data
        }
      });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }
    
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    throw error;
  }
}

// 최신 이미지 조회 함수
async function getLatestImageFromHistory(conversationId, env) {
  if (!conversationId) {
    return null;
  }
  
  try {
    const result = await env.DB.prepare(
      `SELECT f.filename, f.mime_type 
       FROM messages m 
       JOIN files f ON m.file_id = f.id 
       WHERE m.conversation_id = ? AND m.message_type = 'image' 
       ORDER BY m.created_at DESC 
       LIMIT 1`
    ).bind(conversationId).first();
    
    if (!result) {
      return null;
    }
    
    // R2에서 이미지 데이터 가져오기
    const r2Key = `image_uploads/${result.filename}`;
    const object = await env.R2.get(r2Key);
    
    if (!object) {
      return null;
    }
    
    const arrayBuffer = await object.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    return {
      base64Data: base64Data,
      mimeType: result.mime_type
    };
  } catch (error) {
    console.error('최신 이미지 조회 실패:', error);
    return null;
  }
}

function getCurrentSeoulTime() {
  const now = new Date();
  const seoulTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
  
  const year = seoulTime.getFullYear();
  const month = String(seoulTime.getMonth() + 1).padStart(2, '0');
  const day = String(seoulTime.getDate()).padStart(2, '0');
  const hours = String(seoulTime.getHours()).padStart(2, '0');
  const minutes = String(seoulTime.getMinutes()).padStart(2, '0');
  
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[seoulTime.getDay()];
  
  return `${year}년 ${month}월 ${day}일 ${weekday}요일 ${hours}시 ${minutes}분 (서울/도쿄 기준)`;
}

async function getUserFromToken(request, env) {
  const cookies = request.headers.get('Cookie');
  if (!cookies) return null;
  
  const tokenMatch = cookies.match(/token=([^;]+)/);
  if (!tokenMatch) return null;
  
  try {
    const tokenData = JSON.parse(atob(tokenMatch[1]));
    if (tokenData.exp < Date.now()) {
        return null;
    }
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(tokenData.userId).first();
    return user;
  } catch (e) {
    return null;
  }
}

async function getChatHistory(conversationId, env) {
    if (!conversationId) {
        return [];
    }
    const { results } = await env.DB.prepare(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
    ).bind(conversationId).all();
    return results;
}

async function saveChatMessage(conversationId, role, content, env) {
    if (conversationId) {
        await env.DB.prepare(
            "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)"
        ).bind(conversationId, role, content).run();
    }
}
