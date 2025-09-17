/*! DyadicChat plugin — vG6h-zoom4-clamp2-instr-msg */
(function(){
  'use strict';
  const BUILD='vG6h-zoom4-clamp2-instr-msg'; console.log('[DyadicChat plugin]', BUILD);

  const info = { name: 'dyadic-chat', parameters: {
    socketUrl: { type: String, default: '' },
    prolific: { type: Object, default: {} },
    min_messages: { type: Number, default: 10 },
    wait_timeout_sec: { type: Number, default: 120 },
    goal_question: { type: String, default: '' },
    answer_options: { type: Array,  default: [] },
    image_url: { type: String, default: '' },
    question_type: { type: String, default: 'default' }
  }};

  function styleTag(){
    return [
      '<style id="dyadic-styles">',
      ':root { --bg:#000; --panel:#0b0b0b; --panel-alt:#0f0f10; --border:#3e3e42; --border-soft:#2c2c2e; --text:#fff; --muted:#d0d4d9; --radius:12px; --shadow:0 1px 0 rgba(255,255,255,0.02), 0 6px 16px rgba(0,0,0,0.35); }',
      '.dc-root { position:fixed; inset:0; background:var(--bg); color:var(--text); height:100dvh; width:100vw; padding:20px; box-sizing:border-box; overflow:hidden; font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }',
      '.dc-grid { display:grid; height:100%; width:100%; grid-template-columns: 27fr 52fr 34fr; gap:16px; box-sizing:border-box; }',
      '.dc-panel { background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:12px; min-height:0; min-width:0; box-sizing:border-box; box-shadow: var(--shadow); }',
      '.dc-panel.dc-left { padding:20px; }',
      '.dc-title { font-weight:700; margin:0; color:var(--text); letter-spacing:.2px; font-size:27px; }',
      '.dc-title-row { margin-left:8px; margin-right:8px; margin-bottom:2px; display:flex; justify-content:space-between; align-items:center; gap:10px; }',
      '.dc-small { color:var(--muted); }',
      '#dc-turns, #dc-turns-total { color:#ff4d4f; font-weight:800; }',
      '.dc-image { position:relative; width:100%; height:100%; min-height:0; background:#0e0e10; display:flex; align-items:center; justify-content:center; border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; box-shadow: var(--shadow); }',
      '.dc-image-viewport{ width:100%; height:100%; display:flex; align-items:center; justify-content:center; touch-action:none; cursor:grab; }',
      '.dc-image-viewport.grabbing{ cursor:grabbing; }',
      '#dc-scene{ width:auto; height:auto; max-width:100%; max-height:100%; user-select:none; -webkit-user-drag:none; will-change:transform; transform-origin:center center; pointer-events:none; }',
      '.dc-zoom-controls{ position:absolute; top:8px; right:8px; display:flex; gap:6px; z-index:5; }',
      '.dc-zoom-btn{ padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:rgba(0,0,0,0.65); color:#fff; cursor:pointer; pointer-events:auto; font-weight:bold; font-size:16px; }',
      '.dc-center { display:grid; grid-template-rows: minmax(0,55%) minmax(0,45%); height:100%; min-height:0; box-sizing:border-box; row-gap:16px; }',
      '.dc-center-bottom.single-box { background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:12px 12px 14px 12px; min-height:0; overflow:auto; display:flex; flex-direction:column; align-items:center; text-align:center; box-shadow: var(--shadow); }',
      '.dc-goal-title { margin-top:5px; margin-bottom:15px; color:#fff; font-weight:700; font-size:25px; }',
      '.dc-question { color:#fff; font-size:18px; font-weight:600; line-height:1.35; margin-top:0px; margin-bottom:0px; overflow:auto; height:auto; max-height:4.6em; max-width:720px; }',
      '.dc-qa-wrap { max-width:720px; width:100%; margin:0 auto; display:grid; grid-template-rows:auto auto 1fr auto; row-gap:8px; align-items:start; text-align:center; min-height:0; height:100%; }',
      '.dc-answers { display:block; width:100%; max-width:720px; margin:8px auto; text-align:left; min-height:0; max-height:100%; overflow:auto; }',
      '.dc-answer-option { display:flex; align-items:center; justify-content:flex-start; gap:8px; margin:8px !important; }',
      '.dc-answer-option span { font-size:17px !important; }',
      '.dc-availability-note { margin-top:8px; margin-bottom:3px; font-size:15px; font-weight:bold; color:var(--muted); }',
      '#dc-submit { font-size:16px; margin-top:auto; margin-bottom:4px; }',
      '.dc-right { display:grid; grid-template-rows: auto minmax(0,1fr) auto auto; row-gap:7px; height:100%; min-height:0; box-sizing:border-box; }',
      '.dc-chatbox { min-height:0; height:auto; overflow:auto; background:var(--panel-alt); border:1px solid var(--border); border-radius:var(--radius); padding:8px; }',
      '.dc-row { width:100%; display:block; margin:0px 0; font-size:15px; line-height:1.35; text-align:left; }',
      '.dc-row.dc-me, .dc-row.dc-partner { margin-bottom:10px; }',
      '.dc-me { text-align:left; }',
      '.dc-partner { text-align:right; }',
      '.dc-bubble { display:inline-block; padding:6px 12px; border-radius:12px; border:1px solid var(--border-soft); max-width:85%; word-wrap:break-word; box-shadow: 0 1px 0 rgba(255,255,255,0.02), 0 2px 8px rgba(0,0,0,0.25); }',
      '.dc-bubble-me { background:rgba(125, 211, 252, 0.08); color:#8bd5ff; }',
      '.dc-bubble-partner { background:rgba(255, 77, 79, 0.08); color:#ff6b6e; }',
      '.dc-controls { margin-top:4px; background:transparent; border:none; border-radius:0; padding:0; display:grid; grid-template-columns: 1fr auto; column-gap:8px; box-shadow:none; align-items:end; }',
      '.dc-input { flex:1; width:100%; min-width:0; box-sizing:border-box; padding:12px 14px; font-size:14px; border-radius:10px; border:1px solid var(--border); background:#0c0c0d; color:#fff; outline:none; }',
      '.dc-textarea{ resize:none; height:auto; min-height:40px; max-height:120px; overflow-y:auto; line-height:1.35; padding:12px 14px; }',
      '.dc-btn { padding:10px 12px; border-radius:10px; border:1px solid var(--border); background:linear-gradient(180deg, #1f1f22, #151518); color:#fff; cursor:pointer; white-space:nowrap; }',
      '.dc-btn:disabled { opacity:.5; cursor:not-allowed; }',
      '.dc-hint { font-size:14px !important; font-weight:bold; color:#d0d4d9; margin-top:2px !important; padding:0 10px; }','.dc-wait{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:10px;text-align:center;color:#d0d4d9; margin-top:24px; padding-top:24px; padding-top:28px;}','.dc-spinner{width:20px;height:20px;border:3px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:dcspin 0.9s linear infinite;}','@keyframes dcspin{to{transform:rotate(360deg)}}',
      '@media (max-height: 760px){ .dc-root{ padding:12px; } .dc-grid{ gap:10px; } .dc-center{ grid-template-rows: minmax(0,50%) minmax(0,50%); } .dc-center-bottom.single-box{ padding:10px; } .dc-goal-title{ margin-bottom:10px; font-size:22px; } .dc-question{ max-height:3.2em; } .dc-answer-option span{ font-size:16px !important; } .dc-controls{ margin-top:4px; } }',
      '</style>'
    ].join('');
  }

  function generateSidebarInstructions(questionType, minMessages = 10) {
    console.log('[DyadicChat] generateSidebarInstructions called with questionType:', questionType);
    const baseInstructions = `
<div class="instr instr-aesthetic">
  <style>
    .instr-aesthetic .nice { margin: 0; padding-left: 1.2em; line-height: 1.6; }
    .instr-aesthetic li { margin: 6px 0; }
    .instr-aesthetic ol[type="a"] { margin-top: 6px; }
    .instr-aesthetic h2 { margin-bottom: 10px; }
    .consent-box h2 { margin: 0 0 12px 0; }
</style>
  <h2>Instructions</h2>
  <ol class="nice">
    <li>This is a collaborative task. You will be paired with another participant to solve a question.</li>
    <li>You and your partner will each see different views of the same room.</li>
    <li>You have to chat and collaborate with your partner in order to solve the question correctly.</li>
    <li style="color: #ff6666;"><strong style="color: #ff6666;">For correctly answering the question, you will be rewarded with a bonus payment.</strong></li>
    ${getQuestionTypeSpecificSidebarInstructions(questionType)}
    <li>You can send a maximum of ${minMessages} messages to your partner.</li>
    <li>You can submit an answer only after you have sent ${minMessages} messages to your partner.</li>
    <li>Strict turn-taking:
      <ol type="a">
        <li>You cannot send two consecutive messages to your partner.</li>
        <li>You must wait for your partner to reply before sending your next message.</li>
      </ol>
    </li>
    <li>You may zoom in on the image to inspect details.</li>
    <li>After the chat is completed, select the best option you think is correct and click "Submit Answer".</li>
    <li>Do not share personal information.</li>
  </ol>
</div>
`;
    return baseInstructions;
  }

  function getQuestionTypeSpecificSidebarInstructions(questionType) {
    switch(questionType) {
      case 'counting':
        return `<li><strong>Counting Task:</strong> <span style="color:rgb(86, 46, 46);">For instance, if the question is "How many lamps are there in the room?", you might see 1 lamp in your view and your partner might see 2 lamps in their view. Its also possible that you both might be seeing the same lamp, so you have to prevent overcounting or undercounting the lamps by discussing with your partner.</span></li>`;
      case 'spatial':
        return `<li>For spatial questions, you might see objects in different positions. Discuss the spatial relationships and locations with your partner.</li>`;
      case 'anchor':
        return `<li>For anchor questions, you might see objects in different positions. Discuss the anchor object and its location with your partner.</li>`;
      case 'relative_distance':
        return `<li>For relative distance questions, you might see objects in different distances. Discuss the relative distance between the objects with your partner.</li>`;
      default:
        return `<li>You and your partner will see different perspectives of the same scene and need to work together to solve the question correctly.</li>`;
    }
  }

  class DyadicChat {
    constructor(jsPsych){ this.jsPsych = jsPsych; }

    trial(display_element, trial){
      const self = this;
      let pairedPayload = null;
      const pidLabel = (trial.prolific && trial.prolific.PID) || 'DEBUG_LOCAL';
      
      // Additional timing tracking - declare variables first
      let consentPageStartTime = null;
      let instructionsPageStartTime = null;
      let waitingPageStartTime = null;
      let chatBeginTime = null;
      let firstMessageTime = null;
      let chatEndTime = null;
      let answerSubmitTime = null;
      let surveySubmitTime = null;
      
      // Get timing from global scope
      consentPageStartTime = window.consentPageStartTime;
      instructionsPageStartTime = window.instructionsPageStartTime;

      function htmlWait(){
        return styleTag() + [
          '<div class="dc-wait">',
          '  <div class="dc-spinner"></div>',
          '  <div style="font-size:18px; color:#d0d4d9;">Waiting for another participant to join. Please keep this tab open. We’ll begin as soon as you’re paired. If you are not paired within 5 minutes, study will timeout.</div>',
          // '  <div style="font-size:13px; color:#9aa0a6;">Please keep this tab open. We’ll begin as soon as you’re paired.</div>',
          '</div>'
        ].join('');
      }

      function htmlChat(p){
        const item = (p && p.item) || null;
        const minMessages = (p && p.min_turns) || trial.min_messages;
        const imgHtml = (item && item.image_url)
          ? '<div class="dc-image-viewport"><img id="dc-scene" src="' + item.image_url + '" alt="scene"></div>'
            + '<div class="dc-zoom-controls">'
            +   '<button id="dc-zoom-out" type="button" class="dc-zoom-btn" title="Zoom out">−</button>'
            +   '<button id="dc-zoom-reset" type="button" class="dc-zoom-btn" title="Reset">⟳</button>'
            +   '<button id="dc-zoom-in"  type="button" class="dc-zoom-btn" title="Zoom in">+</button>'
            + '</div>'
          : '<div style="color:#777">No image</div>';
        const opts = (item && item.options) || trial.answer_options || [];
        const goalQ = (item && item.goal_question) || trial.goal_question || '';

        return styleTag() + [
          '<div class="dc-root">',
          '  <div class="dc-grid">',
          '    <section class="dc-panel dc-left" style="overflow:auto; min-height:0;">',
                    '      <div class="dc-instructions">', (function() {
                      // Use server question type for sidebar instructions if available, otherwise fall back to item question type
                      const questionTypeForInstructions = p.server_question_type || (p && p.item && p.item.question_type) || 'all_types';
                      console.log('[DyadicChat] Generating sidebar instructions for question_type:', questionTypeForInstructions);
                      return generateSidebarInstructions(questionTypeForInstructions, minMessages);
                    })(), '</div>',
          '    </section>',
          '    <section class="dc-center">',
          '      <div class="dc-image">', imgHtml, '</div>',
          '      <section class="dc-center-bottom single-box">',
          '        <div class="dc-qa-wrap">',
          '          <h3 class="dc-goal-title">Goal: Answer the Following Question</h3>',
          '          <div class="dc-question">', goalQ, '</div>',
          '          <div id="dc-answer-group" class="dc-answers">',
                     opts.map(function(opt, index){
                       return [
                         '<label class="dc-answer-option">',
                         '  <input type="radio" name="dc-answer" value="', String(index), '" disabled />',
                         '  <span>', String(opt), '</span>',
                         '</label>'
                       ].join('');
                     }).join(''),
          '          </div>',
          '          <div class="dc-availability-note">Note: Submit button becomes accessible when ' + String(minMessages) + ' messages are sent.</div>',
          '          <button id="dc-submit" class="dc-btn dc-submit" disabled>Submit Answer</button>',
          '        </div>',
          '      </section>',
          '    </section>',
          '    <section class="dc-panel dc-right">',
          '      <div class="dc-title-row">',
          '        <div class="dc-title">ChatBox</div>',
          '        <div class="dc-small" style="font-size:15px; font-weight:bold;">',
          '          <span>Number of Messages&nbsp;</span>',
          '          <span id="dc-messages">0</span> / <span id="dc-messages-total">', String(minMessages), '</span>',
          '        </div>',
          '      </div>',
          '      <div id="dc-chat" class="dc-chatbox" aria-live="polite"></div>',
          '      <div class="dc-controls">',
          '        <textarea id="dc-msg" class="dc-input dc-textarea" rows="1" placeholder="Type your message"></textarea>',
          '        <button id="dc-send" class="dc-btn">Send</button>',
          '      </div>',
          '      <div id="dc-hint" class="dc-small dc-hint">Only one message at a time. Wait for your partner to respond.</div>',
          '    </section>',
          '  </div>',
          '</div>'
        ].join('');
      }

      const socket = io(trial.socketUrl, { query: { pid: pidLabel } });
      let myTurn = false, chatClosed = false;
      let msgCount = 0;
      let heartbeatInterval = null;
      let lastPongTime = Date.now();
      let correctAnswerIndex = null; // Store the correct answer index for this user
      let correctAnswerText = null; // Store the correct answer text for this user
      let answerOptions = null; // Store the answer options array
      let t0 = null; // Will be set when users get paired

      function redirectToProlific() {
        // Redirect to Prolific completion URL after a short delay
        setTimeout(() => {
          window.location.href = 'https://app.prolific.com/submissions/complete?cc=CSI75HQB';
        }, 2000); // 2 second delay to show completion message
      }

      function showBlocked(msg){
        display_element.innerHTML = styleTag() + '<div class="dc-wait"><div class="dc-spinner"></div><div style="font-size:18px;color:#d0d4d9;margin-top:8px;">' + msg + '</div></div>';
        try { self.jsPsych.finishTrial({ blocked: msg }); } catch {}
      }
      socket.on('blocked:repeat_pid', function(){ showBlocked('You have already participated in this study (one session per Prolific account).'); });
      socket.on('blocked:deck_complete', function(){ showBlocked('This study is currently full. All items have been completed. Thank you!'); });

      function updateMessages(){
        var completedMessages = Math.floor(msgCount / 2);
        var a = document.getElementById('dc-messages'); if (a) a.textContent = String(completedMessages);
        var sendBtn = document.getElementById('dc-send');
        var msg = document.getElementById('dc-msg');
        var allow = myTurn && !chatClosed;
        if (sendBtn) sendBtn.disabled = !allow;
        // Allow typing even when it's not their turn, but disable sending
        if (msg) msg.disabled = chatClosed;
        var ansInputs = Array.prototype.slice.call(document.querySelectorAll('input[name="dc-answer"]'));
        var submitBtn = document.getElementById('dc-submit');
        var threshold = ((pairedPayload && pairedPayload.min_messages) || trial.min_messages || 10);
        var canAnswer = chatClosed || (completedMessages >= threshold);
        ansInputs.forEach(function(el){ el.disabled = !canAnswer; });
        if (submitBtn) submitBtn.disabled = !canAnswer;
        var hint = document.getElementById('dc-hint');
        if (hint){
          if (chatClosed) hint.textContent = 'Maximum number of messages reached. Submit your answer now.';
          else hint.textContent = myTurn ? 'It’s your turn. Send your message.' : 'Only one message at a time. Wait for your partner to respond.';
        }
      }

      function addLine(who, text){
        const box = document.getElementById('dc-chat'); if (!box) return;
        const line = document.createElement('div'); line.className = 'dc-row ' + (who==='Me'?'dc-me':'dc-partner');
        const bubble = document.createElement('span'); bubble.className = 'dc-bubble ' + (who==='Me'?'dc-bubble-me':'dc-bubble-partner');
        
        // Create bold label and text content separately to prevent HTML injection
        const label = document.createElement('b');
        label.textContent = who + ': ';
        const messageText = document.createElement('span');
        messageText.textContent = text;
        
        bubble.appendChild(label);
        bubble.appendChild(messageText);
        line.appendChild(bubble); 
        box.appendChild(line); 
        box.scrollTop = box.scrollHeight;
      }

      function sendMsg(){
        const el = document.getElementById('dc-msg');
        const text = (el && el.value || '').trim(); if (!text) return;
        if (!myTurn || chatClosed) return;
        addLine('Me', text);
        msgCount += 1; updateMessages();
        
        // Track first message time
        if (!firstMessageTime) {
          firstMessageTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        }
        
        socket.emit('chat:message', { text: text });
        el.value = '';
        if (el && el.classList.contains('dc-textarea')) { el.style.height = 'auto'; el.style.overflowY = 'hidden'; }
      }

      function submitAnswer(){
        const el = document.querySelector('input[name="dc-answer"]:checked');
        if (!el) return;
        
        // Safety check: ensure t0 is set (should be set when paired)
        if (t0 === null) {
          console.warn('[DyadicChat] t0 not set, using current time as fallback');
          t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        }
        
        const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const rt = Math.round(nowTs - t0);
        
        // Track answer submit time
        answerSubmitTime = nowTs;
        
        // Store the answer data for the survey BEFORE sending to server
        window.__answerData = { messages: Math.floor(msgCount/2), choice: el.value, rt: rt, pid: pidLabel };
        
        // Store socket reference before it might be lost
        window.__socket = socket;
        
        socket.emit('answer:submit', { choice: el.value, rt: rt });
        
        // Show combined feedback and survey page
        showCombinedFeedbackAndSurvey(el.value);
      }

      function showCombinedFeedbackAndSurvey(userAnswer) {
        // Convert user's answer to index for comparison
        const userAnswerIndex = parseInt(userAnswer);
        const isCorrect = userAnswerIndex === correctAnswerIndex;
        const feedbackHTML = `
          <div style="max-width:800px; margin:0 auto; padding:20px 20px; color:#fff; text-align:left;">
            <!-- Answer Feedback Section -->
            <div style="text-align:center; margin-bottom:40px;">
              <h2 style="margin-bottom:30px; color:#fff;">Answer Submitted!</h2>
              
              <div style="background:#0b0b0b; padding:30px; border-radius:12px; border:1px solid #3e3e42; margin-bottom:30px;">
                <div style="font-size:24px; margin-bottom:20px;">
                  ${isCorrect ? 
                    '<span style="color:#4CAF50;">✓ Correct!</span>' : 
                    '<span style="color:#f44336;">✗ Incorrect</span>'
                  }
                </div>
                
                <div style="font-size:18px; margin-bottom:15px;">
                  <strong>Your answer:</strong> ${answerOptions[userAnswerIndex]}
                </div>
                
                <div style="font-size:18px; margin-bottom:20px;">
                  <strong>Correct answer:</strong> ${correctAnswerText}
                </div>
                
                ${!isCorrect ? 
                  '<div style="font-size:16px; color:#ff9800; margin-top:15px;">Don\'t worry! This was a collaborative task, and the goal was to work together to find the answer.</div>' : 
                  '<div style="font-size:16px; color:#4CAF50; margin-top:15px;">Great job! You and your partner worked together successfully.</div>'
                }
              </div>
            </div>

            <!-- Survey Section -->
            <h2 style="text-align:center; margin-bottom:30px; color:#fff;">Post-Study Survey</h2>
            <p style="margin-bottom:25px; font-size:16px; line-height:1.5;">Thank you for participating! Please answer a few brief questions about your experience.</p>
            
            <form id="post-study-survey" style="background:#0b0b0b; padding:25px; border-radius:12px; border:1px solid #3e3e42;">
              
              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#8bd5ff;">How difficult was the collaborative task?</label>
                <select name="difficulty" required style="width:100%; padding:10px; border-radius:8px; background:#1f1f22; color:#fff; border:1px solid #555;">
                  <option value="">Select difficulty level</option>
                  <option value="very_easy">Very Easy</option>
                  <option value="easy">Easy</option>
                  <option value="moderate">Moderate</option>
                  <option value="difficult">Difficult</option>
                  <option value="very_difficult">Very Difficult</option>
                </select>
              </div>

              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#8bd5ff;">Were the instructions clear and easy to follow throughout the task?</label>
                <select name="instructions_clear" id="instructions_clear" required style="width:100%; padding:10px; border-radius:8px; background:#1f1f22; color:#fff; border:1px solid #555;">
                  <option value="">Select an option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <div id="instructions_feedback" style="margin-top:10px; display:none;">
                  <label style="display:block; margin-bottom:8px; font-weight:bold; color:#ff9800;">Please briefly explain what was unclear about the instructions:</label>
                  <textarea name="instructions_feedback" rows="3" style="width:100%; padding:10px; border-radius:8px; background:#1f1f22; color:#fff; border:1px solid #555; resize:vertical;" placeholder="Please provide brief feedback about what was unclear..."></textarea>
                </div>
              </div>

              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#8bd5ff;">Did you have a clear understanding of both the task and the question being asked?</label>
                <select name="task_understanding" id="task_understanding" required style="width:100%; padding:10px; border-radius:8px; background:#1f1f22; color:#fff; border:1px solid #555;">
                  <option value="">Select an option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <div id="task_feedback" style="margin-top:10px; display:none;">
                  <label style="display:block; margin-bottom:8px; font-weight:bold; color:#ff9800;">Please briefly explain what was unclear about the task or question:</label>
                  <textarea name="task_feedback" rows="3" style="width:100%; padding:10px; border-radius:8px; background:#1f1f22; color:#fff; border:1px solid #555; resize:vertical;" placeholder="Please provide brief feedback about what was unclear..."></textarea>
                </div>
              </div>

              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#8bd5ff;">Did you use pen and paper to sketch or do any rough work while answering the question?</label>
                <select name="pen_paper" id="pen_paper" required style="width:100%; padding:10px; border-radius:8px; background:#1f1f22; color:#fff; border:1px solid #555;">
                  <option value="">Select an option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <div id="pen_paper_followup" style="margin-top:10px; display:none;">
                  <label style="display:block; margin-bottom:8px; font-weight:bold; color:#ff9800;">Did you sketch a rough map of the room to help answer the question?</label>
                  <select name="sketched_map" id="sketched_map" required style="width:100%; padding:10px; border-radius:8px; background:#1f1f22; color:#fff; border:1px solid #555;">
                    <option value="">Select an option</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>

              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#8bd5ff;">How well did you communicate with your partner?</label>
                <select name="communication" required style="width:100%; padding:10px; border-radius:8px; background:#1f1f22; color:#fff; border:1px solid #555;">
                  <option value="">Select communication quality</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>

              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#8bd5ff;">How confident are you in your final answer? (1 = Not confident, 5 = Very confident)</label>
                <select name="confidence" required style="width:100%; padding:10px; border-radius:8px; background:#1f1f22; color:#fff; border:1px solid #555;">
                  <option value="">Select confidence level</option>
                  <option value="1">1 - Not confident</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5 - Very confident</option>
                </select>
              </div>

              <div style="margin-bottom:25px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#8bd5ff;">Any additional comments about the study?</label>
                <textarea name="comments" rows="3" style="width:100%; padding:10px; border-radius:8px; background:#1f1f22; color:#fff; border:1px solid #555; resize:vertical;" placeholder="Optional comments..."></textarea>
              </div>

              <div style="text-align:center;">
                <button type="submit" style="background:linear-gradient(135deg, #4CAF50, #45a049); color:#fff; border:none; padding:15px 30px; font-size:16px; border-radius:8px; cursor:pointer; font-weight:bold; box-shadow:0 4px 8px rgba(0,0,0,0.3); transition:all 0.3s ease;">
                  Submit Survey & Complete Study
                </button>
              </div>
            </form>
          </div>
        `;
        
        display_element.innerHTML = feedbackHTML;

        // Handle dynamic feedback fields
        const instructionsSelect = document.getElementById('instructions_clear');
        const taskSelect = document.getElementById('task_understanding');
        const instructionsFeedback = document.getElementById('instructions_feedback');
        const taskFeedback = document.getElementById('task_feedback');

        if (instructionsSelect && instructionsFeedback) {
          const instructionsTextarea = instructionsFeedback.querySelector('textarea[name="instructions_feedback"]');
          instructionsSelect.addEventListener('change', function() {
            if (this.value === 'no') {
              instructionsFeedback.style.display = 'block';
              if (instructionsTextarea) {
                instructionsTextarea.setAttribute('required', 'required');
              }
            } else {
              instructionsFeedback.style.display = 'none';
              if (instructionsTextarea) {
                instructionsTextarea.removeAttribute('required');
              }
            }
          });
        }

        if (taskSelect && taskFeedback) {
          const taskTextarea = taskFeedback.querySelector('textarea[name="task_feedback"]');
          taskSelect.addEventListener('change', function() {
            if (this.value === 'no') {
              taskFeedback.style.display = 'block';
              if (taskTextarea) {
                taskTextarea.setAttribute('required', 'required');
              }
            } else {
              taskFeedback.style.display = 'none';
              if (taskTextarea) {
                taskTextarea.removeAttribute('required');
              }
            }
          });
        }

        // Handle pen and paper follow-up question
        const penPaperSelect = document.getElementById('pen_paper');
        const penPaperFollowup = document.getElementById('pen_paper_followup');

        console.log('Pen paper elements found:', {
          penPaperSelect: !!penPaperSelect,
          penPaperFollowup: !!penPaperFollowup
        });

        if (penPaperSelect && penPaperFollowup) {
          const sketchedMapSelect = penPaperFollowup.querySelector('select[name="sketched_map"]');
          console.log('Sketched map select found:', !!sketchedMapSelect);
          
          penPaperSelect.addEventListener('change', function() {
            console.log('Pen paper changed to:', this.value);
            if (this.value === 'yes') {
              penPaperFollowup.style.display = 'block';
              console.log('Showing follow-up');
              if (sketchedMapSelect) {
                sketchedMapSelect.setAttribute('required', 'required');
              }
            } else {
              penPaperFollowup.style.display = 'none';
              console.log('Hiding follow-up');
              if (sketchedMapSelect) {
                sketchedMapSelect.removeAttribute('required');
              }
            }
          });
          console.log('Event listener attached');
        }

        // Handle form submission
        const form = document.getElementById('post-study-survey');
        console.log('[DyadicChat] Survey form found:', form);
        if (form) {
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('[DyadicChat] Survey form submitted');
            const formData = new FormData(form);
            const surveyData = {};
            for (const [key, value] of formData.entries()) {
              surveyData[key] = value;
            }
            console.log('[DyadicChat] Survey data collected:', surveyData);
            
            // Track survey submit time
            surveySubmitTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            
            // Debug: Log timing data before sending
            console.log('[DyadicChat] Timing data being sent:', {
              consentPageStartTime,
              instructionsPageStartTime,
              waitingPageStartTime,
              chatBeginTime,
              firstMessageTime,
              chatEndTime,
              answerSubmitTime,
              surveySubmitTime
            });
            
            // Validate timing data
            if (!consentPageStartTime || !instructionsPageStartTime || !waitingPageStartTime || !chatBeginTime) {
              console.warn('[DyadicChat] Missing critical timing data!');
            }
            
            // Send survey data to server
            console.log('[DyadicChat] Submitting survey data:', surveyData);
            console.log('[DyadicChat] Socket connection state:', window.__socket?.connected);
            if (window.__socket) {
              window.__socket.emit('survey:submit', {
                survey: surveyData,
                answerData: window.__answerData,
                timingData: {
                  consentPageStartTime,
                  instructionsPageStartTime,
                  waitingPageStartTime,
                  chatBeginTime,
                  firstMessageTime,
                  chatEndTime,
                  answerSubmitTime,
                  surveySubmitTime
                }
              }, (response) => {
                console.log('[DyadicChat] Survey submission response:', response);
              });
              console.log('[DyadicChat] Survey data sent to server');
            } else {
              console.error('[DyadicChat] No socket connection available for survey submission');
            }
            
            // Combine answer data with survey data
            const finalData = {
              ...window.__answerData,
              survey: surveyData
            };
            
            // Show completion message and end trial
            display_element.innerHTML = '<div style="padding:40px; font-size:20px; text-align:center; color:#fff;">Thank you for completing the study! Your responses have been submitted. Redirecting to Prolific...</div>';
            self.jsPsych.finishTrial(finalData);
            redirectToProlific();
          });
        } else {
          console.error('[DyadicChat] Survey form not found in DOM');
        }
      }

      function setupTextarea(){
        const msgEl = document.getElementById('dc-msg');
        if (msgEl){
          const fit = () => {
            msgEl.style.height = 'auto';
            const max = 120;
            const h = Math.min(msgEl.scrollHeight, max);
            msgEl.style.height = h + 'px';
            msgEl.style.overflowY = (msgEl.scrollHeight > max) ? 'auto' : 'hidden';
          };
          msgEl.addEventListener('input', fit);
          setTimeout(fit, 0);
          msgEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMsg();
            }
          });
        }
      }

      function setupZoom(){
        const container = document.querySelector('.dc-image');
        const vp = container && container.querySelector('.dc-image-viewport');
        const img = container && container.querySelector('#dc-scene');
        const zin = document.getElementById('dc-zoom-in');
        const zout = document.getElementById('dc-zoom-out');
        const zreset = document.getElementById('dc-zoom-reset');
        if (!container || !vp || !img) { return; }

        let scale = 1, minScale = 1, maxScale = 4;
        let x = 0, y = 0;
        let baseW = 0, baseH = 0;

        function computeBase(){
          const rect = vp.getBoundingClientRect();
          const vpW = Math.max(1, rect.width);
          const vpH = Math.max(1, rect.height);
          const iw = img.naturalWidth || 1;
          const ih = img.naturalHeight || 1;
          const fit = Math.min(vpW/iw, vpH/ih, 1);
          baseW = iw * fit; baseH = ih * fit;
        }
        function maxOffsets(){
          const rect = vp.getBoundingClientRect();
          const vpW = Math.max(1, rect.width);
          const vpH = Math.max(1, rect.height);
          const scaledW = baseW * scale;
          const scaledH = baseH * scale;
          const mx = Math.max(0, (scaledW - vpW) / 2);
          const my = Math.max(0, (scaledH - vpH) / 2);
          return { mx, my };
        }
        function clamp(){
          const { mx, my } = maxOffsets();
          if (mx === 0) x = 0; else x = Math.max(-mx, Math.min(mx, x));
          if (my === 0) y = 0; else y = Math.max(-my, Math.min(my, y));
        }
        const apply = () => { clamp(); img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ') translateZ(0)'; };
        const setScale = (next) => { const c = Math.max(minScale, Math.min(maxScale, next)); if (c === 1){ x=0; y=0; } scale=c; apply(); };
        const zoomIn = () => setScale(scale + 0.25);
        const zoomOut = () => setScale(scale - 0.25);
        const reset = () => { scale=1; x=0; y=0; apply(); };

        if (zin) zin.addEventListener('click', (e)=>{ e.preventDefault(); zoomIn(); });
        if (zout) zout.addEventListener('click', (e)=>{ e.preventDefault(); zoomOut(); });
        if (zreset) zreset.addEventListener('click', (e)=>{ e.preventDefault(); reset(); });

        container.addEventListener('wheel', (e)=>{ e.preventDefault(); if (e.deltaY < 0) zoomIn(); else zoomOut(); }, { passive:false });

        let panning = false, lastX = 0, lastY = 0;
        vp.addEventListener('mousedown', (e)=>{ if (scale <= 1) return; panning=true; lastX=e.clientX; lastY=e.clientY; vp.classList.add('grabbing'); });
        window.addEventListener('mousemove', (e)=>{ if (!panning) return; const dx=e.clientX-lastX; const dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY; x+=dx; y+=dy; apply(); });
        window.addEventListener('mouseup', ()=>{ panning=false; vp.classList.remove('grabbing'); });

        let mode = null, startDist = 0, startScale = 1, tX = 0, tY = 0;
        const dist = (a,b) => Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
        vp.addEventListener('touchstart', (e)=>{ if (e.touches.length===1){ mode='pan'; tX=e.touches[0].clientX; tY=e.touches[0].clientY; } else if (e.touches.length===2){ mode='pinch'; startDist=dist(e.touches[0], e.touches[1]); startScale=scale; } }, { passive:false });
        vp.addEventListener('touchmove', (e)=>{
          if (mode==='pan' && e.touches.length===1){ if (scale<=1) return; e.preventDefault(); const t=e.touches[0]; const dx=t.clientX-tX; const dy=t.clientY-tY; tX=t.clientX; tY=t.clientY; x+=dx; y+=dy; apply(); }
          else if (mode==='pinch' && e.touches.length===2){ e.preventDefault(); const d=dist(e.touches[0], e.touches[1]); setScale(startScale * (d/startDist)); }
        }, { passive:false });
        vp.addEventListener('touchend', ()=>{ mode=null; }, { passive:false });

        vp.addEventListener('dblclick', reset);

        function onReady(){ computeBase(); apply(); }
        if (!img.complete) img.addEventListener('load', onReady, { once:true });
        window.addEventListener('resize', onReady);
        onReady();
      }


      display_element.innerHTML = htmlWait();
      
      // Set waiting page start time
      waitingPageStartTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      
      // 5-minute pairing timeout
      (function(){
        const TIMEOUT_MS = 5 * 60 * 1000;
        const timer = setTimeout(() => {
          try { if (!window.__pairedOnce) {
            display_element.innerHTML = '<div class="dc-wait"><div class="dc-spinner"></div><div style="font-size:18px; text-align:center;">Sorry — no partner joined within 5 minutes.</div><div style="font-size:13px;color:#9aa0a6; text-align:center;">You can close this tab and try again later.</div></div>';
            if (window.jsPsych) { window.jsPsych.finishTrial({ pairing_timeout: true }); }
          }} catch(e){}
        }, TIMEOUT_MS);
        window.__pairTimer = timer;
      })();
/* socket already defined */
/* duplicate removed */
      /* duplicate removed */
      /* duplicate removed */

      socket.on('paired', function(p){ window.__pairedOnce = true; try{ if(window.__pairTimer){ clearTimeout(window.__pairTimer); delete window.__pairTimer; } }catch(e){}
        // Set reaction time start point when users get paired
        t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        
        // Set chat begin time
        chatBeginTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        
        // Store the correct answer index, text, and options for this user
        correctAnswerIndex = p.item.correct_answer;
        answerOptions = p.item.options;
        correctAnswerText = answerOptions[correctAnswerIndex];
        display_element.innerHTML = htmlChat(p);
        let pairedPayload = p;
        const sendBtn = document.getElementById('dc-send');
        if (sendBtn) sendBtn.addEventListener('click', sendMsg);
        const submitBtn = document.getElementById('dc-submit');
        if (submitBtn) submitBtn.addEventListener('click', submitAnswer);
        setupTextarea();
        setupZoom();
        startHeartbeat(); // Start heartbeat monitoring
      });

      socket.on('chat:message', function(msg){ addLine('Partner', msg.text); msgCount += 1; updateMessages(); });
      socket.on('turn:you', function(){ myTurn = true; updateMessages(); });
      socket.on('turn:wait', function(){ myTurn = false; updateMessages(); });
      socket.on('chat:closed', function(){ 
        chatClosed = true; 
        updateMessages(); 
        
        // Track chat end time
        chatEndTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      });
      // Heartbeat mechanism
      function startHeartbeat() {
        heartbeatInterval = setInterval(() => {
          const now = Date.now();
          if (now - lastPongTime > 10000) { // 10 seconds without pong
            console.log('[DyadicChat] Heartbeat timeout, checking connection...');
            socket.emit('ping');
          } else {
            socket.emit('ping');
          }
        }, 5000); // Send ping every 5 seconds
      }

      function stopHeartbeat() {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
      }

      socket.on('pong', () => {
        lastPongTime = Date.now();
      });

    socket.on('end:partner', function(){
        stopHeartbeat();
      try { display_element.innerHTML = '<div style="padding:40px; font-size:20px; text-align:center;">Your partner disconnected or closed the tab. This session has ended.</div>'; } catch(e){}
      try { window.jsPsych.finishTrial({ ended: 'partner_disconnect' }); } catch(e){}
    });

    socket.on('connection_lost', function(){
        stopHeartbeat();
      try { display_element.innerHTML = '<div style="padding:40px; font-size:20px; text-align:center; color:#ff6b6b;">Connection lost. Please refresh the page to start a new session.</div>'; } catch(e){}
      try { window.jsPsych.finishTrial({ ended: 'connection_lost' }); } catch(e){}
      });

    }
  }

  DyadicChat.info = info;
  window.jsPsychDyadicChat = DyadicChat;
})();