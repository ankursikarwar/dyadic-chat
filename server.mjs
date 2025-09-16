import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';

const __dirname = path.resolve();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const MAX_TURNS = Number(process.env.MAX_TURNS || 10); // one turn = two messages (both users)
const REQUIRE_DISTINCT_PID = process.env.REQUIRE_DISTINCT_PID !== '0';
const BLOCK_REPEAT_PID = String(process.env.BLOCK_REPEAT_PID || 'false').toLowerCase() === 'true';
const STOP_WHEN_DECK_COMPLETE = String(process.env.STOP_WHEN_DECK_COMPLETE || 'false').toLowerCase() !== 'false';

app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));
app.get('/', (_req, res) => { res.set('Cache-Control','no-store'); res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// ---------- Load items ----------
let items = [];
try {
  const p = path.join(__dirname, 'data', 'items.json');
  items = JSON.parse(fs.readFileSync(p, 'utf-8'));
  console.log('[DyadicChat] Loaded items:', items.length);
} catch (e) {
  console.warn('[DyadicChat] No items.json; using sample.', e.message);
  items = [{
    id: 'sample1',
    image_url: '/img/sample.jpg',
    goal_question: 'How many total shelves are visible across all bookcases?',
    options: ['8','9','10','12']
  }];
}

// ---------- Persistent deck (no repeats until cycle completes) ----------
const statePath = path.join(__dirname, 'data', 'deck_state.json');
let deck = []; let deckIdx = 0;

function saveDeck(){ try { fs.writeFileSync(statePath, JSON.stringify({ order: deck, idx: deckIdx })); } catch(e){} }
function loadDeck(){
  try {
    const s = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    const valid = new Set(items.map(x => x.id));
    deck = (s.order || []).filter(id => valid.has(id));
    deckIdx = Math.min(Math.max(0, s.idx|0), deck.length);
  } catch { deck = []; deckIdx = 0; }
}
function reshuffleDeck(){ deck = items.map(x => x.id).sort(()=>Math.random()-0.5); deckIdx = 0; saveDeck(); }
function nextItem(){
  if (!deck.length) reshuffleDeck();
  if (deckIdx >= deck.length) reshuffleDeck();
  const id = deck[deckIdx++]; saveDeck();
  return items.find(x => x.id === id) || items[0];
}
loadDeck();
if (deck.length !== items.length) reshuffleDeck();

// ---------- Persistent seen PIDs & completed items ----------
const seenPath = path.join(__dirname, 'data', 'seen_pids.json');
const completedPath = path.join(__dirname, 'data', 'completed_items.json');

function loadJson(p, def){ try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return def; } }
function saveJsonAtomic(p, obj){
  try { const tmp = p + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, p); } catch(e){}
}

let seenPidsMap = loadJson(seenPath, {}); // { PID: true }
let completedItems = new Set(loadJson(completedPath, { completed: [] }).completed || []);

function markPidSeen(pid){ if (!pid) return; if (!seenPidsMap[pid]){ seenPidsMap[pid]=true; saveJsonAtomic(seenPath, seenPidsMap); } }
function markItemCompleted(id){ if (!id) return; if (!completedItems.has(id)){ completedItems.add(id); saveJsonAtomic(completedPath, { completed: Array.from(completedItems) }); } }

// ---------- Pairing ----------
const queue = [];
const rooms = new Map();

io.on('connection', (socket) => {
  const pid = (socket.handshake.query && String(socket.handshake.query.pid||'').trim()) || 'DEBUG_LOCAL';
  socket.prolific = { PID: pid };

  if (STOP_WHEN_DECK_COMPLETE){
    const totalItems = items.length;
    if (totalItems > 0 && completedItems.size >= totalItems){
      io.to(socket.id).emit('blocked:deck_complete');
      setTimeout(()=>socket.disconnect(true), 0);
      return;
    }
  }
  if (BLOCK_REPEAT_PID && seenPidsMap[pid]){
    io.to(socket.id).emit('blocked:repeat_pid');
    setTimeout(()=>socket.disconnect(true), 0);
    return;
  }

  // Clear any existing room assignment for reconnecting users
  socket.currentRoom = null;
  
  console.log(`[DyadicChat] New connection: ${socket.id} (PID: ${pid}), adding to queue`);
  queue.push(socket);
  console.log(`[DyadicChat] Queue length after adding: ${queue.length}`);
  tryPair();

  socket.on('disconnect', (reason) => {
    console.log(`[DyadicChat] Socket ${socket.id} disconnected: ${reason}`);
    
    // Remove from queue if still waiting
    const qi = queue.indexOf(socket);
    if (qi >= 0) queue.splice(qi, 1);
    
    const roomId = socket.currentRoom;
    if (roomId && rooms.has(roomId)){
      const room = rooms.get(roomId);
      const other = room.users.find(u => u.id !== socket.id);
      
      // Check if this user had already completed the study
      const wasAlreadyFinished = room.finished[socket.id];
      
      // Mark this user as finished
      room.finished[socket.id] = true;
      
      // Only notify partner if they hadn't completed the study yet
      if (other && !wasAlreadyFinished) {
        try { 
          io.to(other.id).emit('end:partner'); 
          console.log(`[DyadicChat] Notified partner ${other.id} of disconnect - they must refresh to rejoin`);
        } catch(e) {
          console.error('[DyadicChat] Error notifying partner:', e);
        }
      } else if (other && wasAlreadyFinished) {
        console.log(`[DyadicChat] User ${socket.id} disconnected after completing study, partner can continue`);
      }
      
      // Clean up the room if:
      // 1. No partner exists, OR
      // 2. Partner is finished and has submitted survey, OR  
      // 3. Partner is finished but hasn't submitted survey yet (they'll submit later)
      if (!other || (room.finished[other.id] && room.surveys[other.id]) || room.finished[other.id]) {
        try { 
          persistRoom(room);
          rooms.delete(roomId);
          console.log(`[DyadicChat] Cleaned up room ${roomId} - partner finished or no partner`);
        } catch(e) {
          console.error('[DyadicChat] Error cleaning up room:', e);
        }
      } else {
        console.log(`[DyadicChat] Room ${roomId} kept active - partner can still complete study`);
      }
    }
  });

  socket.on('chat:message', (msg={}) => {
    const roomId = socket.currentRoom;
    if (!roomId || !rooms.has(roomId)) {
      // Room no longer exists, ignore the message
      console.log(`[DyadicChat] User ${socket.id} tried to send message to non-existent room ${roomId}`);
      return;
    }
    const room = rooms.get(roomId);
    if (room.chatClosed) return;

    if (room.nextSenderId && room.nextSenderId !== socket.id){
      io.to(socket.id).emit('turn:wait');
      return;
    }
    const text = String(msg.text || '').slice(0, 2000);
    const rec = { who: socket.id, pid: socket.prolific.PID, text, t: Date.now() };
    room.messages.push(rec);

    room.msgCount = (room.msgCount || 0) + 1;
    const completedTurns = Math.floor(room.msgCount / 2);
    if (completedTurns >= room.minTurns){
      room.chatClosed = true;
      io.to(roomId).emit('chat:closed');
    }

    const other = room.users.find(u => u.id !== socket.id);
    room.nextSenderId = other ? other.id : null;
    if (other){
      io.to(other.id).emit('chat:message', { text, serverTs: rec.t });
      io.to(other.id).emit('turn:you');
    }
    io.to(socket.id).emit('turn:wait');
  });

  socket.on('answer:submit', (payload={}) => {
    const roomId = socket.currentRoom;
    if (!roomId || !rooms.has(roomId)) {
      // Room no longer exists, ignore the submission
      console.log(`[DyadicChat] User ${socket.id} tried to submit answer to non-existent room ${roomId}`);
      return;
    }
    const room = rooms.get(roomId);
    room.answers[socket.id] = { pid: socket.prolific.PID, choice: payload.choice, rt: payload.rt, t: Date.now() };
    room.finished[socket.id] = true;
    // Don't send end:self here - user should continue to survey page

    const [a,b] = room.users;
    
    // Only clean up the room when both users have completed the study
    if (room.finished[a.id] && room.finished[b.id]){
      try { markItemCompleted(room.item.id || room.item.image_url || String(room.item)); } catch {}
      
      // Check if both users have also submitted surveys
      if (room.surveys[a.id] && room.surveys[b.id]) {
        // Both users completed study and submitted surveys
        persistRoom(room);
        rooms.delete(room.id);
        console.log(`[DyadicChat] Both users completed study and surveys, cleaned up room ${roomId}`);
      } else {
        // Both users completed study but not all surveys submitted yet
        console.log(`[DyadicChat] Both users completed study, waiting for surveys before cleaning up room ${roomId}`);
      }
    } else {
      console.log(`[DyadicChat] User ${socket.id} completed study, partner can still continue`);
    }
  });

  socket.on('survey:submit', (payload={}, callback) => {
    console.log(`[DyadicChat] Received survey submission from ${socket.id}:`, payload);
    const roomId = socket.currentRoom;
    if (!roomId || !rooms.has(roomId)) {
      console.log(`[DyadicChat] User ${socket.id} tried to submit survey to non-existent room ${roomId} - saving survey data anyway`);
      
      // Even if room doesn't exist, try to save the survey data
      // This can happen if the room was cleaned up but user is still submitting survey
      const surveyData = {
        id: roomId,
        item: 'unknown',
        minTurns: 0,
        messages: [],
        answers: {},
        surveys: {
          [socket.id]: {
            pid: socket.prolific.PID,
            survey: payload.survey,
            answerData: payload.answerData,
            submittedAt: Date.now()
          }
        },
        pairedAt: Date.now(),
        closed: true,
        userRoles: {
          [socket.id]: 'unknown' // Can't determine role for disconnected room
        }
      };
      
      try {
        const dir = path.join(__dirname, 'data');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        const line = JSON.stringify(surveyData) + "\n";
        fs.appendFileSync(path.join(dir, 'transcripts.ndjson'), line);
        console.log('[DyadicChat] Saved survey data for disconnected room', roomId);
      } catch(e) {
        console.error('[DyadicChat] Error saving survey data:', e);
      }
      return;
    }
    
    const room = rooms.get(roomId);
    const { survey, answerData } = payload;
    
    // Store survey data for this user
    room.surveys[socket.id] = {
      pid: socket.prolific.PID,
      survey: survey,
      answerData: answerData,
      submittedAt: Date.now()
    };
    
    console.log(`[DyadicChat] User ${socket.id} submitted survey data`);
    console.log(`[DyadicChat] Room ${roomId} surveys after update:`, room.surveys);
    
    // Check if both users have completed study and submitted surveys
    const [a,b] = room.users;
    if (room.finished[a.id] && room.finished[b.id] && 
        room.surveys[a.id] && room.surveys[b.id]) {
      // Both users completed study and submitted surveys
      try { markItemCompleted(room.item.id || room.item.image_url || String(room.item)); } catch {}
      persistRoom(room);
      rooms.delete(room.id);
      console.log(`[DyadicChat] Both users completed study and surveys, cleaned up room ${roomId}`);
    } else {
      console.log(`[DyadicChat] Waiting for both users to complete study and surveys before cleaning up room ${roomId}`);
    }
    
    // Send acknowledgment back to client
    if (callback) {
      callback({ success: true, message: 'Survey data received' });
    }
  });

  // Heartbeat mechanism to detect actual disconnections
  socket.on('ping', () => {
    socket.emit('pong');
  });

  function tryPair(){
    console.log(`[DyadicChat] tryPair called, queue length: ${queue.length}`);
    if (queue.length >= 2){
      const a = queue.shift();
      const b = queue.shift();
      console.log(`[DyadicChat] Attempting to pair ${a.id} (PID: ${a.prolific?.PID}) with ${b.id} (PID: ${b.prolific?.PID})`);
      
      if (REQUIRE_DISTINCT_PID && a?.prolific?.PID === b?.prolific?.PID) { 
        console.log(`[DyadicChat] Same PID detected, re-queuing users`);
        queue.unshift(a); 
        queue.push(b); 
        return; 
      }
      
      const roomId = 'r_' + Date.now() + '_' + Math.floor(Math.random()*9999);
      console.log(`[DyadicChat] Creating room ${roomId} for users ${a.id} and ${b.id}`);
      
      a.join(roomId); b.join(roomId);
      a.currentRoom = roomId; b.currentRoom = roomId;

      const item = nextItem();
      try { markPidSeen(a.prolific.PID); markPidSeen(b.prolific.PID); } catch {}

      const room = {
        id: roomId, users:[a,b], item,
        messages:[], answers:{}, finished:{}, surveys:{},
        msgCount:0, chatClosed:false, minTurns: MAX_TURNS,
        nextSenderId:null, pairedAt: Date.now(),
        userRoles: {
          [a.id]: 'user_1',  // First user (starts conversation)
          [b.id]: 'user_2'   // Second user
        }
      };
      rooms.set(roomId, room);

      console.log(`[DyadicChat] Sending paired event to ${a.id} and ${b.id}`);
      io.to(a.id).emit('paired', { roomId, item: { ...item, image_url: item.user_1_image, goal_question: item.user_1_question, question_type: item.question_type, correct_answer: item.user_1_gt_answer, options: item.options }, min_turns: MAX_TURNS });
      io.to(b.id).emit('paired', { roomId, item: { ...item, image_url: item.user_2_image, goal_question: item.user_2_question, question_type: item.question_type, correct_answer: item.user_2_gt_answer, options: item.options }, min_turns: MAX_TURNS });
      // User 1 (first user in queue) always starts the conversation
      room.nextSenderId = a.id;
      io.to(a.id).emit('turn:you');
      io.to(b.id).emit('turn:wait');
      console.log(`[DyadicChat] Pairing complete, ${a.id} (user_1) starts first`);
    } else {
      console.log(`[DyadicChat] Not enough users in queue (${queue.length}), waiting for more`);
    }
  }
});

function persistRoom(room){
  try {
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    const line = JSON.stringify({
      id: room.id, item: room.item.id || room.item.image_url,
      minTurns: room.minTurns, messages: room.messages,
      answers: room.answers, surveys: room.surveys, 
      pairedAt: room.pairedAt, closed: room.chatClosed,
      userRoles: room.userRoles
    }) + "\n";
    fs.appendFileSync(path.join(dir, 'transcripts.ndjson'), line);
    console.log('[DyadicChat] Saved transcript', room.id);
  } catch(e){}
}

server.listen(PORT, () => console.log('[DyadicChat] Listening on http://localhost:' + PORT));
