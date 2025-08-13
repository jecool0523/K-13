// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const toml = require('toml');
const { v4: uuidv4 } = require('uuid');
const redis = require('../server/redisClient');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// wrangler.toml에서 SYSTEM_PROMPT 읽기
let SYSTEM_PROMPT = 'AI 캐릭터 프롬프트가 설정되지 않았습니다.';
try {
  const tomlData = fs.readFileSync('wrangler.toml', 'utf-8');
  const config = toml.parse(tomlData);
  if (config.SYSTEM_PROMPT) {
    SYSTEM_PROMPT = config.SYSTEM_PROMPT;
  } else if (config.vars && config.vars.SYSTEM_PROMPT) {
    SYSTEM_PROMPT = config.vars.SYSTEM_PROMPT;
  }
} catch (e) {
  console.error('wrangler.toml에서 SYSTEM_PROMPT를 읽을 수 없습니다:', e.message);
}

app.use(cors());
app.use(bodyParser.json());

// 유저 회원가입
app.post('/api/register', async (req, res) => {
  const { id, password, nickname, apiKey } = req.body;
  const userKey = `user:${id}`;
  const exists = await redis.exists(userKey);
  if (exists) return res.status(409).json({ error: '이미 가입된 아이디입니다.' });
  const hash = await bcrypt.hash(password, 10);
  await redis.hmset(userKey, 'id', id, 'password', hash, 'nickname', nickname, 'apiKey', apiKey || '');
  res.json({ success: true });
});

// 유저 로그인
app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;
  const userKey = `user:${id}`;
  const user = await redis.hgetall(userKey);
  if (!user.id) return res.status(404).json({ error: '존재하지 않는 아이디입니다.' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
  const token = jwt.sign({ id, nickname: user.nickname }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// API 키 저장/수정
app.post('/api/profile', async (req, res) => {
  const { token, apiKey } = req.body;
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const userKey = `user:${id}`;
    await redis.hset(userKey, 'apiKey', apiKey);
    res.json({ success: true });
  } catch {
    res.status(401).json({ error: '인증 실패' });
  }
});

// 닉네임 변경
app.post('/api/change-nickname', async (req, res) => {
  const { token, nickname } = req.body;
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const userKey = `user:${id}`;
    await redis.hset(userKey, 'nickname', nickname);
    res.json({ success: true });
  } catch {
    res.status(401).json({ error: '인증 실패' });
  }
});

// 채팅로그 조회
app.get('/api/chatlog', async (req, res) => {
  const { token } = req.query;
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const logs = await redis.lrange(`chatlog:${id}`, 0, -1);
    res.json({ logs: logs.map(JSON.parse) });
  } catch {
    res.status(401).json({ error: '인증 실패' });
  }
});

// 새 대화 세션 시작
app.post('/api/new-session', async (req, res) => {
  const { token } = req.body;
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const sessionId = uuidv4();
    const now = Date.now();
    // 세션 리스트에 추가 (최신순 정렬)
    await redis.lpush(`chatlog:${id}:sessions`, JSON.stringify({ sessionId, startedAt: now }));
    res.json({ sessionId });
  } catch {
    res.status(401).json({ error: '인증 실패' });
  }
});

// 내 대화 세션 목록 조회
app.get('/api/chat-sessions', async (req, res) => {
  const { token } = req.query;
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const sessions = await redis.lrange(`chatlog:${id}:sessions`, 0, 19); // 최근 20개
    res.json({ sessions: sessions.map(JSON.parse) });
  } catch {
    res.status(401).json({ error: '인증 실패' });
  }
});

// 특정 세션의 대화내역 조회
app.get('/api/chatlog', async (req, res) => {
  const { token, session } = req.query;
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const logs = await redis.lrange(`chatlog:${id}:${session}`, 0, -1);
    res.json({ logs: logs.map(JSON.parse) });
  } catch {
    res.status(401).json({ error: '인증 실패' });
  }
});

// 전체 대화 기록 조회
app.get('/api/conversations', async (req, res) => {
  const { token } = req.query;
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const convKey = `conversations:${id}`;
    const messages = await redis.lrange(convKey, 0, -1);
    res.json({ messages: messages.map(JSON.parse) });
  } catch {
    res.status(401).json({ error: '인증 실패' });
  }
});

// 비밀번호 변경
app.post('/api/change-password', async (req, res) => {
  const { token, currentPassword, newPassword } = req.body;
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const userKey = `user:${id}`;
    const user = await redis.hgetall(userKey);
    if (!user.id) return res.status(404).json({ error: '존재하지 않는 아이디입니다.' });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: '현재 비밀번호가 틀렸습니다.' });
    const hash = await bcrypt.hash(newPassword, 10);
    await redis.hset(userKey, 'password', hash);
    res.json({ success: true });
  } catch {
    res.status(401).json({ error: '인증 실패' });
  }
});

// 공지/업데이트 조회
app.get('/api/notice', async (req, res) => {
  const notice = await redis.get('notice:main') || '';
  const update = await redis.get('update:main') || '';
  res.json({ notice, update });
});

// 공지/업데이트 수정 (관리자)
app.post('/api/notice', async (req, res) => {
  const { adminPassword, notice, update } = req.body;
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: '관리자 인증 실패' });
  }
  await redis.set('notice:main', notice || '');
  await redis.set('update:main', update || '');
  res.json({ success: true });
});

// 소켓 연결 및 채팅 처리
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  const sessionId = socket.handshake.auth.sessionId;
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    socket.id_ = id;
    socket.sessionId = sessionId;
    next();
  } catch {
    next(new Error('인증 실패'));
  }
});

io.on('connection', (socket) => {
  socket.on('chat', async (data) => {
    const { text, model } = typeof data === 'object' ? data : { text: data, model: undefined };
    const userKey = `user:${socket.id_}`;
    const user = await redis.hgetall(userKey);
    const aiReply = await getAIResponse(text, user.apiKey, model);
    const log = { role: 'user', message: text, time: Date.now(), model };
    const aiLog = { role: 'ai', message: aiReply, time: Date.now(), model };
    const sessionKey = `chatlog:${socket.id_}:${socket.sessionId}`;
    await redis.rpush(sessionKey, JSON.stringify(log), JSON.stringify(aiLog));
    const convKey = `conversations:${socket.id_}`;
    await redis.rpush(convKey, JSON.stringify(log), JSON.stringify(aiLog));
    // 세션 미리보기(최초 메시지) 갱신
    const sessions = await redis.lrange(`chatlog:${socket.id_}:sessions`, 0, -1);
    if (sessions.length > 0) {
      let first = JSON.parse(sessions[0]);
      if (!first.preview) {
        first.preview = text;
        await redis.lset(`chatlog:${socket.id_}:sessions`, 0, JSON.stringify(first));
      }
    }
    socket.emit('chat', aiReply);
  });
});

// AI 응답 함수에서 model 파라미터 사용
async function getAIResponse(userMessage, apiKey, model) {
  // 실제 API 연동 시 model 파라미터를 사용
  // 예시: OpenAI/Gemini API 호출 시 model명 전달
  return `[${model || '기본모델'}] AI 응답: ${userMessage}`;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 실행중: http://localhost:${PORT}`);
}); 