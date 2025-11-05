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
const REQUIRE_DISTINCT_PID = process.env.REQUIRE_DISTINCT_PID !== '1';
// const BLOCK_REPEAT_PID = String(process.env.BLOCK_REPEAT_PID || 'false').toLowerCase() === 'true';
// const STOP_WHEN_DECK_COMPLETE = String(process.env.STOP_WHEN_DECK_COMPLETE || 'false').toLowerCase() !== 'false';
const BLOCK_REPEAT_PID = true;
const STOP_WHEN_DECK_COMPLETE = true;
const QUESTION_TYPE = process.env.QUESTION_TYPE || 'counting';

// ---------- Questions per category configuration ----------
// Dictionary specifying number of questions per category
// Can be overridden via environment variable QUESTIONS_PER_CATEGORY (JSON string)
const QUESTIONS_PER_CATEGORY_DEFAULT = {
  'counting': 3,
  'spatial': 3,
  'anchor': 3,
  'relative_distance': 3,
  'perspective_taking': 3
};
let QUESTIONS_PER_CATEGORY = QUESTIONS_PER_CATEGORY_DEFAULT;
try {
  if (process.env.QUESTIONS_PER_CATEGORY) {
    QUESTIONS_PER_CATEGORY = JSON.parse(process.env.QUESTIONS_PER_CATEGORY);
    console.log('[DyadicChat] Loaded questions per category from environment:', QUESTIONS_PER_CATEGORY);
  } else {
    console.log('[DyadicChat] Using default questions per category:', QUESTIONS_PER_CATEGORY);
  }
} catch (e) {
  console.warn('[DyadicChat] Failed to parse QUESTIONS_PER_CATEGORY, using defaults:', e.message);
}

app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: false, lastModified: false }));
app.get('/', (_req, res) => {
  res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.set('Pragma','no-cache');
  res.set('Expires','0');
  res.set('ETag', Date.now().toString()); // Force unique ETag on every request
  res.set('Last-Modified', new Date().toUTCString()); // Force new timestamp
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/api/config', (_req, res) => {
  res.json({ questionType: QUESTION_TYPE, maxTurns: MAX_TURNS });
});

// ---------- Load items based on question type ----------
let items = [];
try {
  // Choose JSON file based on QUESTION_TYPE environment variable
  let jsonFile = 'items.json'; // Default
  switch (QUESTION_TYPE) {
    case 'counting':
      jsonFile = 'sampled_counting.json';
      break;
    case 'anchor':
      jsonFile = 'sampled_anchor_v2.json';
      break;
    case 'relative_distance':
      jsonFile = 'sampled_relative_distance.json';
      break;
    case 'spatial':
      jsonFile = 'sampled_spatial.json';
      break;
    case 'perspective_taking':
      jsonFile = 'sampled_perspective.json';
      break;
    default:
      jsonFile = 'items.json'; // Default for 'all_types' or unknown
  }

  const p = path.join(__dirname, 'data', jsonFile);
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

  // Handle both old format (array) and new format (object with samples array)
  if (Array.isArray(data)) {
    items = data;
  } else if (data.samples && Array.isArray(data.samples)) {
    items = data.samples;
  } else {
    throw new Error('Invalid data format: expected array or object with samples array');
  }

  console.log(`[DyadicChat] Loaded ${items.length} items from ${jsonFile} for question_type: ${QUESTION_TYPE}`);
} catch (e) {
  console.error(`[DyadicChat] Failed to load ${jsonFile}:`, e.message);
  console.error(`[DyadicChat] Server cannot start without data. Exiting...`);
  process.exit(1);
}

// ---------- Persistent deck (no repeats until cycle completes) ----------
// Use separate deck state file for each question type to avoid conflicts
function getDeckStatePath() {
  // For 'all_types', use default file. Otherwise, use type-specific file
  if (QUESTION_TYPE === 'all_types' || !QUESTION_TYPE) {
    return path.join(__dirname, 'data', 'deck_state.json');
  }
  return path.join(__dirname, 'data', `deck_state_${QUESTION_TYPE}.json`);
}
const statePath = getDeckStatePath();
console.log(`[DyadicChat] Using deck state file: ${statePath}`);
let deck = []; let deckIdx = 0;
let markedItems = new Set(); // Track items that have been marked in the current deck cycle

function saveDeck(){
  try {
    fs.writeFileSync(statePath, JSON.stringify({
      order: deck,
      idx: deckIdx,
      marked: Array.from(markedItems)
    }));
  } catch(e){}
}
function loadDeck(){
  try {
    const s = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    const valid = new Set(items.map(x => {
      const id = x.id || x.sample_id || String(x);
      return id && String(id); // Ensure valid ID
    }).filter(id => id)); // Remove nulls

    // Filter out null/undefined values from saved deck
    deck = (s.order || []).filter(id => id && valid.has(id));
    deckIdx = Math.min(Math.max(0, s.idx|0), deck.length);

    // Filter out null/undefined values from marked items
    markedItems = new Set((s.marked || []).filter(id => id && valid.has(id)));

    console.log(`[DyadicChat] Loaded deck: ${deck.length} items in deck, ${markedItems.size} marked`);
  } catch (e) {
    console.log(`[DyadicChat] No existing deck state (or error loading): ${e.message}`);
    deck = [];
    deckIdx = 0;
    markedItems = new Set();
  }
}
function reshuffleDeck(){
  // Only include items that haven't been marked
  const unmarkedItems = items.filter(x => {
    const itemId = x.id || x.sample_id || String(x);
    // Only include items with valid IDs (not null/undefined)
    return itemId && !markedItems.has(itemId);
  });

  if (unmarkedItems.length === 0) {
    // All items have been marked, reset and start fresh
    markedItems.clear();
    deck = items
      .map(x => x.id || x.sample_id || String(x))
      .filter(id => id) // Filter out null/undefined
      .sort(()=>Math.random()-0.5);
  } else {
    deck = unmarkedItems
      .map(x => x.id || x.sample_id || String(x))
      .filter(id => id) // Filter out null/undefined
      .sort(()=>Math.random()-0.5);
  }
  deckIdx = 0;
  saveDeck();
}

function markItemInDeck(itemId) {
  if (!itemId) {
    console.warn(`[DyadicChat] Attempted to mark null/undefined item ID`);
    return;
  }
  // Ensure itemId is a string and not null
  const idStr = String(itemId);
  if (idStr === 'null' || idStr === 'undefined' || !idStr || idStr.trim() === '') {
    console.warn(`[DyadicChat] Attempted to mark invalid item ID: ${itemId}`);
    return;
  }
  markedItems.add(idStr);
  saveDeck();
  console.log(`[DyadicChat] Marked item ${idStr} in deck state (${markedItems.size} total marked)`);
}

function nextItem(){
  if (!deck.length) reshuffleDeck();
  if (deckIdx >= deck.length) reshuffleDeck();
  const id = deck[deckIdx++];
  saveDeck();
  return items.find(x => (x.id || x.sample_id || String(x)) === id) || items[0];
}

// ---------- Multi-question support: sample questions by category ----------
// For a given category, sample N questions from available items of that type
function sampleQuestionsByCategory(category, count, excludeIds = new Set()) {
  const categoryItems = items.filter(item => {
    const itemType = item.question_type || 'unknown';
    const itemId = item.id || item.sample_id || String(item);
    // Exclude items that are already marked in deck state OR in excludeIds
    return itemType === category &&
           !excludeIds.has(itemId) &&
           !markedItems.has(itemId);
  });

  if (categoryItems.length === 0) {
    console.warn(`[DyadicChat] No unmarked items found for category: ${category}`);
    return [];
  }

  // Shuffle and take first N (do NOT mark yet; marking happens after surveys)
  // Use Fisher-Yates shuffle for better randomness
  const shuffled = [...categoryItems];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Take first N items, ensuring no duplicates by ID
  const selected = [];
  const selectedIds = new Set();
  for (const item of shuffled) {
    if (selected.length >= count) break;
    const itemId = item.id || item.sample_id || String(item);
    // Double-check: ensure this item isn't already selected (shouldn't happen, but safety check)
    if (!selectedIds.has(itemId) && !excludeIds.has(itemId)) {
      selectedIds.add(itemId);
      selected.push(item);
    }
  }

  if (selected.length < count) {
    console.warn(`[DyadicChat] Only found ${selected.length} unique items for category ${category}, requested ${count}`);
  }

  return selected;
}

// Generate question sequence for a room based on QUESTIONS_PER_CATEGORY
function generateQuestionSequence() {
  const sequence = [];
  const usedItemIds = new Set();

  console.log(`[DyadicChat] Generating question sequence for QUESTION_TYPE=${QUESTION_TYPE}, markedItems.size=${markedItems.size}`);

  // If QUESTION_TYPE is a specific type (not 'all_types'), only use that type
  if (QUESTION_TYPE !== 'all_types' && QUESTIONS_PER_CATEGORY[QUESTION_TYPE]) {
    const count = QUESTIONS_PER_CATEGORY[QUESTION_TYPE];
    const categoryQuestions = sampleQuestionsByCategory(QUESTION_TYPE, count, usedItemIds);
    console.log(`[DyadicChat] Selected ${categoryQuestions.length} questions for category ${QUESTION_TYPE}`);
    categoryQuestions.forEach(item => {
      const itemId = item.id || item.sample_id || String(item);
      // Explicit check: ensure no duplicates within the sequence
      if (usedItemIds.has(itemId)) {
        console.error(`[DyadicChat] ERROR: Duplicate item ID ${itemId} detected in sequence! Skipping.`);
        return; // Skip this item
      }
      usedItemIds.add(itemId);
      sequence.push({ item, category: QUESTION_TYPE });
    });
  } else if (QUESTION_TYPE === 'all_types') {
    // Sample questions from multiple categories
    for (const [category, count] of Object.entries(QUESTIONS_PER_CATEGORY)) {
      const categoryQuestions = sampleQuestionsByCategory(category, count, usedItemIds);
      console.log(`[DyadicChat] Selected ${categoryQuestions.length} questions for category ${category}`);
      categoryQuestions.forEach(item => {
        const itemId = item.id || item.sample_id || String(item);
        // Explicit check: ensure no duplicates within the sequence
        if (usedItemIds.has(itemId)) {
          console.error(`[DyadicChat] ERROR: Duplicate item ID ${itemId} detected in sequence! Skipping.`);
          return; // Skip this item
        }
        usedItemIds.add(itemId);
        sequence.push({ item, category });
      });
    }

    // Shuffle the sequence to randomize order across categories
    // Use Fisher-Yates shuffle for better randomness
    for (let i = sequence.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
    }
  }

  // Final validation: check for duplicates in the final sequence
  const finalIds = new Set();
  const duplicates = [];
  sequence.forEach((q, idx) => {
    const itemId = q.item.id || q.item.sample_id || String(q.item);
    if (finalIds.has(itemId)) {
      duplicates.push({ index: idx, id: itemId });
    } else {
      finalIds.add(itemId);
    }
  });

  if (duplicates.length > 0) {
    console.error(`[DyadicChat] ERROR: Found ${duplicates.length} duplicate items in final sequence:`, duplicates);
    // Remove duplicates, keeping only the first occurrence
    const seen = new Set();
    const uniqueSequence = [];
    sequence.forEach(q => {
      const itemId = q.item.id || q.item.sample_id || String(q.item);
      if (!seen.has(itemId)) {
        seen.add(itemId);
        uniqueSequence.push(q);
      }
    });
    console.warn(`[DyadicChat] Removed duplicates, sequence length changed from ${sequence.length} to ${uniqueSequence.length}`);
    sequence.length = 0;
    sequence.push(...uniqueSequence);
  }

  console.log(`[DyadicChat] Generated question sequence with ${sequence.length} unique questions. NO items marked yet - marking happens after surveys`);
  // Log all item IDs in sequence for debugging
  const sequenceIds = sequence.map(q => q.item.id || q.item.sample_id || String(q.item));
  console.log(`[DyadicChat] Sequence item IDs: ${sequenceIds.join(', ')}`);
  return sequence;
}

loadDeck();
// Only reshuffle if deck is empty; preserve existing deck state otherwise
if (deck.length === 0) reshuffleDeck();

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
// Helper function to extract a valid string ID from an item
function extractItemId(item) {
  if (!item) return null;
  // If it's already a string, return it
  if (typeof item === 'string') return item;
  // If it's an object, try to get id, sample_id, or convert to string safely
  if (typeof item === 'object') {
    return item.id || item.sample_id || null;
  }
  return null;
}

function markItemCompleted(id){
  if (!id) return;
  // Ensure we always store a string, not an object
  const itemId = extractItemId(id);
  if (!itemId) {
    console.warn(`[DyadicChat] Could not extract valid ID from: ${id}`);
    return;
  }
  const idStr = String(itemId); // Ensure it's a string
  if (!completedItems.has(idStr)){
    completedItems.add(idStr);
    saveJsonAtomic(completedPath, { completed: Array.from(completedItems).sort() });
  }
}

// Utility functions for human-readable time formatting
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return {
    iso: date.toISOString(),
    readable: date.toLocaleString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }),
    unix: timestamp
  };
}

function formatReactionTime(rtMs) {
  const seconds = Math.floor(rtMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const remainingMs = rtMs % 1000;

  return {
    milliseconds: rtMs,
    seconds: (rtMs / 1000).toFixed(2),
    human: minutes > 0 ?
      `${minutes}m ${remainingSeconds}s` :
      `${remainingSeconds}.${remainingMs.toString().padStart(3, '0')}s`
  };
}

// ---------- Pairing ----------
const queue = [];
const rooms = new Map();

// Track server state to disconnect existing users on any failure
let serverStarting = true;

// Disconnect all existing users when server starts (after any failure/restart)
io.on('connection', (socket) => {
  if (serverStarting) {
    // Send failure message and disconnect
    io.to(socket.id).emit('connection_lost');
    setTimeout(() => socket.disconnect(true), 100);
    return;
  }
});

// Mark server as fully started after a brief delay
setTimeout(() => {
  serverStarting = false;
  console.log('[DyadicChat] Server fully started - accepting new connections');
}, 2000);

// Handle server shutdown/failure gracefully
process.on('SIGINT', () => {
  console.log('[DyadicChat] Server shutting down...');
  // Notify all connected users before shutdown
  io.emit('connection_lost');
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log('[DyadicChat] Server terminated...');
  // Notify all connected users before shutdown
  io.emit('connection_lost');
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[DyadicChat] Uncaught exception:', error);
  // Notify all connected users before crash
  io.emit('connection_lost');
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[DyadicChat] Unhandled rejection at:', promise, 'reason:', reason);
  // Notify all connected users before crash
  io.emit('connection_lost');
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

io.on('connection', (socket) => {
  const pid = (socket.handshake.query && String(socket.handshake.query.pid||'').trim()) || 'DEBUG_LOCAL';
  socket.prolific = { PID: pid };

  if (STOP_WHEN_DECK_COMPLETE){
    const totalItems = items.length;
    // Check markedItems (type-specific deck state) instead of completedItems (global across all types)
    if (totalItems > 0 && markedItems.size >= totalItems){
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
      // 2. Partner is finished AND has submitted survey
      if (!other || (room.finished[other.id] && room.surveys[other.id])) {
        try {
          persistRoom(room);
          rooms.delete(roomId);
          console.log(`[DyadicChat] Cleaned up room ${roomId} - partner finished and submitted survey or no partner`);
        } catch(e) {
          console.error('[DyadicChat] Error cleaning up room:', e);
        }
      } else {
        console.log(`[DyadicChat] Room ${roomId} kept active - partner can still complete study and survey`);
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
    const now = Date.now();
    const rec = {
      who: socket.id,
      pid: socket.prolific.PID,
      text,
      t: now,
      t_formatted: formatTimestamp(now)
    };
    room.messages.push(rec);

    room.msgCount = (room.msgCount || 0) + 1;
    const completedTurns = Math.floor(room.msgCount / 2);
    if (completedTurns >= room.minTurns){
      room.chatClosed = true;
      io.to(roomId).emit('chat:closed');

      // Mark users without questions as finished automatically
      const [a, b] = room.users;
      const item = room.item;

      // Check if user 1 has no question
      if (item && (!item.user_1_question || item.user_1_question.trim() === '')) {
        if (!room.finished[a.id]) {
          room.finished[a.id] = true;
          console.log(`[DyadicChat] Auto-marked user ${a.id} as finished (no question)`);
        }
      }

      // Check if user 2 has no question
      if (item && (!item.user_2_question || item.user_2_question.trim() === '')) {
        if (!room.finished[b.id]) {
          room.finished[b.id] = true;
          console.log(`[DyadicChat] Auto-marked user ${b.id} as finished (no question)`);
        }
      }
    }

    const other = room.users.find(u => u.id !== socket.id);
    room.nextSenderId = other ? other.id : null;
    if (other){
      io.to(other.id).emit('chat:message', { text, serverTs: rec.t });
      io.to(other.id).emit('turn:you');
    }
    io.to(socket.id).emit('turn:wait');
  });

  socket.on('chat:early_termination', () => {
    const roomId = socket.currentRoom;
    if (!roomId || !rooms.has(roomId)) {
      console.log(`[DyadicChat] User ${socket.id} tried to terminate chat in non-existent room ${roomId}`);
      return;
    }

    const room = rooms.get(roomId);
    console.log(`[DyadicChat] User ${socket.id} terminated chat early in room ${roomId}`);

    // Close the chat for all users in the room
    room.chatClosed = true;

    // Notify all users in the room that chat ended early
    io.to(roomId).emit('chat:early_termination');

    // Mark users without questions as finished automatically
    const [a, b] = room.users;
    const item = room.item;

    // Check if user 1 has no question
    if (item && (!item.user_1_question || item.user_1_question.trim() === '')) {
      if (!room.finished[a.id]) {
        room.finished[a.id] = true;
        console.log(`[DyadicChat] Auto-marked user ${a.id} as finished (no question) after early termination`);
      }
    }

    // Check if user 2 has no question
    if (item && (!item.user_2_question || item.user_2_question.trim() === '')) {
      if (!room.finished[b.id]) {
        room.finished[b.id] = true;
        console.log(`[DyadicChat] Auto-marked user ${b.id} as finished (no question) after early termination`);
      }
    }
  });

  // Typing indicator handlers
  socket.on('typing:start', () => {
    const roomId = socket.currentRoom;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }
    const room = rooms.get(roomId);
    if (room.chatClosed) return;

    const other = room.users.find(u => u.id !== socket.id);
    if (other) {
      io.to(other.id).emit('typing:start');
    }
  });

  socket.on('typing:stop', () => {
    const roomId = socket.currentRoom;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }
    const room = rooms.get(roomId);
    if (room.chatClosed) return;

    const other = room.users.find(u => u.id !== socket.id);
    if (other) {
      io.to(other.id).emit('typing:stop');
    }
  });

  // Helper function to transition to next question or survey
  function moveToNextQuestionOrSurvey(room) {
    // Get current users BEFORE any updates
    const currentUsers = [...room.users];
    const [a, b] = currentUsers;

    // Check if both users have finished this question AND have submitted answers
    const hasAnswerA = !!room.answers[a.id];
    const hasAnswerB = !!room.answers[b.id];

    if (!room.finished[a.id] || !room.finished[b.id] || !hasAnswerA || !hasAnswerB) {
      console.log(`[DyadicChat] Not all users finished with answers: a=${a.id} finished=${!!room.finished[a.id]} hasAnswer=${hasAnswerA}, b=${b.id} finished=${!!room.finished[b.id]} hasAnswer=${hasAnswerB}`);
      return; // Wait for both users to submit answers
    }

    // Store current question's answers
    room.questionAnswers.push({
      questionIndex: room.currentQuestionIndex,
      item: room.item,
      answers: { ...room.answers },
      messages: [...room.messages]
    });

    // DO NOT mark items here - marking happens only after both surveys are submitted
    // (This was causing premature marking when moving between questions)

    // Check if there are more questions
    const nextIndex = room.currentQuestionIndex + 1;
    if (nextIndex < room.questionSequence.length) {
      // Move to next question
      console.log(`[DyadicChat] Moving to next question ${nextIndex + 1}/${room.questionSequence.length} in room ${room.id}`);

      const nextQuestion = room.questionSequence[nextIndex];
      room.item = nextQuestion.item;
      room.currentQuestionIndex = nextIndex;

      // Reset question-specific state
      room.messages = [];
      room.answers = {};
      room.finished = {};
      room.msgCount = 0;
      room.chatClosed = false;

      // Determine who should start for this question
      // IMPORTANT: Keep the same answerer as the first question for consistency across questions
      // The answerer is determined once in the first question and stays the same for all questions
      const originalUsers = room.originalUsers || room.users;
      const [origUser1, origUser2] = originalUsers;

      // Find who was the answerer in the first question (stored in originalUsers order and physicalUserToItemUser)
      // The answerer is the one who had the question in the first question, which we can determine
      // by looking at room.users[0] which should be the answerer from the first question
      // Actually, we need to track this more explicitly. Let's use the first question's item to determine
      // which physical user should always be the answerer.

      // For now, we'll use a simple approach: find which item field has the question and map accordingly
      // But we want the SAME physical person to always be the answerer
      const item = room.item;
      const user1HasQuestion = !!(item.user_1_question && item.user_1_question.trim() !== '');
      const user2HasQuestion = !!(item.user_2_question && item.user_2_question.trim() !== '');

      // Get the answerer from the first question - this is room.users[0] from when the room was created
      // But room.users might have been updated. Let's use the originalUsers and determine who was answerer
      // by checking the first question's item
      const firstQuestionItem = room.questionSequence[0].item;
      const firstUser1HasQuestion = !!(firstQuestionItem.user_1_question && firstQuestionItem.user_1_question.trim() !== '');
      const firstUser2HasQuestion = !!(firstQuestionItem.user_2_question && firstQuestionItem.user_2_question.trim() !== '');

      // Determine who was the answerer in the first question
      let originalAnswerer, originalHelper;
      if (firstUser1HasQuestion) {
        // First question had user_1_question, so origUser1 (mapped to item user_1) was answerer
        originalAnswerer = origUser1;
        originalHelper = origUser2;
      } else if (firstUser2HasQuestion) {
        // First question had user_2_question, so origUser2 (mapped to item user_2) was answerer
        originalAnswerer = origUser2;
        originalHelper = origUser1;
      } else {
        // Fallback: first user in queue
        originalAnswerer = origUser1;
        originalHelper = origUser2;
      }

      // Keep the same answerer for all questions
      const userWithQuestion = originalAnswerer;
      const userWithoutQuestion = originalHelper;

      console.log(`[DyadicChat] Question ${nextIndex + 1}: user_1_has_q=${user1HasQuestion}, user_2_has_q=${user2HasQuestion}`);
      console.log(`[DyadicChat] Keeping same answerer: ${userWithQuestion.id} (was answerer in first question), helper: ${userWithoutQuestion.id}`);

      // Send next question data to both users
      // IMPORTANT: Use the CURRENT question's fields, not the answerer's mapped role
      // The answerer always gets the question from whichever field has it in the current item
      // The helper always gets the other field's data (image, goal, etc.)

      // Determine which field has the question in the current item
      let questionField, helperField;
      if (user1HasQuestion) {
        questionField = 'user_1';
        helperField = 'user_2';
      } else if (user2HasQuestion) {
        questionField = 'user_2';
        helperField = 'user_1';
      } else {
        // Neither has question - use default
        questionField = 'user_1';
        helperField = 'user_2';
      }

      // Determine which physical user's item role corresponds to the question field
      // This is just for getting the right image/goal - the question itself comes from the current item
      const answererItemRole = room.physicalUserToItemUser[userWithQuestion.id];
      const helperItemRole = room.physicalUserToItemUser[userWithoutQuestion.id];

      const itemForQuestionUser = {
        ...item,
        image_url: answererItemRole === 'user_1' ? item.user_1_image : item.user_2_image,
        goal_question: questionField === 'user_1' ? item.user_1_question : item.user_2_question,
        correct_answer: questionField === 'user_1' ? (item.user_1_gt_answer_idx ?? item.user_1_gt_answer ?? null) : (item.user_2_gt_answer_idx ?? item.user_2_gt_answer ?? null),
        options: questionField === 'user_1' ? (item.options_user_1 || item.options) : (item.options_user_2 || item.options),
        has_question: true,
        has_options: !!(questionField === 'user_1' ? (item.options_user_1 && item.options_user_1.length > 0) : (item.options_user_2 && item.options_user_2.length > 0))
      };

      const itemForHelperUser = {
        ...item,
        image_url: helperItemRole === 'user_1' ? item.user_1_image : item.user_2_image,
        goal_question: helperField === 'user_1' ? item.user_1_question : item.user_2_question,
        correct_answer: helperField === 'user_1' ? (item.user_1_gt_answer_idx ?? item.user_1_gt_answer ?? null) : (item.user_2_gt_answer_idx ?? item.user_2_gt_answer ?? null),
        options: helperField === 'user_1' ? (item.options_user_1 || item.options) : (item.options_user_2 || item.options),
        has_question: false,
        has_options: false
      };

      // Update user roles if needed (they may switch roles between questions)
      room.userRoles[userWithQuestion.id] = 'user_1';
      room.userRoles[userWithoutQuestion.id] = 'user_2';

      // Update room.users to match new question assignment
      room.users = [userWithQuestion, userWithoutQuestion];

      // Add a brief delay before sending next question to avoid jarring transition
      setTimeout(() => {
        console.log(`[DyadicChat] Sending next_question events to room ${room.id} for question ${nextIndex + 1}`);
        console.log(`[DyadicChat] User with question: ${userWithQuestion.id}, User without question: ${userWithoutQuestion.id}`);

        // Verify sockets are still connected
        const socketWithQ = io.sockets.sockets.get(userWithQuestion.id);
        const socketWithoutQ = io.sockets.sockets.get(userWithoutQuestion.id);

        if (!socketWithQ) {
          console.error(`[DyadicChat] ERROR: Socket ${userWithQuestion.id} not found! Cannot send next_question.`);
        }
        if (!socketWithoutQ) {
          console.error(`[DyadicChat] ERROR: Socket ${userWithoutQuestion.id} not found! Cannot send next_question.`);
        }

        // Send next question event
        io.to(userWithQuestion.id).emit('next_question', {
          item: itemForQuestionUser,
          min_turns: MAX_TURNS,
          server_question_type: QUESTION_TYPE,
          questionNumber: nextIndex + 1,
          totalQuestions: room.questionSequence.length
        });
        io.to(userWithoutQuestion.id).emit('next_question', {
          item: itemForHelperUser,
          min_turns: MAX_TURNS,
          server_question_type: QUESTION_TYPE,
          questionNumber: nextIndex + 1,
          totalQuestions: room.questionSequence.length
        });

        // Set who starts
        room.nextSenderId = userWithQuestion.id;

        // Send turn events immediately after next_question (client will handle timing)
        // Use a small delay to ensure next_question is processed first
        setTimeout(() => {
          console.log(`[DyadicChat] Sending turn events - ${userWithQuestion.id} gets turn:you, ${userWithoutQuestion.id} gets turn:wait`);
          io.to(userWithQuestion.id).emit('turn:you');
          io.to(userWithoutQuestion.id).emit('turn:wait');
          console.log(`[DyadicChat] Turn events sent for question ${nextIndex + 1}`);
        }, 100); // Small delay to ensure next_question is processed first
      }, 1500); // 1.5 second delay for smoother transition

    } else {
      // All questions completed - proceed to survey
      // IMPORTANT: For the final question, ensure both users have actually submitted their answers
      // before moving to survey. Add a delay to ensure answerer has time to submit.
      console.log(`[DyadicChat] All questions completed in room ${room.id}, users should proceed to survey`);

      // Double-check that both users have actually submitted answers for the final question
      const [finalA, finalB] = room.users;
      const hasAnswerA = !!room.answers[finalA.id];
      const hasAnswerB = !!room.answers[finalB.id];

      if (!hasAnswerA || !hasAnswerB) {
        console.log(`[DyadicChat] Warning: Final question but answers missing - A: ${hasAnswerA}, B: ${hasAnswerB}. Waiting...`);
        // Wait a bit more for the answerer to submit
        // This shouldn't happen normally, but protects against race conditions
        setTimeout(() => {
          const [checkA, checkB] = room.users;
          const checkAnswerA = !!room.answers[checkA.id];
          const checkAnswerB = !!room.answers[checkB.id];
          if (checkAnswerA && checkAnswerB) {
            console.log(`[DyadicChat] Both answers now present, proceeding to survey`);
            io.to(room.id).emit('all_questions_complete');
          } else {
            console.warn(`[DyadicChat] Still missing answers after delay - A: ${checkAnswerA}, B: ${checkAnswerB}. Proceeding anyway.`);
            io.to(room.id).emit('all_questions_complete');
          }
        }, 2000); // 2 second grace period for answerer to submit
      } else {
        // Both have submitted - proceed immediately
        io.to(room.id).emit('all_questions_complete');
      }
    }
  }

  socket.on('answer:submit', (payload={}) => {
    const roomId = socket.currentRoom;
    if (!roomId || !rooms.has(roomId)) {
      // Room no longer exists, ignore the submission
      console.log(`[DyadicChat] User ${socket.id} tried to submit answer to non-existent room ${roomId}`);
      return;
    }
    const room = rooms.get(roomId);
    const now = Date.now();
    room.answers[socket.id] = {
      pid: socket.prolific.PID,
      choice: payload.choice,
      rt: payload.rt,
      rt_formatted: formatReactionTime(payload.rt),
      t: now,
      t_formatted: formatTimestamp(now)
    };
    room.finished[socket.id] = true;

    // Handle backward compatibility: if no question sequence, use old behavior
    if (!room.questionSequence || room.questionSequence.length === 0) {
      console.log(`[DyadicChat] Room ${roomId} has no question sequence, using single-question mode`);
      const [a,b] = room.users;
      if (room.finished[a.id] && room.finished[b.id]){
        // Both finished - proceed to survey (old behavior)
        io.to(roomId).emit('all_questions_complete');
      }
      return;
    }

    console.log(`[DyadicChat] User ${socket.id} submitted answer for question ${room.currentQuestionIndex + 1}/${room.questionSequence.length}`);

    // Check if both users have finished this question AND have submitted answers
    // Use the current room.users to check both users' finished state
    const [currentA, currentB] = room.users;
    const hasAnswerA = !!room.answers[currentA.id];
    const hasAnswerB = !!room.answers[currentB.id];

    if (room.finished[currentA.id] && room.finished[currentB.id] && hasAnswerA && hasAnswerB){
      console.log(`[DyadicChat] Both users finished question ${room.currentQuestionIndex + 1} with answers, moving to next`);
      // Check if there are more questions
      moveToNextQuestionOrSurvey(room);
    } else {
      console.log(`[DyadicChat] User ${socket.id} completed question, waiting for partner (a=${currentA.id} finished=${!!room.finished[currentA.id]} hasAnswer=${hasAnswerA}, b=${currentB.id} finished=${!!room.finished[currentB.id]} hasAnswer=${hasAnswerB})`);
    }
  });

  socket.on('survey:submit', (payload={}, callback) => {
    console.log(`[DyadicChat] Received survey submission from ${socket.id}:`, payload);
    console.log(`[DyadicChat] Timing data received:`, payload.timingData);
    const roomId = socket.currentRoom;
    if (!roomId || !rooms.has(roomId)) {
      console.log(`[DyadicChat] User ${socket.id} tried to submit survey to non-existent room ${roomId} - saving survey data anyway`);

      // Even if room doesn't exist, try to save the survey data
      // This can happen if the room was cleaned up but user is still submitting survey
      const surveyData = {
        room_id: roomId,
        id: 'unknown',
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
        },
        userPids: {
          [socket.id]: socket.prolific.PID || 'unknown'
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
    const { survey, answerData, timingData } = payload;

    // Store survey data for this user
    const now = Date.now();
    room.surveys[socket.id] = {
      pid: socket.prolific.PID,
      survey: survey,
      answerData: {
        ...answerData,
        rt_formatted: formatReactionTime(answerData.rt)
      },
      timingData: timingData,
      submittedAt: now,
      submittedAt_formatted: formatTimestamp(now)
    };

    // Mark this user as finished when they submit the survey.
    // This prevents the disconnect handler from treating a subsequent
    // disconnect (e.g., closing the tab after survey submission)
    // as an unexpected early disconnect and notifying the partner.
    if (!room.finished[socket.id]) {
      room.finished[socket.id] = true;
      console.log(`[DyadicChat] Marked user ${socket.id} as finished on survey submission`);
    }

    console.log(`[DyadicChat] User ${socket.id} submitted survey data`);
    console.log(`[DyadicChat] Room ${roomId} surveys after update:`, room.surveys);

    // Check if both users have completed study and submitted surveys
    const [a,b] = room.users;
    if (room.finished[a.id] && room.finished[b.id] &&
        room.surveys[a.id] && room.surveys[b.id]) {
      // Both users completed all questions and submitted surveys
      // NOW mark all items in sequence as completed AND mark them in deck state
      console.log(`[DyadicChat] Both users completed surveys - marking ${room.questionSequence?.length || 0} items in deck state`);
      if (room.questionSequence && Array.isArray(room.questionSequence)) {
        room.questionSequence.forEach((q, idx) => {
          try {
            const itemId = extractItemId(q.item) || q.item.image_url;
            if (itemId) {
              console.log(`[DyadicChat] Marking item ${itemId} from question ${idx + 1} as completed and in deck`);
              markItemCompleted(itemId);
              markItemInDeck(itemId);
            } else {
              console.warn(`[DyadicChat] Could not extract ID for question ${idx + 1}`, q.item);
            }
          } catch (e) {
            console.warn(`[DyadicChat] Failed to mark question ${idx} completed:`, e);
          }
        });
      } else {
        // Fallback: mark current item
        try {
          const itemId = extractItemId(room.item) || room.item.image_url;
          if (itemId) {
            markItemCompleted(itemId);
            markItemInDeck(itemId);
          }
        } catch (e) {
          console.warn(`[DyadicChat] Failed to mark current item completed:`, e);
        }
      }

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
      const user1 = queue.shift();
      const user2 = queue.shift();
      console.log(`[DyadicChat] Attempting to pair ${user1.id} (PID: ${user1.prolific?.PID}) with ${user2.id} (PID: ${user2.prolific?.PID})`);

      if (REQUIRE_DISTINCT_PID && user1?.prolific?.PID === user2?.prolific?.PID) {
        console.log(`[DyadicChat] Same PID detected, re-queuing users`);
        queue.unshift(user1);
        queue.push(user2);
        return;
      }

      const roomId = 'r_' + Date.now() + '_' + Math.floor(Math.random()*9999);
      console.log(`[DyadicChat] Creating room ${roomId} for users ${user1.id} and ${user2.id}`);

      // Generate question sequence for this room
      const questionSequence = generateQuestionSequence();

      if (questionSequence.length === 0) {
        console.error(`[DyadicChat] No questions generated for room ${roomId}, using fallback`);
        // Fallback to old behavior
        const item = nextItem();
        const room = {
          id: roomId, users:[user1, user2], item,
          messages:[], answers:{}, finished:{}, surveys:{},
          msgCount:0, chatClosed:false, minTurns: MAX_TURNS,
          nextSenderId:null,
          questionSequence: [], currentQuestionIndex: 0,
          pairedAt: Date.now(),
          pairedAt_formatted: formatTimestamp(Date.now()),
          userRoles: { [user1.id]: 'user_1', [user2.id]: 'user_2' },
          userPids: { [user1.id]: user1.prolific.PID || 'unknown', [user2.id]: user2.prolific.PID || 'unknown' }
        };
        rooms.set(roomId, room);
        io.to(user1.id).emit('blocked:deck_complete');
        io.to(user2.id).emit('blocked:deck_complete');
        setTimeout(() => { user1.disconnect(true); user2.disconnect(true); }, 100);
        return;
      }

      // Start with first question
      const firstQuestion = questionSequence[0];
      const item = firstQuestion.item;
      try { markPidSeen(user1.prolific.PID); markPidSeen(user2.prolific.PID); } catch {}

      // Find which user should have the question and start
      const user1HasQuestion = !!(item.user_1_question && item.user_1_question.trim() !== '');
      const user2HasQuestion = !!(item.user_2_question && item.user_2_question.trim() !== '');

      console.log(`[DyadicChat] Item ${item.sample_id}: user1_question="${item.user_1_question}", user2_question="${item.user_2_question}"`);

      // Determine who has the question and should start
      let userWithQuestion, userWithoutQuestion;
      if (user1HasQuestion) {
        userWithQuestion = user1;
        userWithoutQuestion = user2;
        console.log(`[DyadicChat] User ${user1.id} (first in queue) has question - they start`);
      } else if (user2HasQuestion) {
        userWithQuestion = user2;
        userWithoutQuestion = user1;
        console.log(`[DyadicChat] User ${user2.id} (second in queue) has question - they start`);
      } else {
        // Neither has question - first in queue starts
        userWithQuestion = user1;
        userWithoutQuestion = user2;
        console.log(`[DyadicChat] Neither has question - ${user1.id} starts as first in queue`);
      }

      userWithQuestion.join(roomId); userWithoutQuestion.join(roomId);
      userWithQuestion.currentRoom = roomId; userWithoutQuestion.currentRoom = roomId;

      // Track which physical user (from queue) corresponds to item user_1 and user_2
      // IMPORTANT: This mapping should be based on queue order, NOT which user has the question
      // The mapping stays consistent: user1 from queue = item user_1, user2 from queue = item user_2
      // This ensures that when subsequent questions have different item fields with questions,
      // we can correctly determine which physical user should answer based on which item field has the question
      const physicalUserToItemUser = {
        [user1.id]: 'user_1',  // First in queue is always item user_1
        [user2.id]: 'user_2'   // Second in queue is always item user_2
      };

      const room = {
        id: roomId, users:[userWithQuestion, userWithoutQuestion], item,
        messages:[], answers:{}, finished:{}, surveys:{},
        msgCount:0, chatClosed:false, minTurns: MAX_TURNS,
        nextSenderId:null,
        questionSequence: questionSequence, // Store full question sequence
        currentQuestionIndex: 0, // Track which question we're on
        questionAnswers: [], // Store answers for each question
        physicalUserToItemUser: physicalUserToItemUser, // Map physical users to item users
        originalUsers: [user1, user2], // Keep reference to original queue order
        pairedAt: Date.now(),
        pairedAt_formatted: formatTimestamp(Date.now()),
        userRoles: {
          [userWithQuestion.id]: 'user_1',
          [userWithoutQuestion.id]: 'user_2'
        },
        userPids: {
          [userWithQuestion.id]: userWithQuestion.prolific.PID || 'unknown',
          [userWithoutQuestion.id]: userWithoutQuestion.prolific.PID || 'unknown'
        }
      };
      rooms.set(roomId, room);

      console.log(`[DyadicChat] Sending paired event to ${userWithQuestion.id} and ${userWithoutQuestion.id}`);

      // Send data based on which user actually has the question
      const itemForQuestionUser = {
        ...item,
        image_url: userWithQuestion === user1 ? item.user_1_image : item.user_2_image,
        goal_question: userWithQuestion === user1 ? item.user_1_question : item.user_2_question,
        correct_answer: userWithQuestion === user1 ? item.user_1_gt_answer_idx : item.user_2_gt_answer_idx,
        options: userWithQuestion === user1 ? (item.options_user_1 || item.options) : (item.options_user_2 || item.options),
        has_question: true, // The user with question gets has_question: true
        has_options: !!(userWithQuestion === user1 ? (item.options_user_1 && item.options_user_1.length > 0) : (item.options_user_2 && item.options_user_2.length > 0))
      };

      const itemForHelperUser = {
        ...item,
        image_url: userWithoutQuestion === user1 ? item.user_1_image : item.user_2_image,
        goal_question: userWithoutQuestion === user1 ? item.user_1_question : item.user_2_question,
        correct_answer: userWithoutQuestion === user1 ? item.user_1_gt_answer_idx : item.user_2_gt_answer_idx,
        options: userWithoutQuestion === user1 ? (item.options_user_1 || item.options) : (item.options_user_2 || item.options),
        has_question: false, // The helper user gets has_question: false
        has_options: false
      };

      io.to(userWithQuestion.id).emit('paired', {
        roomId,
        item: itemForQuestionUser,
        min_turns: MAX_TURNS,
        server_question_type: QUESTION_TYPE,
        questionNumber: 1,
        totalQuestions: questionSequence.length
      });
      io.to(userWithoutQuestion.id).emit('paired', {
        roomId,
        item: itemForHelperUser,
        min_turns: MAX_TURNS,
        server_question_type: QUESTION_TYPE,
        questionNumber: 1,
        totalQuestions: questionSequence.length
      });

      // The user with the question gets the first turn
      room.nextSenderId = userWithQuestion.id;
      io.to(userWithQuestion.id).emit('turn:you');
      io.to(userWithoutQuestion.id).emit('turn:wait');
      console.log(`[DyadicChat] Pairing complete, ${userWithQuestion.id} (user_1) starts first`);
    } else {
      console.log(`[DyadicChat] Not enough users in queue (${queue.length}), waiting for more`);
    }
  }
});

function persistRoom(room){
  try {
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    // Check if we have multiple questions to save
    if (room.questionSequence && room.questionSequence.length > 0 &&
        room.questionAnswers && room.questionAnswers.length > 0) {
      // Multi-question session: save each question separately
      console.log(`[DyadicChat] Saving ${room.questionAnswers.length} questions for room ${room.id}`);

      room.questionAnswers.forEach((questionData, idx) => {
        const transformedData = transformRoomDataForQuestion(room, questionData, idx);
        const line = JSON.stringify(transformedData) + "\n";
        fs.appendFileSync(path.join(dir, 'transcripts.ndjson'), line);
        console.log(`[DyadicChat] Saved transcript for question ${idx + 1} (${questionData.item.sample_id || 'unknown'})`);
      });
    } else {
      // Single-question session: use original behavior
      const transformedData = transformRoomData(room);
      const line = JSON.stringify(transformedData) + "\n";
      fs.appendFileSync(path.join(dir, 'transcripts.ndjson'), line);
      console.log('[DyadicChat] Saved transcript', room.id);
    }
  } catch(e){
    console.error('[DyadicChat] Error saving transcript:', e);
  }
}

function transformRoomData(room) {
  const item = room.item;
  const [user1, user2] = room.users;

  // Get user roles
  const user1Role = room.userRoles[user1.id] || 'user_1';
  const user2Role = room.userRoles[user2.id] || 'user_2';

  // Transform messages
  const transformedMessages = room.messages.map(msg => ({
    id: room.userRoles[msg.who] || 'unknown',
    who: msg.who,
    pid: msg.pid,
    text: msg.text,
    t: msg.t,
    t_formatted: msg.t_formatted
  }));

  // Transform answers
  const transformedAnswers = {};
  if (room.answers[user1.id]) {
    const answer1 = room.answers[user1.id];
    // Use user-specific options if available, otherwise fall back to general options
    const user1Options = item.options_user_1 || item.options || [];
    transformedAnswers[user1Role] = {
      id: user1Role,
      who: user1.id,
      pid: answer1.pid,
      choice_idx: parseInt(answer1.choice),
      choice_text: user1Options[parseInt(answer1.choice)] || '',
      rt: answer1.rt,
      rt_formatted: answer1.rt_formatted,
      t: answer1.t,
      t_formatted: answer1.t_formatted
    };
  }
  if (room.answers[user2.id]) {
    const answer2 = room.answers[user2.id];
    // Use user-specific options if available, otherwise fall back to general options
    const user2Options = item.options_user_2 || item.options || [];
    transformedAnswers[user2Role] = {
      id: user2Role,
      who: user2.id,
      pid: answer2.pid,
      choice_idx: parseInt(answer2.choice),
      choice_text: user2Options[parseInt(answer2.choice)] || '',
      rt: answer2.rt,
      rt_formatted: answer2.rt_formatted,
      t: answer2.t,
      t_formatted: answer2.t_formatted
    };
  }

  // Transform surveys
  const transformedSurveys = {};
  Object.keys(room.surveys).forEach(socketId => {
    const survey = room.surveys[socketId];
    const userRole = room.userRoles[socketId] || 'unknown';
    // Use user-specific options if available, otherwise fall back to general options
    const userOptions = userRole === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);
    transformedSurveys[userRole] = {
      id: userRole,
      who: socketId,
      pid: survey.pid,
      survey: survey.survey,
      answerData: {
        msgs: survey.answerData.messages,
        choice_idx: parseInt(survey.answerData.choice),
        choice_text: userOptions[parseInt(survey.answerData.choice)] || '',
        rt: survey.answerData.rt,
        pid: survey.answerData.pid,
        rt_formatted: survey.answerData.rt_formatted
      },
      timingData: survey.timingData, // Include timing data in transformed survey
      submittedAt: survey.submittedAt,
      submittedAt_formatted: survey.submittedAt_formatted
    };
  });

  // Calculate reaction times breakdown
  const rts = {};
  Object.keys(transformedAnswers).forEach(userRole => {
    const answer = transformedAnswers[userRole];
    const survey = transformedSurveys[userRole];

    // Get timing data if available
    const timingData = survey?.timingData || {};

    // Debug: Log timing data
    console.log(`[DyadicChat] Timing data for ${userRole}:`, timingData);
    console.log(`[DyadicChat] Survey object for ${userRole}:`, survey);

    // Calculate different reaction times
    const calculateRT = (startTime, endTime) => {
      if (!startTime || !endTime) {
        console.log(`[DyadicChat] Missing timing data: startTime=${startTime}, endTime=${endTime}`);
        return null;
      }
      const rt = Math.round(endTime - startTime);
      console.log(`[DyadicChat] Calculated RT: ${rt}ms`);
      return formatReactionTime(rt);
    };

    rts[userRole] = {
      consent_page_rt: calculateRT(timingData.consentPageStartTime, timingData.instructionsPageStartTime) || answer.rt_formatted,
      instructions_page_rt: calculateRT(timingData.instructionsPageStartTime, timingData.waitingPageStartTime) || answer.rt_formatted,
      waiting_page_time: calculateRT(timingData.waitingPageStartTime, timingData.chatBeginTime) || answer.rt_formatted,
      chat_begin_to_first_msg_rt: calculateRT(timingData.chatBeginTime, timingData.firstMessageTime) || answer.rt_formatted,
      chat_end_to_answer_rt: calculateRT(timingData.chatEndTime, timingData.answerSubmitTime) || answer.rt_formatted,
      survey_rt: calculateRT(timingData.answerSubmitTime, timingData.surveySubmitTime) || answer.rt_formatted,
      total_experiment_time: calculateRT(timingData.consentPageStartTime, timingData.surveySubmitTime) || answer.rt_formatted
    };
  });

  // Create reverse mapping from PID to user role
  const pidToUserRole = {};
  Object.keys(room.userRoles).forEach(socketId => {
    const userRole = room.userRoles[socketId];
    const pid = room.userPids[socketId];
    if (pid && userRole) {
      pidToUserRole[pid] = userRole;
    }
  });

  // Get options for ground truth answers - use user-specific options if available
  const user1Options = item.options_user_1 || item.options || [];
  const user2Options = item.options_user_2 || item.options || [];

  return {
    // Original JSON fields first
    sample_id: item.sample_id || item.id || 'unknown',
    question_type: item.question_type || 'unknown',
    room_part: item.room_part || null,
    scene_id: item.scene_id || null,
    global_map_image: item.global_map_image || null,
    user_1_image: item.user_1_image || '',
    user_2_image: item.user_2_image || '',
    user_1_goal: item.user_1_goal || null,
    user_2_goal: item.user_2_goal || null,
    user_1_question: item.user_1_question || '',
    user_2_question: item.user_2_question || '',
    options_user_1: item.options_user_1 || null,
    options_user_2: item.options_user_2 || null,
    user_1_gt_answer_idx: item.user_1_gt_answer_idx || 0,
    user_2_gt_answer_idx: item.user_2_gt_answer_idx || 0,
    user_1_gt_answer_text: item.user_1_gt_answer_text || user1Options[item.user_1_gt_answer_idx] || '',
    user_2_gt_answer_text: item.user_2_gt_answer_text || user2Options[item.user_2_gt_answer_idx] || '',
    difficulty_uni: item.difficulty_uni || null,
    difficulty_int: item.difficulty_int || null,
    difficulty: item.difficulty || null,

    // Include any other fields that might exist in the original item
    ...Object.fromEntries(
      Object.entries(item).filter(([key, value]) =>
        !['id', 'sample_id', 'question_type', 'user_1_image', 'user_2_image', 'global_map_image',
          'user_1_question', 'user_2_question', 'options', 'user_1_gt_answer_idx',
          'user_2_gt_answer_idx', 'difficulty_uni', 'difficulty_int', 'difficulty',
          'room_part', 'scene_id', 'user_1_goal', 'user_2_goal', 'options_user_1',
          'options_user_2', 'user_1_gt_answer_text', 'user_2_gt_answer_text'].includes(key)
      )
    ),

    // Study data fields
    room_id: room.id,
    minTurns: room.minTurns || 4,
    messages: transformedMessages,
    user_1_answer_idx: transformedAnswers.user_1 ? transformedAnswers.user_1.choice_idx : null,
    user_1_answer_text: transformedAnswers.user_1 ? transformedAnswers.user_1.choice_text : '',
    user_2_answer_idx: transformedAnswers.user_2 ? transformedAnswers.user_2.choice_idx : null,
    user_2_answer_text: transformedAnswers.user_2 ? transformedAnswers.user_2.choice_text : '',
    answers: transformedAnswers,
    surveys: transformedSurveys,
    rts: rts,
    pairedAt: room.pairedAt,
    closed: true,
    userRoles: room.userRoles,
    userPids: room.userPids,
    pidToUserRole: pidToUserRole
  };
}

function transformRoomDataForQuestion(room, questionData, questionIndex) {
  const item = questionData.item;
  const questionAnswers = questionData.answers;
  const questionMessages = questionData.messages;

  // Get original users to map socket IDs to roles
  const originalUsers = room.originalUsers || room.users;
  const [origUser1, origUser2] = originalUsers;

  // Determine user roles for this specific question based on physicalUserToItemUser mapping
  // This mapping was established at room creation and remains consistent
  const physicalUserToItemUser = room.physicalUserToItemUser || {};
  const user1Role = physicalUserToItemUser[origUser1.id] || 'user_1';
  const user2Role = physicalUserToItemUser[origUser2.id] || 'user_2';

  // Create a mapping from socket ID to role for this question
  const socketIdToRole = {
    [origUser1.id]: user1Role,
    [origUser2.id]: user2Role
  };

  // Transform messages for this question
  const transformedMessages = questionMessages.map(msg => ({
    id: socketIdToRole[msg.who] || 'unknown',
    who: msg.who,
    pid: msg.pid,
    text: msg.text,
    t: msg.t,
    t_formatted: msg.t_formatted
  }));

  // Transform answers for this question
  const transformedAnswers = {};
  if (questionAnswers[origUser1.id]) {
    const answer1 = questionAnswers[origUser1.id];
    const user1Options = item.options_user_1 || item.options || [];
    transformedAnswers[user1Role] = {
      id: user1Role,
      who: origUser1.id,
      pid: answer1.pid,
      choice_idx: parseInt(answer1.choice),
      choice_text: user1Options[parseInt(answer1.choice)] || '',
      rt: answer1.rt,
      rt_formatted: answer1.rt_formatted,
      t: answer1.t,
      t_formatted: answer1.t_formatted
    };
  }
  if (questionAnswers[origUser2.id]) {
    const answer2 = questionAnswers[origUser2.id];
    const user2Options = item.options_user_2 || item.options || [];
    transformedAnswers[user2Role] = {
      id: user2Role,
      who: origUser2.id,
      pid: answer2.pid,
      choice_idx: parseInt(answer2.choice),
      choice_text: user2Options[parseInt(answer2.choice)] || '',
      rt: answer2.rt,
      rt_formatted: answer2.rt_formatted,
      t: answer2.t,
      t_formatted: answer2.t_formatted
    };
  }

  // Transform surveys (surveys are collected at the end and apply to whole session)
  const transformedSurveys = {};
  Object.keys(room.surveys).forEach(socketId => {
    const survey = room.surveys[socketId];
    const userRole = socketIdToRole[socketId] || 'unknown';
    // Use user-specific options for the question's item
    const userOptions = userRole === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);
    transformedSurveys[userRole] = {
      id: userRole,
      who: socketId,
      pid: survey.pid,
      survey: survey.survey,
      answerData: {
        msgs: survey.answerData.messages,
        choice_idx: parseInt(survey.answerData.choice),
        choice_text: userOptions[parseInt(survey.answerData.choice)] || '',
        rt: survey.answerData.rt,
        pid: survey.answerData.pid,
        rt_formatted: survey.answerData.rt_formatted
      },
      timingData: survey.timingData,
      submittedAt: survey.submittedAt,
      submittedAt_formatted: survey.submittedAt_formatted
    };
  });

  // Calculate reaction times breakdown (use question-specific answer timing if available)
  const rts = {};
  Object.keys(transformedAnswers).forEach(userRole => {
    const answer = transformedAnswers[userRole];
    const survey = transformedSurveys[userRole];

    const timingData = survey?.timingData || {};

    const calculateRT = (startTime, endTime) => {
      if (!startTime || !endTime) return null;
      const rt = Math.round(endTime - startTime);
      return formatReactionTime(rt);
    };

    rts[userRole] = {
      consent_page_rt: calculateRT(timingData.consentPageStartTime, timingData.instructionsPageStartTime) || answer.rt_formatted,
      instructions_page_rt: calculateRT(timingData.instructionsPageStartTime, timingData.waitingPageStartTime) || answer.rt_formatted,
      waiting_page_time: calculateRT(timingData.waitingPageStartTime, timingData.chatBeginTime) || answer.rt_formatted,
      chat_begin_to_first_msg_rt: calculateRT(timingData.chatBeginTime, timingData.firstMessageTime) || answer.rt_formatted,
      chat_end_to_answer_rt: calculateRT(timingData.chatEndTime, timingData.answerSubmitTime) || answer.rt_formatted,
      survey_rt: calculateRT(timingData.answerSubmitTime, timingData.surveySubmitTime) || answer.rt_formatted,
      total_experiment_time: calculateRT(timingData.consentPageStartTime, timingData.surveySubmitTime) || answer.rt_formatted
    };
  });

  // Create reverse mapping from PID to user role
  const pidToUserRole = {};
  Object.keys(socketIdToRole).forEach(socketId => {
    const userRole = socketIdToRole[socketId];
    const pid = room.userPids[socketId];
    if (pid && userRole) {
      pidToUserRole[pid] = userRole;
    }
  });

  // Get options for ground truth answers
  const user1Options = item.options_user_1 || item.options || [];
  const user2Options = item.options_user_2 || item.options || [];

  return {
    // Original JSON fields first
    sample_id: item.sample_id || item.id || 'unknown',
    question_type: item.question_type || 'unknown',
    room_part: item.room_part || null,
    scene_id: item.scene_id || null,
    global_map_image: item.global_map_image || null,
    user_1_image: item.user_1_image || '',
    user_2_image: item.user_2_image || '',
    user_1_goal: item.user_1_goal || null,
    user_2_goal: item.user_2_goal || null,
    user_1_question: item.user_1_question || '',
    user_2_question: item.user_2_question || '',
    options_user_1: item.options_user_1 || null,
    options_user_2: item.options_user_2 || null,
    user_1_gt_answer_idx: item.user_1_gt_answer_idx || 0,
    user_2_gt_answer_idx: item.user_2_gt_answer_idx || 0,
    user_1_gt_answer_text: item.user_1_gt_answer_text || user1Options[item.user_1_gt_answer_idx] || '',
    user_2_gt_answer_text: item.user_2_gt_answer_text || user2Options[item.user_2_gt_answer_idx] || '',
    difficulty_uni: item.difficulty_uni || null,
    difficulty_int: item.difficulty_int || null,
    difficulty: item.difficulty || null,

    // Include any other fields that might exist in the original item
    ...Object.fromEntries(
      Object.entries(item).filter(([key, value]) =>
        !['id', 'sample_id', 'question_type', 'user_1_image', 'user_2_image', 'global_map_image',
          'user_1_question', 'user_2_question', 'options', 'user_1_gt_answer_idx',
          'user_2_gt_answer_idx', 'difficulty_uni', 'difficulty_int', 'difficulty',
          'room_part', 'scene_id', 'user_1_goal', 'user_2_goal', 'options_user_1',
          'options_user_2', 'user_1_gt_answer_text', 'user_2_gt_answer_text'].includes(key)
      )
    ),

    // Study data fields
    room_id: room.id,
    question_index: questionIndex, // Add index to track question order
    minTurns: room.minTurns || 4,
    messages: transformedMessages,
    user_1_answer_idx: transformedAnswers.user_1 ? transformedAnswers.user_1.choice_idx : null,
    user_1_answer_text: transformedAnswers.user_1 ? transformedAnswers.user_1.choice_text : '',
    user_2_answer_idx: transformedAnswers.user_2 ? transformedAnswers.user_2.choice_idx : null,
    user_2_answer_text: transformedAnswers.user_2 ? transformedAnswers.user_2.choice_text : '',
    answers: transformedAnswers,
    surveys: transformedSurveys,
    rts: rts,
    pairedAt: room.pairedAt,
    closed: true,
    userRoles: socketIdToRole, // Use question-specific role mapping
    userPids: room.userPids,
    pidToUserRole: pidToUserRole
  };
}

server.listen(PORT, () => console.log('[DyadicChat] Listening on http://localhost:' + PORT));
