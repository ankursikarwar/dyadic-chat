import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';

const __dirname = path.resolve();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Add Socket.IO connection middleware to log ALL connection attempts at the lowest level
io.use((socket, next) => {
  const pidFromQuery = (socket.handshake.query && String(socket.handshake.query.pid||'').trim()) || 'DEBUG_LOCAL';
  console.log(`[DyadicChat] Socket.IO middleware: Connection attempt from ${socket.id} (PID: ${pidFromQuery})`);
  next(); // Always allow the connection to proceed to the handler
});

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
let demoItems = [];
try {
  // Choose JSON file based on QUESTION_TYPE environment variable
  let jsonFile = 'items.json'; // Default
  let demoFile = null;
  switch (QUESTION_TYPE) {
    case 'counting':
      jsonFile = 'sampled_counting_v4.json';
      demoFile = 'demo_counting.json';
      break;
    case 'anchor':
      jsonFile = 'sampled_anchor_v4.json';
      demoFile = 'demo_anchor.json';
      break;
    case 'relative_distance':
      jsonFile = 'sampled_relative_distance_v4.json';
      demoFile = 'demo_relative_distance.json';
      break;
    case 'spatial':
      jsonFile = 'sampled_spatial_v4.json';
      demoFile = 'demo_spatial.json';
      break;
    case 'perspective_taking':
      jsonFile = 'sampled_perspective_v4.json';
      demoFile = 'demo_perspective_taking.json';
      break;
    default:
      jsonFile = 'items.json'; // Default for 'all_types' or unknown
      demoFile = null;
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

  // Load demo items if demo file exists
  if (demoFile) {
    try {
      const demoPath = path.join(__dirname, 'data', demoFile);
      if (fs.existsSync(demoPath)) {
        const demoData = JSON.parse(fs.readFileSync(demoPath, 'utf-8'));
        // Handle different formats: array, object with samples array, or single object
        if (Array.isArray(demoData)) {
          demoItems = demoData;
        } else if (demoData.samples && Array.isArray(demoData.samples)) {
          demoItems = demoData.samples;
        } else if (demoData && typeof demoData === 'object' && demoData.question_type) {
          // Single demo object - wrap it in an array
          demoItems = [demoData];
        } else {
          console.warn(`[DyadicChat] Invalid demo file format: ${demoFile}, skipping demo questions`);
        }
        console.log(`[DyadicChat] Loaded ${demoItems.length} demo items from ${demoFile}`);
      } else {
        console.warn(`[DyadicChat] Demo file ${demoFile} not found, demo questions will not be available`);
      }
    } catch (e) {
      console.warn(`[DyadicChat] Failed to load demo file ${demoFile}:`, e.message);
      console.warn(`[DyadicChat] Continuing without demo questions`);
    }
  }
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
    console.warn(`[DyadicChat] Item type: ${itemType}, category: ${category}`);
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

  // First, sample a demo question if available
  console.log(`[DyadicChat] Demo items available: ${demoItems.length}, QUESTION_TYPE: ${QUESTION_TYPE}`);
  if (demoItems.length > 0 && QUESTION_TYPE !== 'all_types') {
    const randomDemoIndex = Math.floor(Math.random() * demoItems.length);
    const demoItem = demoItems[randomDemoIndex];
    const demoItemId = demoItem.id || demoItem.sample_id || String(demoItem);
    sequence.push({ 
      item: demoItem, 
      category: QUESTION_TYPE,
      isDemo: true 
    });
    usedItemIds.add(demoItemId);
    console.log(`[DyadicChat] Added demo question: ${demoItemId} (sample_id: ${demoItem.sample_id || 'N/A'})`);
  } else {
    if (demoItems.length === 0) {
      console.log(`[DyadicChat] No demo items available, skipping demo question`);
    }
    if (QUESTION_TYPE === 'all_types') {
      console.log(`[DyadicChat] QUESTION_TYPE is 'all_types', skipping demo question`);
    }
  }

  // Then sample regular questions (reduce count by 1 if we added a demo)
  const demoAdded = sequence.length > 0;
  const baseCount = QUESTIONS_PER_CATEGORY[QUESTION_TYPE] || 0;
  const regularQuestionCount = demoAdded ? Math.max(0, baseCount - 1) : baseCount;
  
  console.log(`[DyadicChat] Question sequence generation: baseCount=${baseCount}, demoAdded=${demoAdded}, regularQuestionCount=${regularQuestionCount}`);

  // If QUESTION_TYPE is a specific type (not 'all_types'), only use that type
  if (QUESTION_TYPE !== 'all_types' && QUESTIONS_PER_CATEGORY[QUESTION_TYPE]) {
    const count = regularQuestionCount;
    if (count > 0) {
    console.log(`[DyadicChat] Attempting to sample ${count} regular questions for category ${QUESTION_TYPE}`);
    const categoryQuestions = sampleQuestionsByCategory(QUESTION_TYPE, count, usedItemIds);
    console.log(`[DyadicChat] Selected ${categoryQuestions.length} questions for category ${QUESTION_TYPE} (requested ${count})`);
    if (categoryQuestions.length < count) {
      console.warn(`[DyadicChat] WARNING: Only found ${categoryQuestions.length} questions but requested ${count}. This may be because many items are already marked.`);
    }
    categoryQuestions.forEach(item => {
      const itemId = item.id || item.sample_id || String(item);
      // Explicit check: ensure no duplicates within the sequence
      if (usedItemIds.has(itemId)) {
        console.error(`[DyadicChat] ERROR: Duplicate item ID ${itemId} detected in sequence! Skipping.`);
        return; // Skip this item
      }
      usedItemIds.add(itemId);
        sequence.push({ item, category: QUESTION_TYPE, isDemo: false });
    });
    }
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
        sequence.push({ item, category, isDemo: false });
      });
    }

    // Shuffle the sequence to randomize order across categories (but keep demo first if it exists)
    // Use Fisher-Yates shuffle for better randomness, but preserve demo at position 0
    const demoQuestion = sequence.length > 0 && sequence[0].isDemo ? sequence.shift() : null;
    for (let i = sequence.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
    }
    if (demoQuestion) {
      sequence.unshift(demoQuestion);
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

// Define tryPair function OUTSIDE the connection handler so it's shared across all connections
// This is critical for recursive pairing to work correctly
function tryPair(){
  // Defensive checks to ensure all dependencies are available
  if (typeof io === 'undefined') {
    console.error(`[DyadicChat] ERROR: io is not defined in tryPair()!`);
    return;
  }
  if (typeof generateQuestionSequence !== 'function') {
    console.error(`[DyadicChat] ERROR: generateQuestionSequence is not a function!`);
    return;
  }
  if (typeof nextItem !== 'function') {
    console.error(`[DyadicChat] ERROR: nextItem is not a function!`);
    return;
  }
  
  console.log(`[DyadicChat] tryPair called, queue length: ${queue.length}`);
  if (queue.length >= 2){
    const user1 = queue.shift();
    const user2 = queue.shift();
    
    // CRITICAL: Log queue order to verify which user is first
    console.log(`[DyadicChat] Queue order: user1=${user1.id} (PID: ${user1.prolific?.PID}), user2=${user2.id} (PID: ${user2.prolific?.PID})`);
    console.log(`[DyadicChat] Attempting to pair ${user1.id} (PID: ${user1.prolific?.PID}) with ${user2.id} (PID: ${user2.prolific?.PID})`);

    if (REQUIRE_DISTINCT_PID && user1?.prolific?.PID === user2?.prolific?.PID) {
      console.log(`[DyadicChat] Same PID detected, re-queuing users`);
      queue.unshift(user1);
      queue.push(user2);
      // Don't try to pair again immediately to avoid potential infinite loop
      // The next user connection will trigger tryPair()
    return;
  }

    // Note: PID repeat check moved to connection time (after consent, before pairing)

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
      
      // CRITICAL: After handling deck complete, check if there are more users to pair
      // This ensures other pairs can still be created even if one pair hits deck complete
      if (queue.length >= 2) {
        console.log(`[DyadicChat] Deck complete for one pair, but more users in queue (${queue.length}), scheduling next pair attempt`);
        setTimeout(() => {
          console.log(`[DyadicChat] Executing recursive tryPair() call after deck complete, current queue length: ${queue.length}`);
          tryPair();
        }, 100);
      } else {
        console.log(`[DyadicChat] Deck complete for one pair, no more pairs to create (queue length: ${queue.length})`);
      }
      return;
    }

    // Start with first question
    const firstQuestion = questionSequence[0];
    const item = firstQuestion.item;
    // Note: PIDs are marked as seen only after study completion (in survey:submit handler)

    // First user in queue is always the answerer, second user is always the helper
    // This assignment is constant throughout the trial
    const answerer = user1;  // First user who joins = answerer
    const helper = user2;    // Second user who joins = helper

    // CRITICAL: Log PIDs to verify assignment
    console.log(`[DyadicChat] Role assignment: ${answerer.id} (PID: ${answerer.prolific?.PID}, first in queue) = answerer`);
    console.log(`[DyadicChat] Role assignment: ${helper.id} (PID: ${helper.prolific?.PID}, second in queue) = helper`);
    console.log(`[DyadicChat] Verifying: answerer PID=${answerer.prolific?.PID}, helper PID=${helper.prolific?.PID}`);
    console.log(`[DyadicChat] Item ${item.sample_id}: user_1_question="${item.user_1_question}", user_2_question="${item.user_2_question}"`);

    answerer.join(roomId);
    helper.join(roomId);
    answerer.currentRoom = roomId;
    helper.currentRoom = roomId;

    // Track which physical user (from queue) corresponds to item user_1 and user_2
    // IMPORTANT: This mapping is based on queue order
    // user1 (answerer) from queue = item user_1, user2 (helper) from queue = item user_2
    const physicalUserToItemUser = {
      [answerer.id]: 'user_1',  // Answerer (first in queue) is always item user_1
      [helper.id]: 'user_2'     // Helper (second in queue) is always item user_2
    };

    const room = {
      id: roomId, users:[answerer, helper], item,
      messages:[], answers:{}, finished:{}, surveys:{},
      msgCount:0, chatClosed:false, minTurns: MAX_TURNS,
      nextSenderId:null,
      questionSequence: questionSequence, // Store full question sequence
      currentQuestionIndex: 0, // Track which question we're on
      questionAnswers: [], // Store answers for each question
      physicalUserToItemUser: physicalUserToItemUser, // Map physical users to item users
      originalUsers: [answerer, helper], // Keep reference to original queue order (answerer, helper)
      answerer: answerer, // Store answerer reference
      helper: helper, // Store helper reference
      pairedAt: Date.now(),
      pairedAt_formatted: formatTimestamp(Date.now()),
      userRoles: {
        [answerer.id]: 'answerer',
        [helper.id]: 'helper'
      },
      userPids: {
        [answerer.id]: answerer.prolific.PID || 'unknown',
        [helper.id]: helper.prolific.PID || 'unknown'
      }
    };
    rooms.set(roomId, room);

    // Initialize instruction readiness tracking
    room.instructionsReady = {};
    room.instructionsReady[answerer.id] = false;
    room.instructionsReady[helper.id] = false;

    // CRITICAL: Verify roles are set correctly before sending instructions
    const answererRoleCheck = room.userRoles[answerer.id];
    const helperRoleCheck = room.userRoles[helper.id];
    
    if (answererRoleCheck !== 'answerer') {
      console.error(`[DyadicChat] CRITICAL ERROR: answerer.id=${answerer.id} has role=${answererRoleCheck}, expected 'answerer'`);
      console.error(`[DyadicChat] Fixing: setting userRoles[${answerer.id}]='answerer'`);
      room.userRoles[answerer.id] = 'answerer';
    }
    if (helperRoleCheck !== 'helper') {
      console.error(`[DyadicChat] CRITICAL ERROR: helper.id=${helper.id} has role=${helperRoleCheck}, expected 'helper'`);
      console.error(`[DyadicChat] Fixing: setting userRoles[${helper.id}]='helper'`);
      room.userRoles[helper.id] = 'helper';
    }
    
    // CRITICAL: Verify originalUsers array matches our assignment
    console.log(`[DyadicChat] originalUsers[0] (answerer): ${room.originalUsers[0].id} (PID: ${room.userPids[room.originalUsers[0].id]})`);
    console.log(`[DyadicChat] originalUsers[1] (helper): ${room.originalUsers[1].id} (PID: ${room.userPids[room.originalUsers[1].id]})`);
    console.log(`[DyadicChat] Sending paired:instructions event to answerer (${answerer.id}, PID: ${answerer.prolific?.PID}) and helper (${helper.id}, PID: ${helper.prolific?.PID})`);
    console.log(`[DyadicChat] Role assignment confirmed: userRoles[${answerer.id}]=${room.userRoles[answerer.id]}, userRoles[${helper.id}]=${room.userRoles[helper.id]}`);
    console.log(`[DyadicChat] Room userPids:`, room.userPids);

    // Send role information early for instructions page
    // CRITICAL: Double-check we're sending to the correct sockets
    const answererSocketCheck = io.sockets.sockets.get(answerer.id);
    const helperSocketCheck = io.sockets.sockets.get(helper.id);
    
    if (!answererSocketCheck) {
      console.error(`[DyadicChat] ERROR: Answerer socket ${answerer.id} not found when sending paired:instructions`);
    }
    if (!helperSocketCheck) {
      console.error(`[DyadicChat] ERROR: Helper socket ${helper.id} not found when sending paired:instructions`);
    }
    
    // CRITICAL: Verify socket IDs match before sending
    const answererSocket = io.sockets.sockets.get(answerer.id);
    const helperSocket = io.sockets.sockets.get(helper.id);
    
    if (!answererSocket) {
      console.error(`[DyadicChat] CRITICAL ERROR: Answerer socket ${answerer.id} (PID: ${answerer.prolific?.PID}) not found in io.sockets.sockets!`);
    }
    if (!helperSocket) {
      console.error(`[DyadicChat] CRITICAL ERROR: Helper socket ${helper.id} (PID: ${helper.prolific?.PID}) not found in io.sockets.sockets!`);
    }
    
    // CRITICAL: Verify PIDs match before sending
    const answererPidFromSocket = answererSocket?.prolific?.PID;
    const helperPidFromSocket = helperSocket?.prolific?.PID;
    
    if (answererPidFromSocket && answererPidFromSocket !== answerer.prolific?.PID) {
      console.error(`[DyadicChat] CRITICAL ERROR: Answerer PID mismatch! Socket has PID: ${answererPidFromSocket}, but answerer object has PID: ${answerer.prolific?.PID}`);
    }
    if (helperPidFromSocket && helperPidFromSocket !== helper.prolific?.PID) {
      console.error(`[DyadicChat] CRITICAL ERROR: Helper PID mismatch! Socket has PID: ${helperPidFromSocket}, but helper object has PID: ${helper.prolific?.PID}`);
    }
    
    // Send to answerer
    console.log(`[DyadicChat] Sending paired:instructions to answerer socket ${answerer.id} (PID: ${answerer.prolific?.PID}) with role='answerer'`);
    io.to(answerer.id).emit('paired:instructions', {
      roomId,
      role: 'answerer',
      server_question_type: QUESTION_TYPE,
      maxTurns: MAX_TURNS
    });
    
    // Send to helper
    console.log(`[DyadicChat] Sending paired:instructions to helper socket ${helper.id} (PID: ${helper.prolific?.PID}) with role='helper'`);
    io.to(helper.id).emit('paired:instructions', {
      roomId,
      role: 'helper',
      server_question_type: QUESTION_TYPE,
      maxTurns: MAX_TURNS
    });
    
    // Log what was sent for verification
    console.log(`[DyadicChat] Sent paired:instructions to answerer ${answerer.id} (PID: ${answerer.prolific?.PID}) with role='answerer'`);
    console.log(`[DyadicChat] Sent paired:instructions to helper ${helper.id} (PID: ${helper.prolific?.PID}) with role='helper'`);

    // DON'T send initial paired event immediately - wait for both users to finish instructions
    // The paired event will be sent when request:paired_data is called, or when both are ready
    // This prevents race conditions and ensures roles are correct
    console.log(`[DyadicChat] Paired event will be sent when users request it via request:paired_data (after instructions)`);

    // Determine which item fields to use based on whether user_1_question exists
    const user1HasQuestion = !!(item.user_1_question && item.user_1_question.trim() !== '');
    
    // If user_1_question exists: answerer gets user_1 fields, helper gets user_2 fields
    // If user_1_question is empty: answerer gets user_2 fields, helper gets user_1 fields
    const answererQuestionField = user1HasQuestion ? 'user_1' : 'user_2';
    const helperQuestionField = user1HasQuestion ? 'user_2' : 'user_1';

    // Send data to answerer (always gets the question)
    const itemForAnswerer = {
      ...item,
      image_url: answererQuestionField === 'user_1' ? item.user_1_image : item.user_2_image,
      goal_question: answererQuestionField === 'user_1' ? item.user_1_question : item.user_2_question,
      correct_answer: answererQuestionField === 'user_1' ? (item.user_1_gt_answer_idx ?? item.user_1_gt_answer ?? null) : (item.user_2_gt_answer_idx ?? item.user_2_gt_answer ?? null),
      options: answererQuestionField === 'user_1' ? (item.options_user_1 || item.options) : (item.options_user_2 || item.options),
      has_question: true, // Answerer always has the question
      has_options: !!(answererQuestionField === 'user_1' ? (item.options_user_1 && item.options_user_1.length > 0) : (item.options_user_2 && item.options_user_2.length > 0))
    };

    // Send data to helper (never gets the question)
    const itemForHelper = {
      ...item,
      image_url: helperQuestionField === 'user_1' ? item.user_1_image : item.user_2_image,
      goal_question: helperQuestionField === 'user_1' ? item.user_1_question : item.user_2_question,
      correct_answer: helperQuestionField === 'user_1' ? (item.user_1_gt_answer_idx ?? item.user_1_gt_answer ?? null) : (item.user_2_gt_answer_idx ?? item.user_2_gt_answer ?? null),
      options: helperQuestionField === 'user_1' ? (item.options_user_1 || item.options) : (item.options_user_2 || item.options),
      has_question: false, // Helper never has the question
      has_options: false
    };

    // Store item data for later use (when request:paired_data is called)
    // Don't send paired event immediately - wait for users to request it after instructions

    // The answerer always gets the first turn
    room.nextSenderId = answerer.id;
    io.to(answerer.id).emit('turn:you');
    io.to(helper.id).emit('turn:wait');
    console.log(`[DyadicChat] Pairing complete, answerer (${answerer.id}) starts first, helper (${helper.id}) waits`);
    
    // CRITICAL: After pairing, check if there are more users in queue to pair
    // This ensures multiple pairs can be created simultaneously
    if (queue.length >= 2) {
      console.log(`[DyadicChat] More users in queue (${queue.length}), scheduling next pair attempt`);
      // Use setTimeout to avoid potential stack overflow and allow current pairing to complete
      setTimeout(() => {
        console.log(`[DyadicChat] Executing recursive tryPair() call, current queue length: ${queue.length}`);
        tryPair();
      }, 100);
    } else {
      console.log(`[DyadicChat] No more pairs to create (queue length: ${queue.length})`);
    }
  } else {
    console.log(`[DyadicChat] Not enough users in queue (${queue.length}), waiting for more`);
  }
}

// Track server state to disconnect existing users on any failure
let serverStarting = true;

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
  // Log ALL connection attempts immediately
  const pidFromQuery = (socket.handshake.query && String(socket.handshake.query.pid||'').trim()) || 'DEBUG_LOCAL';
  console.log(`[DyadicChat] Connection attempt: ${socket.id} (PID from query: ${pidFromQuery}), serverStarting: ${serverStarting}`);
  
  // CRITICAL: Check if server is still starting - if so, disconnect immediately
  // This must be checked FIRST before any other processing
  if (serverStarting) {
    console.log(`[DyadicChat] Server still starting, disconnecting ${socket.id}`);
    io.to(socket.id).emit('connection_lost');
    setTimeout(() => socket.disconnect(true), 100);
    return;
  }
  
  const pid = pidFromQuery;
  socket.prolific = { PID: pid };

  if (STOP_WHEN_DECK_COMPLETE){
    const totalItems = items.length;
    // Check markedItems (type-specific deck state) instead of completedItems (global across all types)
    if (totalItems > 0 && markedItems.size >= totalItems){
      console.log(`[DyadicChat] Blocking ${socket.id} (PID: ${pid}) - deck complete`);
      io.to(socket.id).emit('blocked:deck_complete');
      // Give client time to update display before disconnecting
      setTimeout(()=>socket.disconnect(true), 500);
      return;
    }
  }
  
  // Check if user has already participated (after consent, at connection time)
  if (BLOCK_REPEAT_PID && seenPidsMap[pid]){
    console.log(`[DyadicChat] Blocking ${socket.id} (PID: ${pid}) - already participated`);
    io.to(socket.id).emit('blocked:repeat_pid');
    // Give client time to update display before disconnecting
    setTimeout(()=>socket.disconnect(true), 500);
    return;
  }

  // CRITICAL: Check if this is a reconnection - if user already has a room, restore them instead of queuing
  let existingRoom = null;
  let existingRoomId = null;
  for (const [roomId, room] of rooms.entries()) {
    // Check if this PID is already in this room
    const pidInRoom = Object.values(room.userPids || {}).includes(pid) || 
                      room.users.some(u => u.prolific?.PID === pid) ||
                      (room.originalUsers && room.originalUsers.some(u => u.prolific?.PID === pid));
    if (pidInRoom) {
      existingRoom = room;
      existingRoomId = roomId;
      console.log(`[DyadicChat] Found existing room ${roomId} for reconnecting user ${socket.id} (PID: ${pid})`);
      break;
    }
  }
  
  if (existingRoom && existingRoomId) {
    // This is a reconnection - restore user to their existing room
    console.log(`[DyadicChat] Reconnecting user ${socket.id} (PID: ${pid}) to existing room ${existingRoomId}`);
    socket.currentRoom = existingRoomId;
    
    // Find the original socket for this PID and replace it
    const originalSocketIndex = existingRoom.users.findIndex(u => u.prolific?.PID === pid);
    if (originalSocketIndex >= 0) {
      const originalSocket = existingRoom.users[originalSocketIndex];
      console.log(`[DyadicChat] Replacing original socket ${originalSocket.id} with new socket ${socket.id} for PID ${pid}`);
      
      // Update room.users
      existingRoom.users[originalSocketIndex] = socket;
      
      // Update room.userRoles and room.userPids with new socket ID
      if (existingRoom.userRoles[originalSocket.id]) {
        existingRoom.userRoles[socket.id] = existingRoom.userRoles[originalSocket.id];
        delete existingRoom.userRoles[originalSocket.id];
      }
      if (existingRoom.userPids[originalSocket.id]) {
        existingRoom.userPids[socket.id] = existingRoom.userPids[originalSocket.id];
        delete existingRoom.userPids[originalSocket.id];
      }
      
      // CRITICAL: Transfer instructionsReady state from old socket ID to new socket ID
      if (existingRoom.instructionsReady && existingRoom.instructionsReady[originalSocket.id] !== undefined) {
        existingRoom.instructionsReady[socket.id] = existingRoom.instructionsReady[originalSocket.id];
        delete existingRoom.instructionsReady[originalSocket.id];
        console.log(`[DyadicChat] Transferred instructionsReady state: ${existingRoom.instructionsReady[socket.id]} (old socket: ${originalSocket.id}, new socket: ${socket.id})`);
      } else if (existingRoom.instructionsReady) {
        // If instructionsReady doesn't exist for old socket, initialize it as false for new socket
        existingRoom.instructionsReady[socket.id] = false;
        console.log(`[DyadicChat] Initialized instructionsReady for new socket ${socket.id} as false`);
      }
      
      // Update room.answerer or room.helper if this socket was one of them
      if (existingRoom.answerer && existingRoom.answerer.id === originalSocket.id) {
        existingRoom.answerer = socket;
        console.log(`[DyadicChat] Updated room.answerer to new socket ${socket.id}`);
      }
      if (existingRoom.helper && existingRoom.helper.id === originalSocket.id) {
        existingRoom.helper = socket;
        console.log(`[DyadicChat] Updated room.helper to new socket ${socket.id}`);
      }
      
      // Re-join the room
      socket.join(existingRoomId);
      
      // Re-send paired:instructions with the correct role
      const userRole = existingRoom.userRoles[socket.id];
      if (userRole) {
        console.log(`[DyadicChat] Re-sending paired:instructions to reconnected user ${socket.id} (PID: ${pid}) with role=${userRole}`);
        io.to(socket.id).emit('paired:instructions', {
          roomId: existingRoomId,
          role: userRole,
          server_question_type: QUESTION_TYPE,
          maxTurns: MAX_TURNS
        });
      } else {
        console.error(`[DyadicChat] ERROR: Could not determine role for reconnected user ${socket.id} (PID: ${pid})`);
      }
    } else {
      console.error(`[DyadicChat] ERROR: Could not find original socket for PID ${pid} in room ${existingRoomId}`);
    }
  } else {
    // This is a new user - add to queue
  console.log(`[DyadicChat] New connection: ${socket.id} (PID: ${pid}), adding to queue`);
    socket.currentRoom = null;
  queue.push(socket);
  console.log(`[DyadicChat] Queue length after adding: ${queue.length}`);
    console.log(`[DyadicChat] Calling tryPair() - function type: ${typeof tryPair}`);
    try {
      if (typeof tryPair === 'function') {
  tryPair();
      } else {
        console.error(`[DyadicChat] ERROR: tryPair is not a function! Type: ${typeof tryPair}`);
      }
    } catch (e) {
      console.error(`[DyadicChat] ERROR calling tryPair():`, e);
    }
  }

  socket.on('disconnect', (reason) => {
    console.log(`[DyadicChat] Socket ${socket.id} disconnected: ${reason}`);

    // Remove from queue if still waiting
    const qi = queue.indexOf(socket);
    if (qi >= 0) queue.splice(qi, 1);

    const roomId = socket.currentRoom;
    if (roomId && rooms.has(roomId)){
      const room = rooms.get(roomId);
      const other = room.users.find(u => u.id !== socket.id);
      const socketPid = socket.prolific?.PID;

      // Check if this user had already completed the study (by socket ID or PID)
      // CRITICAL: Check both socket ID and PID to handle reconnections
      let wasAlreadyFinished = room.finished[socket.id] || false;
      if (!wasAlreadyFinished && socketPid) {
        // Check finishedByPid if it exists
        if (room.finishedByPid && room.finishedByPid[socketPid]) {
          wasAlreadyFinished = true;
        } else {
          // Fallback: check if any socket with this PID was marked finished
          const finishedByPid = Object.keys(room.finished || {}).find(sid => {
            const pid = room.userPids?.[sid] || room.users.find(u => u.id === sid)?.prolific?.PID;
            return pid === socketPid && room.finished[sid];
          });
          wasAlreadyFinished = !!finishedByPid;
        }
      }

      // Check if user has submitted their survey (check by socket ID first, then by PID)
      // This is important because the socket might disconnect after submitting survey
      let hasSubmittedSurvey = false;
      if (room.surveys) {
        // First check by socket ID
        hasSubmittedSurvey = !!room.surveys[socket.id];
        // If not found by socket ID, check by PID (in case socket ID changed or disconnect happened quickly)
        if (!hasSubmittedSurvey && socketPid) {
          // Check surveysByPid first (faster lookup)
          if (room.surveysByPid && room.surveysByPid[socketPid]) {
            hasSubmittedSurvey = true;
          } else {
            // Fallback: search through all surveys
            const surveyByPid = Object.values(room.surveys).find(s => s && s.pid === socketPid);
            hasSubmittedSurvey = !!surveyByPid;
          }
        }
      }
      
      // CRITICAL: If user has submitted survey, they are considered finished
      if (hasSubmittedSurvey) {
        wasAlreadyFinished = true;
        console.log(`[DyadicChat] User ${socket.id} (PID: ${socketPid}) has submitted survey, marking as finished`);
      }
      
      // Log the status for debugging
      console.log(`[DyadicChat] Disconnect handler: socket=${socket.id}, pid=${socketPid}, wasAlreadyFinished=${wasAlreadyFinished}, hasSubmittedSurvey=${hasSubmittedSurvey}`);

      // Check if user is in instructions phase (hasn't finished instructions yet)
      const isInInstructionsPhase = room.instructionsReady && !room.instructionsReady[socket.id];
      
      // Don't immediately notify partner - wait a bit to see if user reconnects
      // This prevents false "partner disconnected" messages during brief reconnections
      const disconnectTimeout = setTimeout(() => {
        // Only notify if user hasn't reconnected (check by PID)
        const userReconnected = socketPid && Array.from(io.sockets.sockets.values()).some(s => 
          s.prolific?.PID === socketPid && s.currentRoom === roomId
        );
        
        if (!userReconnected) {
          // Mark this user as finished only if they haven't reconnected
          if (!room.finished[socket.id]) {
      room.finished[socket.id] = true;
          }

          // Re-check survey status in case it was submitted during the 3-second wait
          // Check by socket ID first, then by PID
          let currentHasSubmittedSurvey = false;
          if (room.surveys) {
            currentHasSubmittedSurvey = !!room.surveys[socket.id];
            if (!currentHasSubmittedSurvey && socketPid) {
              // Check surveysByPid first (faster lookup)
              if (room.surveysByPid && room.surveysByPid[socketPid]) {
                currentHasSubmittedSurvey = true;
              } else {
                // Fallback: search through all surveys
                const surveyByPid = Object.values(room.surveys).find(s => s && s.pid === socketPid);
                currentHasSubmittedSurvey = !!surveyByPid;
              }
            }
          }
          
          // Re-check finished status as well (in case it was updated during the wait)
          let currentWasFinished = room.finished[socket.id] || false;
          if (!currentWasFinished && socketPid) {
            if (room.finishedByPid && room.finishedByPid[socketPid]) {
              currentWasFinished = true;
            } else {
              const finishedByPid = Object.keys(room.finished || {}).find(sid => {
                const pid = room.userPids?.[sid] || room.users.find(u => u.id === sid)?.prolific?.PID;
                return pid === socketPid && room.finished[sid];
              });
              currentWasFinished = !!finishedByPid;
            }
          }
          
          // If user has submitted survey, they are definitely finished
          if (currentHasSubmittedSurvey) {
            currentWasFinished = true;
            console.log(`[DyadicChat] Timeout handler: User ${socket.id} (PID: ${socketPid}) has submitted survey, marking as finished`);
          }
          
          // Log the status for debugging
          console.log(`[DyadicChat] Timeout handler: socket=${socket.id}, pid=${socketPid}, currentWasFinished=${currentWasFinished}, currentHasSubmittedSurvey=${currentHasSubmittedSurvey}`);
          
          // Only notify partner if:
          // 1. They hadn't completed the study yet (not finished), AND
          // 2. They haven't submitted their survey (if they submitted survey, partner can still complete theirs)
          if (other && !currentWasFinished && !currentHasSubmittedSurvey) {
            console.log(`[DyadicChat] NOTIFYING PARTNER: User ${socket.id} (PID: ${socketPid}) disconnected without finishing or submitting survey`);
            try {
              // If user disconnected during instructions phase, send specific event
              if (isInInstructionsPhase) {
                io.to(other.id).emit('end:partner:instructions');
                console.log(`[DyadicChat] Notified partner ${other.id} of disconnect during instructions phase`);
              } else {
          io.to(other.id).emit('end:partner');
                console.log(`[DyadicChat] Notified partner ${other.id} of disconnect after timeout - user did not reconnect`);
              }
        } catch(e) {
          console.error('[DyadicChat] Error notifying partner:', e);
        }
          } else if (other && (currentWasFinished || currentHasSubmittedSurvey)) {
            if (currentHasSubmittedSurvey) {
              console.log(`[DyadicChat] User ${socket.id} (PID: ${socketPid}) disconnected after submitting survey, partner can still complete their survey`);
            } else {
              console.log(`[DyadicChat] User ${socket.id} (PID: ${socketPid}) disconnected after completing study, partner can continue`);
            }
          }
        } else {
          console.log(`[DyadicChat] User ${socketPid} reconnected, not notifying partner of disconnect`);
        }
      }, 3000); // Wait 3 seconds before notifying partner
      
      // Store timeout so we can clear it if user reconnects
      if (!room.disconnectTimeouts) {
        room.disconnectTimeouts = {};
      }
      room.disconnectTimeouts[socket.id] = disconnectTimeout;

      // Clean up the room ONLY if:
      // 1. No partner exists, OR
      // 2. BOTH users have finished AND BOTH have submitted surveys
      // Re-check survey status in case it was submitted during disconnect handling
      // Check by socket ID first, then by PID for both users
      let currentThisSurveySubmitted = false;
      if (room.surveys) {
        currentThisSurveySubmitted = !!room.surveys[socket.id];
        if (!currentThisSurveySubmitted && socketPid) {
          // Check surveysByPid first (faster lookup)
          if (room.surveysByPid && room.surveysByPid[socketPid]) {
            currentThisSurveySubmitted = true;
          } else {
            // Fallback: search through all surveys
            const surveyByPid = Object.values(room.surveys).find(s => s && s.pid === socketPid);
            currentThisSurveySubmitted = !!surveyByPid;
          }
        }
      }
      
      const otherFinished = other ? (room.finished[other.id] || false) : true;
      let otherSurveySubmitted = false;
      if (other && room.surveys) {
        otherSurveySubmitted = !!room.surveys[other.id];
        if (!otherSurveySubmitted && other.prolific?.PID) {
          // Check surveysByPid first (faster lookup)
          if (room.surveysByPid && room.surveysByPid[other.prolific.PID]) {
            otherSurveySubmitted = true;
          } else {
            // Fallback: search through all surveys
            const otherSurveyByPid = Object.values(room.surveys).find(s => s && s.pid === other.prolific.PID);
            otherSurveySubmitted = !!otherSurveyByPid;
          }
        }
      } else if (!other) {
        otherSurveySubmitted = true; // No partner means "other" is done
      }
      
      const thisFinished = wasAlreadyFinished || (room.finished[socket.id] || false);
      const thisSurveySubmitted = currentThisSurveySubmitted;
      
      if (!other || (otherFinished && otherSurveySubmitted && thisFinished && thisSurveySubmitted)) {
        try {
          persistRoom(room);
          rooms.delete(roomId);
          console.log(`[DyadicChat] Cleaned up room ${roomId} - both users finished and submitted surveys (or no partner)`);
        } catch(e) {
          console.error('[DyadicChat] Error cleaning up room:', e);
        }
      } else {
        console.log(`[DyadicChat] Room ${roomId} kept active - waiting for partner to complete (otherFinished: ${otherFinished}, otherSurveySubmitted: ${otherSurveySubmitted}, thisFinished: ${thisFinished}, thisSurveySubmitted: ${thisSurveySubmitted})`);
      }
    }
  });

  socket.on('request:paired_data', (data = {}) => {
    const roomId = socket.currentRoom;
    const expectedRole = data.expectedRole; // Role from paired:instructions (client's source of truth)
    
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      const socketPid = socket.prolific?.PID;
      
      // If this is a reconnection (same PID, different socket ID), clear any pending disconnect notifications
      if (socketPid && room.disconnectTimeouts) {
        // Find the original socket ID for this PID
        const originalSocketId = Object.keys(room.userPids || {}).find(sid => room.userPids[sid] === socketPid);
        if (originalSocketId && originalSocketId !== socket.id && room.disconnectTimeouts[originalSocketId]) {
          console.log(`[DyadicChat] User ${socketPid} reconnected (new socket: ${socket.id}, old: ${originalSocketId}), clearing disconnect timeout`);
          clearTimeout(room.disconnectTimeouts[originalSocketId]);
          delete room.disconnectTimeouts[originalSocketId];
          // Clear finished status if it was set
          if (room.finished[originalSocketId]) {
            delete room.finished[originalSocketId];
          }
        }
      }
      
      // CRITICAL: First verify this socket is actually in the room
      // If socket reconnected, it might not be in room.users yet - check by PID
      let userInRoom = room.users.find(u => u.id === socket.id);
      if (!userInRoom && socketPid) {
        // Check if this PID is already in the room (reconnection case)
        const userByPid = room.users.find(u => u.prolific?.PID === socketPid);
        if (userByPid) {
          console.log(`[DyadicChat] User ${socketPid} reconnected, updating socket reference (old: ${userByPid.id}, new: ${socket.id})`);
          // Update the socket reference in room.users
          const userIndex = room.users.indexOf(userByPid);
          if (userIndex >= 0) {
            room.users[userIndex] = socket;
            userInRoom = socket;
          }
        }
      }
      
      if (!userInRoom) {
        console.error(`[DyadicChat] ERROR: Socket ${socket.id} (PID: ${socketPid}) is not in room ${roomId}`);
        console.error(`[DyadicChat] Room users:`, room.users.map(u => ({ id: u.id, pid: u.prolific?.PID })));
        console.error(`[DyadicChat] Room userRoles:`, room.userRoles);
        return;
      }
      
      // Log expected role from client for debugging
      if (expectedRole) {
        console.log(`[DyadicChat] Client expects role: ${expectedRole} (PID: ${socketPid})`);
      }
      
      // CRITICAL: Use PID as PRIMARY lookup method, socket ID as fallback
      // This is because socket IDs change on reconnection, but PIDs are stable
      // Note: socketPid is already declared above
      let userRole = null;
      
      // PRIMARY: Look up role by PID (stable identifier)
      if (socketPid && room.userPids) {
        const originalSocketId = Object.keys(room.userPids).find(sid => room.userPids[sid] === socketPid);
        if (originalSocketId && room.userRoles[originalSocketId]) {
          userRole = room.userRoles[originalSocketId];
          console.log(`[DyadicChat] Found role by PID: ${userRole} (PID: ${socketPid}, original socket: ${originalSocketId}, current socket: ${socket.id})`);
          
          // CRITICAL VALIDATION: Verify the role makes sense using originalUsers as source of truth
          // originalUsers[0] is ALWAYS the answerer, originalUsers[1] is ALWAYS the helper
          const originalAnswererPid = room.userPids[room.originalUsers[0]?.id] || (room.originalUsers[0]?.prolific?.PID);
          const originalHelperPid = room.userPids[room.originalUsers[1]?.id] || (room.originalUsers[1]?.prolific?.PID);
          
          // Validate against original assignment (ultimate source of truth)
          if (socketPid === originalAnswererPid && userRole !== 'answerer') {
            console.error(`[DyadicChat] CRITICAL ERROR: PID ${socketPid} is original answerer (originalUsers[0]) but role is '${userRole}', correcting to 'answerer'`);
            userRole = 'answerer';
          } else if (socketPid === originalHelperPid && userRole !== 'helper') {
            console.error(`[DyadicChat] CRITICAL ERROR: PID ${socketPid} is original helper (originalUsers[1]) but role is '${userRole}', correcting to 'helper'`);
            userRole = 'helper';
          } else if (userRole === 'answerer' && socketPid !== originalAnswererPid) {
            console.error(`[DyadicChat] CRITICAL ERROR: PID ${socketPid} has role 'answerer' but is NOT the original answerer (originalAnswererPID: ${originalAnswererPid})`);
            console.error(`[DyadicChat] This suggests roles are swapped. Correcting based on originalUsers...`);
            if (socketPid === originalHelperPid) {
              console.error(`[DyadicChat] Correcting: PID ${socketPid} should be helper (originalUsers[1]), not answerer`);
              userRole = 'helper';
            } else {
              console.error(`[DyadicChat] WARNING: PID ${socketPid} doesn't match either original user. Keeping role: ${userRole}`);
            }
          } else if (userRole === 'helper' && socketPid !== originalHelperPid) {
            console.error(`[DyadicChat] CRITICAL ERROR: PID ${socketPid} has role 'helper' but is NOT the original helper (originalHelperPID: ${originalHelperPid})`);
            console.error(`[DyadicChat] This suggests roles are swapped. Correcting based on originalUsers...`);
            if (socketPid === originalAnswererPid) {
              console.error(`[DyadicChat] Correcting: PID ${socketPid} should be answerer (originalUsers[0]), not helper`);
              userRole = 'answerer';
            } else {
              console.error(`[DyadicChat] WARNING: PID ${socketPid} doesn't match either original user. Keeping role: ${userRole}`);
            }
          }
          
          // Update room.userRoles to use current socket ID for future lookups
          room.userRoles[socket.id] = userRole;
          // Update room.userPids to map current socket ID to PID
          room.userPids[socket.id] = socketPid;
          // Update room.users to use current socket
          const userIndex = room.users.findIndex(u => u.id === originalSocketId);
          if (userIndex >= 0) {
            room.users[userIndex] = socket;
          }
        }
      }
      
      // FALLBACK: If PID lookup failed, try socket ID (for cases where socket hasn't reconnected)
      if (!userRole) {
        userRole = room.userRoles[socket.id];
        if (userRole) {
          console.log(`[DyadicChat] Found role by socket ID: ${userRole} (socket: ${socket.id})`);
        }
      }
      
      if (!userRole) {
          console.error(`[DyadicChat] ERROR: No role found in userRoles for socket ${socket.id} (PID: ${socketPid})`);
          console.error(`[DyadicChat] Available userRoles:`, room.userRoles);
          console.error(`[DyadicChat] Available userPids:`, room.userPids);
          console.error(`[DyadicChat] Room users:`, room.users.map(u => ({ id: u.id, pid: u.prolific?.PID, role: room.userRoles[u.id] })));
          console.error(`[DyadicChat] Room answerer: ${room.answerer?.id}, helper: ${room.helper?.id}`);
          // Try to find role by PID as final fallback
          const userByPid = room.users.find(u => u.prolific?.PID === socketPid);
          if (userByPid && room.userRoles[userByPid.id]) {
            console.error(`[DyadicChat] Found user by PID: ${userByPid.id} with role: ${room.userRoles[userByPid.id]}`);
            console.error(`[DyadicChat] This suggests socket ID changed. Original socket: ${userByPid.id}, current socket: ${socket.id}`);
            // Use the role from the original socket
            userRole = room.userRoles[userByPid.id];
            room.userRoles[socket.id] = userRole;
          } else {
            return; // Don't send paired event if we can't determine role
          }
      }
      
      // CRITICAL: Never trust client's expected role if it conflicts with original assignment
      // Use PID-based lookup from originalUsers as the ultimate source of truth
      if (expectedRole && userRole && expectedRole !== userRole) {
        console.error(`[DyadicChat] CRITICAL: Role mismatch detected!`);
        console.error(`[DyadicChat] Client expected role (from paired:instructions): ${expectedRole}`);
        console.error(`[DyadicChat] Server determined role (from room.userRoles): ${userRole}`);
        
        // Determine correct role by PID from originalUsers (ultimate source of truth)
        const originalAnswererPid = room.userPids[room.originalUsers[0]?.id] || Object.values(room.userPids)[0];
        const originalHelperPid = room.userPids[room.originalUsers[1]?.id] || Object.values(room.userPids)[1];
        
        let correctRoleByPid = null;
        if (socketPid === originalAnswererPid) {
          correctRoleByPid = 'answerer';
        } else if (socketPid === originalHelperPid) {
          correctRoleByPid = 'helper';
        }
        
        if (correctRoleByPid) {
          console.error(`[DyadicChat] Using PID-based role determination: ${correctRoleByPid} (PID: ${socketPid}, originalAnswererPID: ${originalAnswererPid}, originalHelperPID: ${originalHelperPid})`);
          userRole = correctRoleByPid;
          // Update room.userRoles to fix the incorrect mapping
          room.userRoles[socket.id] = userRole;
          // Also update room.answerer/helper if needed
          if (userRole === 'answerer' && socket.id !== room.answerer?.id) {
            console.error(`[DyadicChat] Updating room.answerer from ${room.answerer?.id} to ${socket.id}`);
            room.answerer = socket;
          } else if (userRole === 'helper' && socket.id !== room.helper?.id) {
            console.error(`[DyadicChat] Updating room.helper from ${room.helper?.id} to ${socket.id}`);
            room.helper = socket;
          }
        } else {
          console.error(`[DyadicChat] WARNING: Could not determine correct role by PID. Keeping server-determined role: ${userRole}`);
          console.error(`[DyadicChat] Room state:`, {
            userRoles: room.userRoles,
            userPids: room.userPids,
            answererId: room.answerer?.id,
            helperId: room.helper?.id,
            originalUsers: room.originalUsers?.map(u => ({ id: u.id, pid: room.userPids[u.id] }))
          });
        }
      }
      
      // CRITICAL: Log the role determination for debugging
      console.log(`[DyadicChat] Role determined for socket ${socket.id} (PID: ${socketPid}): ${userRole}${expectedRole ? ` (client expected: ${expectedRole})` : ''}`);
      
      const isAnswerer = userRole === 'answerer';
      
      // Find the user object for logging
      const user = room.users.find(u => u.id === socket.id);
      const userPid = user?.prolific?.PID || socket.prolific?.PID || 'unknown';
      
      console.log(`[DyadicChat] request:paired_data for socket ${socket.id} (PID: ${userPid})`);
      console.log(`[DyadicChat] Role from userRoles[${socket.id}]: ${userRole}, isAnswerer: ${isAnswerer}`);
      console.log(`[DyadicChat] Room answerer ID: ${room.answerer?.id}, helper ID: ${room.helper?.id}`);
      console.log(`[DyadicChat] Requesting socket matches answerer: ${socket.id === room.answerer?.id}, matches helper: ${socket.id === room.helper?.id}`);
      
      // Re-send the paired event with current item data
      const item = room.item;
      
      // Get answerer and helper from room (these are the authoritative references)
      // First try room.answerer/room.helper, then find by role from userRoles
      let answerer = room.answerer;
      let helper = room.helper;
      
      // Verify answerer/helper are still valid sockets
      if (!answerer || !io.sockets.sockets.has(answerer.id)) {
        answerer = room.users.find(u => room.userRoles[u.id] === 'answerer' && io.sockets.sockets.has(u.id));
        if (answerer) room.answerer = answerer;
      }
      if (!helper || !io.sockets.sockets.has(helper.id)) {
        helper = room.users.find(u => room.userRoles[u.id] === 'helper' && io.sockets.sockets.has(u.id));
        if (helper) room.helper = helper;
      }
      
      // Final fallback to originalUsers
      if (!answerer || !io.sockets.sockets.has(answerer.id)) {
        answerer = room.originalUsers[0];
      }
      if (!helper || !io.sockets.sockets.has(helper.id)) {
        helper = room.originalUsers[1];
      }
      
      // Verify we have valid answerer and helper
      if (!answerer || !helper) {
        console.error(`[DyadicChat] ERROR: Could not find valid answerer or helper for room ${roomId}`);
        return;
      }
      
      // CRITICAL VALIDATION: Ensure the requesting socket's role matches what we determined
      // This prevents any race conditions or ordering issues
      const actualRoleFromRoom = room.userRoles[socket.id];
      let finalIsAnswerer = isAnswerer;
      if (actualRoleFromRoom !== userRole) {
        console.error(`[DyadicChat] CRITICAL ERROR: Role mismatch! userRole=${userRole}, actualRoleFromRoom=${actualRoleFromRoom}`);
        console.error(`[DyadicChat] This should never happen. Using actualRoleFromRoom=${actualRoleFromRoom}`);
        // Use the actual role from room as the source of truth
        finalIsAnswerer = actualRoleFromRoom === 'answerer';
      }
      
      // Double-check: the requesting user should match either answerer or helper
      // Use PID comparison instead of socket ID (socket IDs change on reconnection)
      // Note: socketPid is already declared above
      const answererPid = answerer.prolific?.PID || room.userPids[answerer.id];
      const helperPid = helper.prolific?.PID || room.userPids[helper.id];
      
      const isAnswererByPid = socketPid && answererPid && socketPid === answererPid;
      const isHelperByPid = socketPid && helperPid && socketPid === helperPid;
      
      if (!isAnswererByPid && !isHelperByPid && socket.id !== answerer.id && socket.id !== helper.id) {
        console.error(`[DyadicChat] ERROR: Socket ${socket.id} (PID: ${socketPid}) is not answerer (${answerer.id}, PID: ${answererPid}) or helper (${helper.id}, PID: ${helperPid})`);
        console.error(`[DyadicChat] Room userRoles:`, room.userRoles);
        console.error(`[DyadicChat] Room users:`, room.users.map(u => ({ id: u.id, pid: u.prolific?.PID })));
        console.error(`[DyadicChat] Room userPids:`, room.userPids);
        // Don't return - continue anyway if we have a valid role
        if (!userRole) {
          console.error(`[DyadicChat] No valid role found, cannot proceed`);
          return;
        }
      }
      
      // FINAL VALIDATION: Trust room.userRoles[socket.id] as the source of truth
      // If there's a mismatch with answerer/helper socket IDs, it might be due to reconnection
      // In that case, trust the role from userRoles over the socket ID comparison
      const roleFromUserRoles = room.userRoles[socket.id];
      if (roleFromUserRoles && roleFromUserRoles !== userRole) {
        console.error(`[DyadicChat] CRITICAL ERROR: userRole=${userRole} but room.userRoles[${socket.id}]=${roleFromUserRoles}`);
        console.error(`[DyadicChat] Using roleFromUserRoles=${roleFromUserRoles} as source of truth`);
        finalIsAnswerer = roleFromUserRoles === 'answerer';
      }
      
      // Log validation results
      if (finalIsAnswerer && socket.id !== answerer.id) {
        console.warn(`[DyadicChat] WARNING: finalIsAnswerer=true but socket.id (${socket.id}) !== answerer.id (${answerer.id})`);
        console.warn(`[DyadicChat] This might indicate socket reconnection. Trusting role from userRoles: ${roleFromUserRoles}`);
      }
      if (!finalIsAnswerer && socket.id !== helper.id) {
        console.warn(`[DyadicChat] WARNING: finalIsAnswerer=false but socket.id (${socket.id}) !== helper.id (${helper.id})`);
        console.warn(`[DyadicChat] This might indicate socket reconnection. Trusting role from userRoles: ${roleFromUserRoles}`);
      }
      
      const user1HasQuestion = !!(item.user_1_question && item.user_1_question.trim() !== '');
      const answererQuestionField = user1HasQuestion ? 'user_1' : 'user_2';
      const helperQuestionField = user1HasQuestion ? 'user_2' : 'user_1';
      
      const itemForUser = finalIsAnswerer ? {
        ...item,
        image_url: answererQuestionField === 'user_1' ? item.user_1_image : item.user_2_image,
        goal_question: answererQuestionField === 'user_1' ? item.user_1_question : item.user_2_question,
        correct_answer: answererQuestionField === 'user_1' ? (item.user_1_gt_answer_idx ?? item.user_1_gt_answer ?? null) : (item.user_2_gt_answer_idx ?? item.user_2_gt_answer ?? null),
        options: answererQuestionField === 'user_1' ? (item.options_user_1 || item.options) : (item.options_user_2 || item.options),
        has_question: true, // Answerer always has the question
        has_options: !!(answererQuestionField === 'user_1' ? (item.options_user_1 && item.options_user_1.length > 0) : (item.options_user_2 && item.options_user_2.length > 0))
      } : {
        ...item,
        image_url: helperQuestionField === 'user_1' ? item.user_1_image : item.user_2_image,
        goal_question: helperQuestionField === 'user_1' ? item.user_1_question : item.user_2_question,
        correct_answer: helperQuestionField === 'user_1' ? (item.user_1_gt_answer_idx ?? item.user_1_gt_answer ?? null) : (item.user_2_gt_answer_idx ?? item.user_2_gt_answer ?? null),
        options: helperQuestionField === 'user_1' ? (item.options_user_1 || item.options) : (item.options_user_2 || item.options),
        has_question: false, // Helper never has the question
        has_options: false
      };
      
        const finalRole = finalIsAnswerer ? 'answerer' : 'helper';
        
        // Verify socket is still connected before sending
        const socketStillConnected = io.sockets.sockets.has(socket.id);
        if (!socketStillConnected) {
          console.error(`[DyadicChat] ERROR: Socket ${socket.id} is no longer connected, cannot send paired event`);
          console.error(`[DyadicChat] This might indicate the socket disconnected. Available sockets:`, Array.from(io.sockets.sockets.keys()));
          return;
        }
        
        console.log(`[DyadicChat] Sending paired event to socket ${socket.id} (PID: ${socketPid}, finalRole: ${finalRole}, has_question: ${itemForUser.has_question}) for room ${roomId}`);
        
        io.to(socket.id).emit('paired', {
          roomId,
          item: itemForUser,
          role: finalRole, // Include role for client verification (use finalRole, not userRole)
          min_turns: MAX_TURNS,
          server_question_type: QUESTION_TYPE,
          questionNumber: room.currentQuestionIndex + 1,
          totalQuestions: room.questionSequence.length,
          isDemo: room.questionSequence[room.currentQuestionIndex]?.isDemo || false
        });
        
        // CRITICAL: For the first question, send turn:you to answerer and turn:wait to helper
        // This ensures the answerer can send the first message even if the initial turn:you was missed
        if (room.currentQuestionIndex === 0) {
          const isAnswerer = finalRole === 'answerer';
          if (isAnswerer) {
            console.log(`[DyadicChat] Sending turn:you to answerer ${socket.id} with paired event (first question)`);
            io.to(socket.id).emit('turn:you');
          } else {
            console.log(`[DyadicChat] Sending turn:wait to helper ${socket.id} with paired event (first question)`);
            io.to(socket.id).emit('turn:wait');
          }
        }
        
        console.log(`[DyadicChat] Successfully sent paired event to ${socket.id}`);
    }
  });

  socket.on('instructions:ready', () => {
    const roomId = socket.currentRoom;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      if (room.instructionsReady) {
        room.instructionsReady[socket.id] = true;
        console.log(`[DyadicChat] User ${socket.id} finished instructions in room ${roomId}`);
        console.log(`[DyadicChat] Current instructionsReady state:`, room.instructionsReady);
        
        // Check if both users are ready
        // Get the current socket IDs from room.users to check their ready status
        const user1Ready = room.users[0] && room.instructionsReady[room.users[0].id] === true;
        const user2Ready = room.users[1] && room.instructionsReady[room.users[1].id] === true;
        const allReady = user1Ready && user2Ready;
        
        console.log(`[DyadicChat] Instructions ready check: user1 (${room.users[0]?.id}) ready=${user1Ready}, user2 (${room.users[1]?.id}) ready=${user2Ready}, allReady=${allReady}`);
        
        if (allReady) {
          console.log(`[DyadicChat] Both users ready in room ${roomId}, allowing them to proceed`);
          // Notify both users they can proceed
          room.users.forEach(user => {
            const userStillConnected = io.sockets.sockets.has(user.id);
            if (userStillConnected) {
              console.log(`[DyadicChat] Sending instructions:both_ready to ${user.id}`);
              io.to(user.id).emit('instructions:both_ready');
            } else {
              console.warn(`[DyadicChat] User ${user.id} is not connected, cannot send instructions:both_ready`);
            }
          });
        } else {
          // Notify the other user that their partner finished instructions
          const otherUser = room.users.find(u => u.id !== socket.id);
          if (otherUser) {
            const otherStillConnected = io.sockets.sockets.has(otherUser.id);
            if (otherStillConnected) {
              console.log(`[DyadicChat] Sending instructions:partner_ready to ${otherUser.id}`);
              io.to(otherUser.id).emit('instructions:partner_ready');
            } else {
              console.warn(`[DyadicChat] Other user ${otherUser.id} is not connected, cannot send instructions:partner_ready`);
            }
          }
        }
      } else {
        console.error(`[DyadicChat] ERROR: room.instructionsReady is not initialized for room ${roomId}`);
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
    
    // CRITICAL: Check if chat is already closed - reject message immediately
    if (room.chatClosed) {
      console.log(`[DyadicChat] User ${socket.id} tried to send message but chat is closed`);
      io.to(socket.id).emit('chat:closed');
      return;
    }

    if (room.nextSenderId && room.nextSenderId !== socket.id){
      io.to(socket.id).emit('turn:wait');
      return;
    }
    
    // CRITICAL: Check if this message would exceed max turns BEFORE processing
    // minTurns = maximum number of completed turns allowed
    // Each turn = 2 messages (one from each user)
    // So max messages = minTurns * 2
    const currentMsgCount = room.msgCount || 0;
    const maxMessages = room.minTurns * 2;
    
    // If we've already reached the max messages, reject this message
    if (currentMsgCount >= maxMessages) {
      console.log(`[DyadicChat] Max messages reached (${currentMsgCount} >= ${maxMessages}), rejecting message`);
      if (!room.chatClosed) {
        room.chatClosed = true;
        io.to(roomId).emit('chat:closed');
      }
      return;
    }
    
    const newMsgCount = currentMsgCount + 1;
    const completedTurns = Math.floor(newMsgCount / 2);
    
    // If this message would reach or exceed the max turns, close chat
    // But still allow this message if it's exactly at the limit (the last allowed message)
    if (completedTurns >= room.minTurns) {
      console.log(`[DyadicChat] Max turns reached (${completedTurns} >= ${room.minTurns}), closing chat`);
      room.chatClosed = true;
      io.to(roomId).emit('chat:closed');
      // If this message would exceed the limit, reject it
      if (newMsgCount > maxMessages) {
        console.log(`[DyadicChat] Message would exceed max messages (${newMsgCount} > ${maxMessages}), rejecting`);
        return;
      }
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

    room.msgCount = newMsgCount;
    
    // Double-check: if we've now exceeded max turns after processing, ensure chat is closed
    const finalCompletedTurns = Math.floor(room.msgCount / 2);
    if (finalCompletedTurns >= room.minTurns && !room.chatClosed){
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

    // Find the other user - use room.answerer/room.helper for reliability
    // This is more reliable than room.users.find() which might have stale socket references
    let other = null;
    if (room.answerer && room.answerer.id === socket.id) {
      other = room.helper;
    } else if (room.helper && room.helper.id === socket.id) {
      other = room.answerer;
    } else {
      // Fallback: try to find by socket ID in room.users
      other = room.users.find(u => u.id !== socket.id);
      console.warn(`[DyadicChat] Could not find other user via room.answerer/helper, using fallback. Socket: ${socket.id}, answerer: ${room.answerer?.id}, helper: ${room.helper?.id}`);
    }
    
    room.nextSenderId = other ? other.id : null;
    
    if (other) {
      // Verify the other socket is still connected before sending
      const otherSocketStillConnected = io.sockets.sockets.has(other.id);
      if (otherSocketStillConnected) {
        console.log(`[DyadicChat] Forwarding message from ${socket.id} to ${other.id}`);
        io.to(other.id).emit('chat:message', { text, serverTs: rec.t });
        io.to(other.id).emit('turn:you');
      } else {
        console.error(`[DyadicChat] ERROR: Other user ${other.id} is not connected! Cannot forward message.`);
        console.error(`[DyadicChat] Room state: answerer=${room.answerer?.id}, helper=${room.helper?.id}, users=${room.users.map(u => u.id).join(',')}`);
        // Try to find the other user by PID and update room.answerer/helper
        const socketPid = socket.prolific?.PID;
        const otherPid = other.prolific?.PID || room.userPids[other.id];
        if (otherPid) {
          const actualOtherSocket = Array.from(io.sockets.sockets.values()).find(s => 
            s.prolific?.PID === otherPid && s.currentRoom === roomId
          );
          if (actualOtherSocket) {
            console.log(`[DyadicChat] Found other user by PID: ${actualOtherSocket.id} (PID: ${otherPid}), updating room references`);
            // Update room references
            if (room.answerer && room.answerer.id === other.id) {
              room.answerer = actualOtherSocket;
            }
            if (room.helper && room.helper.id === other.id) {
              room.helper = actualOtherSocket;
            }
            // Update room.users
            const userIndex = room.users.findIndex(u => u.id === other.id);
            if (userIndex >= 0) {
              room.users[userIndex] = actualOtherSocket;
            }
            other = actualOtherSocket;
            room.nextSenderId = other.id;
            console.log(`[DyadicChat] Retrying message forward to updated socket ${other.id}`);
            io.to(other.id).emit('chat:message', { text, serverTs: rec.t });
            io.to(other.id).emit('turn:you');
          } else {
            console.error(`[DyadicChat] Could not find other user by PID ${otherPid} in room ${roomId}`);
          }
        }
      }
    } else {
      console.error(`[DyadicChat] ERROR: Could not find other user! Socket: ${socket.id}, room.users: ${room.users.map(u => u.id).join(',')}`);
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

      // Answerer and helper are constant throughout the trial
      // Use room.userRoles as the source of truth to find current socket objects
      // This handles cases where sockets disconnect/reconnect
      let answerer = room.answerer;
      let helper = room.helper;
      
      // If answerer/helper not found, find them by role from userRoles
      if (!answerer || !io.sockets.sockets.has(answerer.id)) {
        answerer = room.users.find(u => room.userRoles[u.id] === 'answerer') || room.originalUsers[0];
        // Update room.answerer if we found a valid socket
        if (answerer && io.sockets.sockets.has(answerer.id)) {
          room.answerer = answerer;
        }
      }
      if (!helper || !io.sockets.sockets.has(helper.id)) {
        helper = room.users.find(u => room.userRoles[u.id] === 'helper') || room.originalUsers[1];
        // Update room.helper if we found a valid socket
        if (helper && io.sockets.sockets.has(helper.id)) {
          room.helper = helper;
        }
      }
      
      // Final fallback: use originalUsers if still not found
      if (!answerer || !io.sockets.sockets.has(answerer.id)) {
        answerer = room.originalUsers[0];
      }
      if (!helper || !io.sockets.sockets.has(helper.id)) {
        helper = room.originalUsers[1];
      }
      
      // CRITICAL VALIDATION: Ensure answerer and helper match originalUsers by PID
      // This prevents role swapping across questions
      const originalAnswererPid = room.userPids[room.originalUsers[0]?.id] || room.originalUsers[0]?.prolific?.PID;
      const originalHelperPid = room.userPids[room.originalUsers[1]?.id] || room.originalUsers[1]?.prolific?.PID;
      const currentAnswererPid = answerer?.prolific?.PID || room.userPids[answerer?.id];
      const currentHelperPid = helper?.prolific?.PID || room.userPids[helper?.id];
      
      if (currentAnswererPid && originalAnswererPid && currentAnswererPid !== originalAnswererPid) {
        console.error(`[DyadicChat] CRITICAL: Answerer PID mismatch! Current: ${currentAnswererPid}, Original: ${originalAnswererPid}`);
        console.error(`[DyadicChat] Fixing: Using original answerer from originalUsers[0]`);
        answerer = room.originalUsers[0];
        // Find current socket for this PID if it exists
        const currentSocket = Array.from(io.sockets.sockets.values()).find(s => s.prolific?.PID === originalAnswererPid && s.currentRoom === room.id);
        if (currentSocket) {
          answerer = currentSocket;
        }
      }
      if (currentHelperPid && originalHelperPid && currentHelperPid !== originalHelperPid) {
        console.error(`[DyadicChat] CRITICAL: Helper PID mismatch! Current: ${currentHelperPid}, Original: ${originalHelperPid}`);
        console.error(`[DyadicChat] Fixing: Using original helper from originalUsers[1]`);
        helper = room.originalUsers[1];
        // Find current socket for this PID if it exists
        const currentSocket = Array.from(io.sockets.sockets.values()).find(s => s.prolific?.PID === originalHelperPid && s.currentRoom === room.id);
        if (currentSocket) {
          helper = currentSocket;
        }
      }
      
      console.log(`[DyadicChat] Question ${nextIndex + 1}: Using answerer=${answerer?.id} (PID: ${currentAnswererPid}), helper=${helper?.id} (PID: ${currentHelperPid})`);

      const item = room.item;
      const user1HasQuestion = !!(item.user_1_question && item.user_1_question.trim() !== '');

      console.log(`[DyadicChat] Question ${nextIndex + 1}: user_1_has_q=${user1HasQuestion}`);
      console.log(`[DyadicChat] Answerer: ${answerer.id}, Helper: ${helper.id}`);

      // Determine which item fields to use based on whether user_1_question exists
      // If user_1_question exists: answerer gets user_1 fields, helper gets user_2 fields
      // If user_1_question is empty: answerer gets user_2 fields, helper gets user_1 fields
      const answererQuestionField = user1HasQuestion ? 'user_1' : 'user_2';
      const helperQuestionField = user1HasQuestion ? 'user_2' : 'user_1';

      // Send data to answerer (always gets the question)
      const itemForAnswerer = {
        ...item,
        image_url: answererQuestionField === 'user_1' ? item.user_1_image : item.user_2_image,
        goal_question: answererQuestionField === 'user_1' ? item.user_1_question : item.user_2_question,
        correct_answer: answererQuestionField === 'user_1' ? (item.user_1_gt_answer_idx ?? item.user_1_gt_answer ?? null) : (item.user_2_gt_answer_idx ?? item.user_2_gt_answer ?? null),
        options: answererQuestionField === 'user_1' ? (item.options_user_1 || item.options) : (item.options_user_2 || item.options),
        has_question: true, // Answerer always has the question
        has_options: !!(answererQuestionField === 'user_1' ? (item.options_user_1 && item.options_user_1.length > 0) : (item.options_user_2 && item.options_user_2.length > 0))
      };

      // Send data to helper (never gets the question)
      const itemForHelper = {
        ...item,
        image_url: helperQuestionField === 'user_1' ? item.user_1_image : item.user_2_image,
        goal_question: helperQuestionField === 'user_1' ? item.user_1_question : item.user_2_question,
        correct_answer: helperQuestionField === 'user_1' ? (item.user_1_gt_answer_idx ?? item.user_1_gt_answer ?? null) : (item.user_2_gt_answer_idx ?? item.user_2_gt_answer ?? null),
        options: helperQuestionField === 'user_1' ? (item.options_user_1 || item.options) : (item.options_user_2 || item.options),
        has_question: false, // Helper never has the question
        has_options: false
      };

      // CRITICAL: Keep roles consistent and fixed across all questions
      // Roles are NEVER swapped - first user is always answerer, second is always helper
      // Note: originalAnswererPid and originalHelperPid are already declared above
      const answererPid = answerer?.prolific?.PID || room.userPids[answerer?.id];
      const helperPid = helper?.prolific?.PID || room.userPids[helper?.id];
      
      // Verify roles match original assignment by PID (using already-declared variables)
      if (answererPid && originalAnswererPid && answererPid !== originalAnswererPid) {
        console.error(`[DyadicChat] CRITICAL: Answerer PID mismatch! Current: ${answererPid}, Original: ${originalAnswererPid}`);
        console.error(`[DyadicChat] Fixing: Using original answerer from originalUsers[0]`);
        answerer = room.originalUsers[0];
        // Find current socket for this PID if it exists
        const currentSocket = Array.from(io.sockets.sockets.values()).find(s => s.prolific?.PID === originalAnswererPid && s.currentRoom === room.id);
        if (currentSocket) {
          answerer = currentSocket;
        }
      }
      if (helperPid && originalHelperPid && helperPid !== originalHelperPid) {
        console.error(`[DyadicChat] CRITICAL: Helper PID mismatch! Current: ${helperPid}, Original: ${originalHelperPid}`);
        console.error(`[DyadicChat] Fixing: Using original helper from originalUsers[1]`);
        helper = room.originalUsers[1];
        // Find current socket for this PID if it exists
        const currentSocket = Array.from(io.sockets.sockets.values()).find(s => s.prolific?.PID === originalHelperPid && s.currentRoom === room.id);
        if (currentSocket) {
          helper = currentSocket;
        }
      }
      
      // CRITICAL: Enforce fixed roles - NEVER swap them
      room.userRoles[answerer.id] = 'answerer';
      room.userRoles[helper.id] = 'helper';
      
      // Update room.answerer and room.helper to ensure consistency
      room.answerer = answerer;
      room.helper = helper;

      // Keep room.users in answerer, helper order
      room.users = [answerer, helper];
      
      // Final validation: Log role assignment to confirm they're fixed
      console.log(`[DyadicChat] Question ${nextIndex + 1}: Roles FIXED - Answerer: ${answerer.id} (PID: ${answererPid}), Helper: ${helper.id} (PID: ${helperPid})`);
      console.log(`[DyadicChat] Original roles - Answerer PID: ${originalAnswererPid}, Helper PID: ${originalHelperPid}`);

      // Add a brief delay before sending next question to avoid jarring transition
      setTimeout(() => {
        console.log(`[DyadicChat] Sending next_question events to room ${room.id} for question ${nextIndex + 1}`);
        console.log(`[DyadicChat] Answerer: ${answerer.id}, Helper: ${helper.id}`);

        // Verify sockets are still connected
        const socketAnswerer = io.sockets.sockets.get(answerer.id);
        const socketHelper = io.sockets.sockets.get(helper.id);

        if (!socketAnswerer) {
          console.error(`[DyadicChat] ERROR: Socket ${answerer.id} (answerer) not found! Cannot send next_question.`);
        }
        if (!socketHelper) {
          console.error(`[DyadicChat] ERROR: Socket ${helper.id} (helper) not found! Cannot send next_question.`);
        }

        // Send next question event
        const nextQuestion = room.questionSequence[nextIndex];
        io.to(answerer.id).emit('next_question', {
          item: itemForAnswerer,
          role: 'answerer', // Include role for client verification
          min_turns: MAX_TURNS,
          server_question_type: QUESTION_TYPE,
          questionNumber: nextIndex + 1,
          totalQuestions: room.questionSequence.length,
          isDemo: nextQuestion.isDemo || false
        });
        io.to(helper.id).emit('next_question', {
          item: itemForHelper,
          role: 'helper', // Include role for client verification
          min_turns: MAX_TURNS,
          server_question_type: QUESTION_TYPE,
          questionNumber: nextIndex + 1,
          totalQuestions: room.questionSequence.length,
          isDemo: nextQuestion.isDemo || false
        });

        // The answerer always gets the first turn
        room.nextSenderId = answerer.id;

        // Send turn events immediately after next_question (client will handle timing)
        // Use a small delay to ensure next_question is processed first
        setTimeout(() => {
          console.log(`[DyadicChat] Sending turn events - answerer (${answerer.id}) gets turn:you, helper (${helper.id}) gets turn:wait`);
          io.to(answerer.id).emit('turn:you');
          io.to(helper.id).emit('turn:wait');
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
      
      // CRITICAL: Call callback even if room doesn't exist, so client can redirect
      if (callback) {
        callback({ success: true, message: 'Survey data received (room already cleaned up)' });
      }
      return;
    }

    const room = rooms.get(roomId);
    const { survey, answerData, timingData } = payload;

    // Store survey data for this user
    // CRITICAL: Store by both socket ID and PID to ensure it's found even if socket disconnects
    const now = Date.now();
    const socketPid = socket.prolific?.PID;
    
    room.surveys[socket.id] = {
      pid: socketPid,
      survey: survey,
      answerData: {
        ...answerData,
        rt_formatted: formatReactionTime(answerData.rt)
      },
      timingData: timingData,
      submittedAt: now,
      submittedAt_formatted: formatTimestamp(now)
    };
    
    // Also store by PID as a backup (in case socket ID changes on disconnect)
    if (socketPid && !room.surveysByPid) {
      room.surveysByPid = {};
    }
    if (socketPid) {
      room.surveysByPid[socketPid] = room.surveys[socket.id];
      console.log(`[DyadicChat] Stored survey by PID: ${socketPid}`);
    }

    // Mark this user as finished when they submit the survey.
    // This prevents the disconnect handler from treating a subsequent
    // disconnect (e.g., closing the tab after survey submission)
    // as an unexpected early disconnect and notifying the partner.
    if (!room.finished[socket.id]) {
      room.finished[socket.id] = true;
      console.log(`[DyadicChat] Marked user ${socket.id} as finished on survey submission`);
    }
    
    // Also mark by PID
    if (socketPid && !room.finishedByPid) {
      room.finishedByPid = {};
    }
    if (socketPid) {
      room.finishedByPid[socketPid] = true;
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
          // Skip demo questions - don't mark them as completed
          if (q.isDemo) {
            console.log(`[DyadicChat] Skipping demo question ${idx + 1} - not marking as completed`);
            return;
          }
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

      // Mark PIDs as seen only after both users complete the entire study
      try {
        markPidSeen(a.prolific?.PID);
        markPidSeen(b.prolific?.PID);
        console.log(`[DyadicChat] Marked PIDs as seen: ${a.prolific?.PID}, ${b.prolific?.PID}`);
      } catch (e) {
        console.warn(`[DyadicChat] Failed to mark PIDs as seen:`, e);
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
  
  // Get isDemo flag from the question sequence (for single-question sessions)
  const isDemo = room.questionSequence && room.questionSequence[0] 
    ? (room.questionSequence[0].isDemo || false) 
    : false;
  
  // Answerer is always the first user, helper is always the second user
  const answerer = room.answerer || room.users[0];
  const helper = room.helper || room.users[1];
  
  // Determine which item fields correspond to answerer and helper
  // If user_1_question exists: answerer gets user_1 fields, helper gets user_2 fields
  // If user_1_question is empty: answerer gets user_2 fields, helper gets user_1 fields
  const user1HasQuestion = !!(item.user_1_question && item.user_1_question.trim() !== '');
  const answererItemField = user1HasQuestion ? 'user_1' : 'user_2';
  const helperItemField = user1HasQuestion ? 'user_2' : 'user_1';

  // Get user roles (should be 'answerer' and 'helper' now)
  const answererRole = room.userRoles[answerer.id] || 'answerer';
  const helperRole = room.userRoles[helper.id] || 'helper';

  // Transform messages and create conversation dict
  const conversation = {};
  let answererMsgCount = 0;
  let helperMsgCount = 0;
  
  room.messages.forEach((msg, idx) => {
    const isAnswerer = msg.who === answerer.id;
    if (isAnswerer) {
      answererMsgCount++;
      conversation[`answerer_${answererMsgCount}`] = {
        text: msg.text,
        pid: msg.pid,
        t: msg.t,
        t_formatted: msg.t_formatted
      };
    } else {
      helperMsgCount++;
      conversation[`helper_${helperMsgCount}`] = {
        text: msg.text,
        pid: msg.pid,
        t: msg.t,
        t_formatted: msg.t_formatted
      };
    }
  });

  // Keep original messages format for backward compatibility
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
  if (room.answers[answerer.id]) {
    const answererAnswer = room.answers[answerer.id];
    const answererOptions = answererItemField === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);
    transformedAnswers.answerer = {
      id: 'answerer',
      who: answerer.id,
      pid: answererAnswer.pid,
      choice_idx: parseInt(answererAnswer.choice),
      choice_text: answererOptions[parseInt(answererAnswer.choice)] || '',
      rt: answererAnswer.rt,
      rt_formatted: answererAnswer.rt_formatted,
      t: answererAnswer.t,
      t_formatted: answererAnswer.t_formatted
    };
    // Also keep user_1/user_2 format for backward compatibility
    transformedAnswers[answererItemField] = transformedAnswers.answerer;
  }
  if (room.answers[helper.id]) {
    const helperAnswer = room.answers[helper.id];
    const helperOptions = helperItemField === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);
    transformedAnswers.helper = {
      id: 'helper',
      who: helper.id,
      pid: helperAnswer.pid,
      choice_idx: parseInt(helperAnswer.choice),
      choice_text: helperOptions[parseInt(helperAnswer.choice)] || '',
      rt: helperAnswer.rt,
      rt_formatted: helperAnswer.rt_formatted,
      t: helperAnswer.t,
      t_formatted: helperAnswer.t_formatted
    };
    // Also keep user_1/user_2 format for backward compatibility
    transformedAnswers[helperItemField] = transformedAnswers.helper;
  }

  // Transform surveys
  const transformedSurveys = {};
  Object.keys(room.surveys).forEach(socketId => {
    const survey = room.surveys[socketId];
    const userRole = room.userRoles[socketId] || 'unknown';
    const isAnswerer = socketId === answerer.id;
    const itemField = isAnswerer ? answererItemField : helperItemField;
    const userOptions = itemField === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);
    
    const surveyData = {
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
    
    transformedSurveys[userRole] = surveyData;
    // Also keep user_1/user_2 format for backward compatibility
    transformedSurveys[itemField] = surveyData;
  });

  // Calculate reaction times breakdown
  const rts = {};
  ['answerer', 'helper'].forEach(role => {
    const socketId = role === 'answerer' ? answerer.id : helper.id;
    const answer = transformedAnswers[role];
    const survey = transformedSurveys[role];

    if (!answer || !survey) return;

    const timingData = survey?.timingData || {};

    const calculateRT = (startTime, endTime) => {
      if (!startTime || !endTime) return null;
      const rt = Math.round(endTime - startTime);
      return formatReactionTime(rt);
    };

    rts[role] = {
      consent_page_rt: calculateRT(timingData.consentPageStartTime, timingData.instructionsPageStartTime) || answer.rt_formatted,
      instructions_page_rt: calculateRT(timingData.instructionsPageStartTime, timingData.waitingPageStartTime) || answer.rt_formatted,
      waiting_page_time: calculateRT(timingData.waitingPageStartTime, timingData.chatBeginTime) || answer.rt_formatted,
      chat_begin_to_first_msg_rt: calculateRT(timingData.chatBeginTime, timingData.firstMessageTime) || answer.rt_formatted,
      chat_end_to_answer_rt: calculateRT(timingData.chatEndTime, timingData.answerSubmitTime) || answer.rt_formatted,
      survey_rt: calculateRT(timingData.answerSubmitTime, timingData.surveySubmitTime) || answer.rt_formatted,
      total_experiment_time: calculateRT(timingData.consentPageStartTime, timingData.surveySubmitTime) || answer.rt_formatted
    };
    
    // Also keep user_1/user_2 format for backward compatibility
    const itemField = role === 'answerer' ? answererItemField : helperItemField;
    rts[itemField] = rts[role];
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

  // Get options for ground truth answers
  const answererOptions = answererItemField === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);
  const helperOptions = helperItemField === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);

  // Get answerer and helper fields from item
  const answererImage = answererItemField === 'user_1' ? item.user_1_image : item.user_2_image;
  const helperImage = helperItemField === 'user_1' ? item.user_1_image : item.user_2_image;
  const answererGoal = answererItemField === 'user_1' ? item.user_1_goal : item.user_2_goal;
  const helperGoal = helperItemField === 'user_1' ? item.user_1_goal : item.user_2_goal;
  const answererQuestion = answererItemField === 'user_1' ? item.user_1_question : item.user_2_question;
  const helperQuestion = helperItemField === 'user_1' ? item.user_1_question : item.user_2_question;
  const answererOptionsList = answererItemField === 'user_1' ? item.options_user_1 : item.options_user_2;
  const helperOptionsList = helperItemField === 'user_1' ? item.options_user_1 : item.options_user_2;
  const answererGtIdx = answererItemField === 'user_1' ? (item.user_1_gt_answer_idx ?? 0) : (item.user_2_gt_answer_idx ?? 0);
  const helperGtIdx = helperItemField === 'user_1' ? (item.user_1_gt_answer_idx ?? 0) : (item.user_2_gt_answer_idx ?? 0);
  const answererGtText = answererItemField === 'user_1' 
    ? (item.user_1_gt_answer_text || answererOptions[answererGtIdx] || '')
    : (item.user_2_gt_answer_text || answererOptions[answererGtIdx] || '');
  const helperGtText = helperItemField === 'user_1'
    ? (item.user_1_gt_answer_text || helperOptions[helperGtIdx] || '')
    : (item.user_2_gt_answer_text || helperOptions[helperGtIdx] || '');

  // Get user_1/user_2 options for backward compatibility
  const user1Options = item.options_user_1 || item.options || [];
  const user2Options = item.options_user_2 || item.options || [];

  return {
    // Original JSON fields first (for backward compatibility)
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

    // New answerer/helper fields
    answerer_image: answererImage,
    helper_image: helperImage,
    answerer_goal: answererGoal,
    helper_goal: helperGoal,
    answerer_question: answererQuestion,
    helper_question: helperQuestion,
    answerer_options: answererOptionsList,
    helper_options: helperOptionsList,
    answerer_gt_idx: answererGtIdx,
    helper_gt_idx: helperGtIdx,
    answerer_gt_text: answererGtText,
    helper_gt_text: helperGtText,

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
    isDemo: isDemo, // Flag indicating if this is a demo question
    minTurns: room.minTurns || 4,
    messages: transformedMessages,
    conversation: conversation, // New conversation dict with answerer_1, helper_1, etc.
    user_1_answer_idx: transformedAnswers[answererItemField] ? transformedAnswers[answererItemField].choice_idx : null,
    user_1_answer_text: transformedAnswers[answererItemField] ? transformedAnswers[answererItemField].choice_text : '',
    user_2_answer_idx: transformedAnswers[helperItemField] ? transformedAnswers[helperItemField].choice_idx : null,
    user_2_answer_text: transformedAnswers[helperItemField] ? transformedAnswers[helperItemField].choice_text : '',
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

  // Get isDemo flag from the question sequence
  const isDemo = room.questionSequence && room.questionSequence[questionIndex] 
    ? (room.questionSequence[questionIndex].isDemo || false) 
    : false;

  // Answerer is always the first user, helper is always the second user
  const answerer = room.answerer || room.originalUsers[0] || room.users[0];
  const helper = room.helper || room.originalUsers[1] || room.users[1];

  // Determine which item fields correspond to answerer and helper
  // If user_1_question exists: answerer gets user_1 fields, helper gets user_2 fields
  // If user_1_question is empty: answerer gets user_2 fields, helper gets user_1 fields
  const user1HasQuestion = !!(item.user_1_question && item.user_1_question.trim() !== '');
  const answererItemField = user1HasQuestion ? 'user_1' : 'user_2';
  const helperItemField = user1HasQuestion ? 'user_2' : 'user_1';

  // Get physical user to item user mapping (for backward compatibility)
  const physicalUserToItemUser = room.physicalUserToItemUser || {};
  const answererItemRole = physicalUserToItemUser[answerer.id] || 'user_1';
  const helperItemRole = physicalUserToItemUser[helper.id] || 'user_2';

  // Create a mapping from socket ID to role for this question
  const socketIdToRole = {
    [answerer.id]: 'answerer',
    [helper.id]: 'helper'
  };

  // Transform messages and create conversation dict
  const conversation = {};
  let answererMsgCount = 0;
  let helperMsgCount = 0;
  
  questionMessages.forEach((msg, idx) => {
    const isAnswerer = msg.who === answerer.id;
    if (isAnswerer) {
      answererMsgCount++;
      conversation[`answerer_${answererMsgCount}`] = {
        text: msg.text,
        pid: msg.pid,
        t: msg.t,
        t_formatted: msg.t_formatted
      };
    } else {
      helperMsgCount++;
      conversation[`helper_${helperMsgCount}`] = {
        text: msg.text,
        pid: msg.pid,
        t: msg.t,
        t_formatted: msg.t_formatted
      };
    }
  });

  // Keep original messages format for backward compatibility
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
  if (questionAnswers[answerer.id]) {
    const answererAnswer = questionAnswers[answerer.id];
    const answererOptions = answererItemField === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);
    transformedAnswers.answerer = {
      id: 'answerer',
      who: answerer.id,
      pid: answererAnswer.pid,
      choice_idx: parseInt(answererAnswer.choice),
      choice_text: answererOptions[parseInt(answererAnswer.choice)] || '',
      rt: answererAnswer.rt,
      rt_formatted: answererAnswer.rt_formatted,
      t: answererAnswer.t,
      t_formatted: answererAnswer.t_formatted
    };
    // Also keep user_1/user_2 format for backward compatibility
    transformedAnswers[answererItemField] = transformedAnswers.answerer;
  }
  if (questionAnswers[helper.id]) {
    const helperAnswer = questionAnswers[helper.id];
    const helperOptions = helperItemField === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);
    transformedAnswers.helper = {
      id: 'helper',
      who: helper.id,
      pid: helperAnswer.pid,
      choice_idx: parseInt(helperAnswer.choice),
      choice_text: helperOptions[parseInt(helperAnswer.choice)] || '',
      rt: helperAnswer.rt,
      rt_formatted: helperAnswer.rt_formatted,
      t: helperAnswer.t,
      t_formatted: helperAnswer.t_formatted
    };
    // Also keep user_1/user_2 format for backward compatibility
    transformedAnswers[helperItemField] = transformedAnswers.helper;
  }

  // Transform surveys (surveys are collected at the end and apply to whole session)
  const transformedSurveys = {};
  Object.keys(room.surveys).forEach(socketId => {
    const survey = room.surveys[socketId];
    const userRole = socketIdToRole[socketId] || 'unknown';
    const isAnswerer = socketId === answerer.id;
    const itemField = isAnswerer ? answererItemField : helperItemField;
    const userOptions = itemField === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);
    
    const surveyData = {
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
    
    transformedSurveys[userRole] = surveyData;
    // Also keep user_1/user_2 format for backward compatibility
    transformedSurveys[itemField] = surveyData;
  });

  // Calculate reaction times breakdown (use question-specific answer timing if available)
  const rts = {};
  ['answerer', 'helper'].forEach(role => {
    const socketId = role === 'answerer' ? answerer.id : helper.id;
    const answer = transformedAnswers[role];
    const survey = transformedSurveys[role];

    if (!answer || !survey) return;

    const timingData = survey?.timingData || {};

    const calculateRT = (startTime, endTime) => {
      if (!startTime || !endTime) return null;
      const rt = Math.round(endTime - startTime);
      return formatReactionTime(rt);
    };

    rts[role] = {
      consent_page_rt: calculateRT(timingData.consentPageStartTime, timingData.instructionsPageStartTime) || answer.rt_formatted,
      instructions_page_rt: calculateRT(timingData.instructionsPageStartTime, timingData.waitingPageStartTime) || answer.rt_formatted,
      waiting_page_time: calculateRT(timingData.waitingPageStartTime, timingData.chatBeginTime) || answer.rt_formatted,
      chat_begin_to_first_msg_rt: calculateRT(timingData.chatBeginTime, timingData.firstMessageTime) || answer.rt_formatted,
      chat_end_to_answer_rt: calculateRT(timingData.chatEndTime, timingData.answerSubmitTime) || answer.rt_formatted,
      survey_rt: calculateRT(timingData.answerSubmitTime, timingData.surveySubmitTime) || answer.rt_formatted,
      total_experiment_time: calculateRT(timingData.consentPageStartTime, timingData.surveySubmitTime) || answer.rt_formatted
    };
    
    // Also keep user_1/user_2 format for backward compatibility
    const itemField = role === 'answerer' ? answererItemField : helperItemField;
    rts[itemField] = rts[role];
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
  const answererOptions = answererItemField === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);
  const helperOptions = helperItemField === 'user_1' ? (item.options_user_1 || item.options || []) : (item.options_user_2 || item.options || []);

  // Get answerer and helper fields from item
  const answererImage = answererItemField === 'user_1' ? item.user_1_image : item.user_2_image;
  const helperImage = helperItemField === 'user_1' ? item.user_1_image : item.user_2_image;
  const answererGoal = answererItemField === 'user_1' ? item.user_1_goal : item.user_2_goal;
  const helperGoal = helperItemField === 'user_1' ? item.user_1_goal : item.user_2_goal;
  const answererQuestion = answererItemField === 'user_1' ? item.user_1_question : item.user_2_question;
  const helperQuestion = helperItemField === 'user_1' ? item.user_1_question : item.user_2_question;
  const answererOptionsList = answererItemField === 'user_1' ? item.options_user_1 : item.options_user_2;
  const helperOptionsList = helperItemField === 'user_1' ? item.options_user_1 : item.options_user_2;
  const answererGtIdx = answererItemField === 'user_1' ? (item.user_1_gt_answer_idx ?? 0) : (item.user_2_gt_answer_idx ?? 0);
  const helperGtIdx = helperItemField === 'user_1' ? (item.user_1_gt_answer_idx ?? 0) : (item.user_2_gt_answer_idx ?? 0);
  const answererGtText = answererItemField === 'user_1' 
    ? (item.user_1_gt_answer_text || answererOptions[answererGtIdx] || '')
    : (item.user_2_gt_answer_text || answererOptions[answererGtIdx] || '');
  const helperGtText = helperItemField === 'user_1'
    ? (item.user_1_gt_answer_text || helperOptions[helperGtIdx] || '')
    : (item.user_2_gt_answer_text || helperOptions[helperGtIdx] || '');

  // Get user_1/user_2 options for backward compatibility
  const user1Options = item.options_user_1 || item.options || [];
  const user2Options = item.options_user_2 || item.options || [];

  return {
    // Original JSON fields first (for backward compatibility)
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

    // New answerer/helper fields
    answerer_image: answererImage,
    helper_image: helperImage,
    answerer_goal: answererGoal,
    helper_goal: helperGoal,
    answerer_question: answererQuestion,
    helper_question: helperQuestion,
    answerer_options: answererOptionsList,
    helper_options: helperOptionsList,
    answerer_gt_idx: answererGtIdx,
    helper_gt_idx: helperGtIdx,
    answerer_gt_text: answererGtText,
    helper_gt_text: helperGtText,

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
    isDemo: isDemo, // Flag indicating if this is a demo question
    minTurns: room.minTurns || 4,
    messages: transformedMessages,
    conversation: conversation, // New conversation dict with answerer_1, helper_1, etc.
    user_1_answer_idx: transformedAnswers[answererItemField] ? transformedAnswers[answererItemField].choice_idx : null,
    user_1_answer_text: transformedAnswers[answererItemField] ? transformedAnswers[answererItemField].choice_text : '',
    user_2_answer_idx: transformedAnswers[helperItemField] ? transformedAnswers[helperItemField].choice_idx : null,
    user_2_answer_text: transformedAnswers[helperItemField] ? transformedAnswers[helperItemField].choice_text : '',
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
