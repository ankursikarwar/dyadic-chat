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
const STOP_WHEN_DECK_COMPLETE = String(process.env.STOP_WHEN_DECK_COMPLETE || 'true').toLowerCase() !== 'false';

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

  queue.push(socket);
  tryPair();

  socket.on('disconnect', () => {
const qi = queue.indexOf(socket);
    if (qi >= 0) queue.splice(qi, 1);
    const roomId = socket.currentRoom;
    if (roomId && rooms.has(roomId)){
      const room = rooms.get(roomId);
      room.finished[socket.id] = true;
      const [u1, u2] = room.users;
      if (room.finished[u1.id] && room.finished[u2.id]){
        persistRoom(room);
        rooms.delete(roomId);
      }
    }
  
    // Notify partner & end their session when one user disconnects
    
    if (roomId && rooms.has(roomId)){
      const room = rooms.get(roomId);
      const other = room.users.find(u => u.id !== socket.id);
      if (other){ try { io.to(other.id).emit('end:partner'); } catch(e){} }
      // mark finished & cleanup if both ended
      room.finished[socket.id] = true;
      const [u1,u2] = room.users;
      if (room.finished[u1.id] && room.finished[u2.id]){ try { persistRoom(room); } catch(e){} rooms.delete(roomId); }
    }
  });

  socket.on('chat:message', (msg={}) => {
    const roomId = socket.currentRoom;
    if (!roomId || !rooms.has(roomId)) return;
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
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    room.answers[socket.id] = { pid: socket.prolific.PID, choice: payload.choice, rt: payload.rt, t: Date.now() };
    room.finished[socket.id] = true;
    io.to(socket.id).emit('end:self');

    const [a,b] = room.users;
    if (room.finished[a.id] && room.finished[b.id]){
      try { markItemCompleted(room.item.id || room.item.image_url || String(room.item)); } catch {}
      persistRoom(room);
      rooms.delete(room.id);
    }
  });

  function tryPair(){
    if (queue.length >= 2){
      const a = queue.shift();
      const b = queue.shift();
            if (REQUIRE_DISTINCT_PID && a?.prolific?.PID === b?.prolific?.PID) { queue.unshift(a); queue.push(b); return; }
const roomId = 'r_' + Date.now() + '_' + Math.floor(Math.random()*9999);
      a.join(roomId); b.join(roomId);
      a.currentRoom = roomId; b.currentRoom = roomId;

      const item = nextItem();
      try { markPidSeen(a.prolific.PID); markPidSeen(b.prolific.PID); } catch {}

      const room = {
        id: roomId, users:[a,b], item,
        messages:[], answers:{}, finished:{},
        msgCount:0, chatClosed:false, minTurns: MAX_TURNS,
        nextSenderId:null, pairedAt: Date.now()
      };
      rooms.set(roomId, room);

      io.to(a.id).emit('paired', { roomId, item: { ...item, image_url: item.user_1_image, goal_question: item.user_1_question, question_type: item.question_type }, min_turns: MAX_TURNS });
    io.to(b.id).emit('paired', { roomId, item: { ...item, image_url: item.user_2_image, goal_question: item.user_2_question, question_type: item.question_type }, min_turns: MAX_TURNS });
      const starter = Math.random() < 0.5 ? a : b;
      room.nextSenderId = starter.id;
      io.to(starter.id).emit('turn:you');
      io.to((starter.id===a.id)?b.id:a.id).emit('turn:wait');
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
      answers: room.answers, pairedAt: room.pairedAt, closed: room.chatClosed
    }) + "\n";
    fs.appendFileSync(path.join(dir, 'transcripts.ndjson'), line);
    console.log('[DyadicChat] Saved transcript', room.id);
  } catch(e){}
}

server.listen(PORT, () => console.log('[DyadicChat] Listening on http://localhost:' + PORT));
