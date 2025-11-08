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
      ':root { --bg:#f5f5f5; --panel:#ffffff; --panel-alt:#fafafa; --border:#d0d0d0; --border-soft:#e0e0e0; --text:#1a1a1a; --muted:#666666; --radius:12px; --shadow:0 1px 0 rgba(0,0,0,0.05), 0 6px 16px rgba(0,0,0,0.1); }',
      '.dc-root { position:fixed; inset:0; background:var(--bg); color:var(--text); height:100dvh; width:100vw; padding:20px; box-sizing:border-box; overflow:hidden; font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }',
      '.dc-grid { display:grid; height:100%; width:100%; grid-template-columns: 27fr 52fr 34fr; gap:16px; box-sizing:border-box; }',
      '.dc-panel { background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:12px; min-height:0; min-width:0; box-sizing:border-box; box-shadow: var(--shadow); }',
      '.dc-panel.dc-left { padding:20px; }',
      '.dc-title { font-weight:700; margin:0; color:var(--text); letter-spacing:.2px; font-size:27px; }',
      '.dc-title-row { margin-left:8px; margin-right:8px; margin-bottom:2px; display:flex; justify-content:space-between; align-items:center; gap:10px; }',
      '.dc-small { color:var(--muted); }',
      '#dc-turns, #dc-turns-total { color:#ff4d4f; font-weight:800; }',
      '.dc-image { position:relative; width:100%; height:100%; min-height:0; background:#f0f0f0; display:flex; align-items:center; justify-content:center; border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; box-shadow: var(--shadow); }',
      '.dc-image-viewport{ width:100%; height:100%; display:flex; align-items:center; justify-content:center; touch-action:none; cursor:grab; }',
      '.dc-image-viewport.grabbing{ cursor:grabbing; }',
      '#dc-scene{ width:auto; height:auto; max-width:100%; max-height:100%; user-select:none; -webkit-user-drag:none; will-change:transform; transform-origin:center center; pointer-events:none; }',
      '.dc-zoom-controls{ position:absolute; top:8px; right:8px; display:flex; gap:6px; z-index:5; }',
      '.dc-zoom-btn{ padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:rgba(255,255,255,0.9); color:#1a1a1a; cursor:pointer; pointer-events:auto; font-weight:bold; font-size:16px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }',
      '.dc-center { display:grid; grid-template-rows: minmax(0,55%) minmax(0,45%); height:100%; min-height:0; box-sizing:border-box; row-gap:16px; }',
      '.dc-center-bottom.single-box { background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:12px 12px 14px 12px; min-height:0; overflow:auto; display:flex; flex-direction:column; align-items:center; text-align:center; box-shadow: var(--shadow); }',
      '.dc-goal-title { margin-top:5px; margin-bottom:40px; color:#0066cc; font-weight:700; font-size:25px; }',
      '.dc-question { color:var(--text); font-size:18px; font-weight:600; line-height:1.35; margin-top:0px; margin-bottom:0px; overflow:auto; height:auto; max-height:4.6em; max-width:720px; }',
      '.dc-qa-wrap { max-width:720px; width:100%; margin:0 auto; display:grid; grid-template-rows:auto auto 1fr auto; row-gap:8px; align-items:start; text-align:center; min-height:0; height:100%; }',
      '.dc-center-bottom.single-box .dc-qa-wrap { display:flex; flex-direction:column; justify-content:center; align-items:center; }',
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
      '.dc-bubble { display:inline-block; padding:6px 12px; border-radius:12px; border:1px solid var(--border-soft); max-width:85%; word-wrap:break-word; box-shadow: 0 1px 0 rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.1); }',
      '.dc-bubble-me { background:rgba(125, 211, 252, 0.2); color:#0066cc; }',
      '.dc-bubble-partner { background:rgba(255, 77, 79, 0.2); color:#cc0000; }',
      '.dc-typing-indicator { display:none; margin-bottom:10px; }',
      '.dc-typing-indicator.show { display:block; }',
      '.dc-typing-dots { display:inline-block; }',
      '.dc-typing-dots span { animation:dcTyping 1.4s infinite; }',
      '.dc-typing-dots span:nth-child(2) { animation-delay:0.2s; }',
      '.dc-typing-dots span:nth-child(3) { animation-delay:0.4s; }',
      '@keyframes dcTyping { 0%, 60%, 100% { opacity:0.3; } 30% { opacity:1; } }',
      '.dc-controls { margin-top:4px; background:transparent; border:none; border-radius:0; padding:0; display:grid; grid-template-columns: 1fr auto; column-gap:8px; box-shadow:none; align-items:end; }',
      '.dc-input { flex:1; width:100%; min-width:0; box-sizing:border-box; padding:12px 14px; font-size:14px; border-radius:10px; border:1px solid var(--border); background:#ffffff; color:var(--text); outline:none; }',
      '.dc-textarea{ resize:none; height:auto; min-height:40px; max-height:120px; overflow-y:auto; line-height:1.35; padding:12px 14px; }',
      '.dc-btn { padding:10px 12px; border-radius:10px; border:1px solid var(--border); background:linear-gradient(180deg, #f0f0f0, #e8e8e8); color:var(--text); cursor:pointer; white-space:nowrap; }',
      '#dc-send { font-weight: bold; }',
      '.dc-btn:disabled { opacity:.5; cursor:not-allowed; }',
      '.dc-early-terminate { margin-top:8px; }',
      '#dc-end-chat-early { background: linear-gradient(135deg, #ff9800, #f57c00) !important; border-color: #ff9800 !important; font-weight: bold; }',
      '#dc-end-chat-early:hover { background: linear-gradient(135deg, #f57c00, #e65100) !important; }',
      '.dc-hint { font-size:14px !important; font-weight:bold; color:var(--muted); margin-top:2px !important; padding:0 10px; }','.dc-wait{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:10px;text-align:center;color:var(--muted); margin-top:24px; padding-top:24px; padding-top:28px;}','.dc-spinner{width:20px;height:20px;border:3px solid rgba(0,0,0,.2);border-top-color:#333;border-radius:50%;animation:dcspin 0.9s linear infinite;}','@keyframes dcspin{to{transform:rotate(360deg)}}',
      '@media (max-height: 760px){ .dc-root{ padding:12px; } .dc-grid{ gap:10px; } .dc-center{ grid-template-rows: minmax(0,50%) minmax(0,50%); } .dc-center-bottom.single-box{ padding:10px; } .dc-goal-title{ margin-bottom:10px; font-size:22px; } .dc-question{ max-height:3.2em; } .dc-answer-option span{ font-size:16px !important; } .dc-controls{ margin-top:4px; } }',
      '</style>'
    ].join('');
  }

//   function generateSidebarInstructions(questionType, minMessages = 10) {
//     console.log('[DyadicChat] generateSidebarInstructions called with questionType:', questionType);
//     const baseInstructions = `
// <div class="instr instr-aesthetic">
//   <style>
//     .instr-aesthetic .nice { margin: 0; padding-left: 1.2em; line-height: 1.6; }
//     .instr-aesthetic li { margin: 6px 0; }
//     .instr-aesthetic ol[type="a"] { margin-top: 6px; }
//     .instr-aesthetic h2 { margin-bottom: 10px; }
//     .consent-box h2 { margin: 0 0 12px 0; }
// </style>
//   <!-- <h2>Instructions</h2> -->
//   <ol class="nice">
//     <!-- <li>This is a collaborative task. You will be paired with another participant to solve a question.</li>
//     <li>You and your partner will each see different views of the same room.</li>
//     <li>You have to chat and collaborate with your partner in order to solve the question correctly.</li>
//     <li style="color: #ff6666;"><strong style="color: #ff6666;">For correctly answering the question, you will be rewarded with a bonus payment.</strong></li>
//     ${getQuestionTypeSpecificSidebarInstructions(questionType)}
//     <li>You can send a maximum of ${minMessages} messages to your partner.</li>
//     <li>You can submit an answer only after you have sent ${minMessages} messages to your partner.</li>
//     <li>Strict turn-taking:
//       <ol type="a">
//         <li>You cannot send two consecutive messages to your partner.</li>
//         <li>You must wait for your partner to reply before sending your next message.</li>
//       </ol>
//     </li>
//     <li>You may zoom in on the image to inspect details.</li>
//     <li>After the chat is completed, select the best option you think is correct and click "Submit Answer".</li>
//     <li>Do not share personal information.</li> -->
//     <li>This is a collaborative task. You will be connected with another participant via chat to solve a question.</li>
//     <li>You have to chat and collaborate with your partner in order to solve the question correctly.</li>
//     ${getQuestionTypeSpecificSidebarInstructions(questionType)}
//     <li>You can submit an answer only after you have sent ${minMessages} total messages to your partner.</li>
//     <li>Taking turns:
//       <ol type="a">
//         <li>Send a message only after your partner replies.</li>
//         <li>No two consecutive messages from the same person.</li>
//       </ol>
//     </li>
//     <li>You may zoom in on the image to inspect details.</li>
//     <li>After the messages are completed, select the best option you think is correct and click "Submit Answer".</li>
//     <li>Do not share personal information.</li>
//   </ol>
// </div>
// `;
//     return baseInstructions;
//   }

  function generateSidebarInstructions(questionType, minMessages = 10) {
    console.log('[DyadicChat] generateSidebarInstructions called with questionType:', questionType);
    const baseInstructions = `
<div class="instr instr-aesthetic">
  <style>
    .instr-aesthetic { color: #1a1a1a; }
    .instr-aesthetic .nice { margin: 0; padding-left: 1.2em; line-height: 1.6; color: #1a1a1a; }
    .instr-aesthetic li { margin: 6px 0; color: #1a1a1a; }
    .instr-aesthetic ol[type="a"] { margin-top: 6px; }
    .instr-aesthetic h2 { margin-bottom: 10px; color: #1a1a1a; }
    .consent-box h2 { margin: 0 0 12px 0; }
</style>
  <ol class="nice">
    <li>This is a collaborative task. You will be connected with another participant via chat to solve a question.</li>
    <li>You have to communicate and collaborate with your partner in order to solve the question correctly.</li>
    <li>Task Details (Read Carefully):
      <ol type="a">
        <li>You and your partner will each see a different view of the same room. Some objects might be visible in both views, while other objects might be visible in only one view.</li>
        <li>One of you will be the Answerer and the other one will be the Helper.</li>
        <li>If you are the Answerer, you will be given a multiple choice question about the room with one correct answer. Given the question, you have to seek help from your partner (Helper) to answer the question correctly.</li>
        <li>If you are the Helper, you won’t receive any question. Your task will be to help your partner (Answerer) to answer the question correctly.</li>
        <li>Overall, the goal is to discuss and collaborate with your partner to find the correct answer.</li>
        ${getQuestionTypeSpecificSidebarInstructions(questionType)}
      </ol>
    </li>
    <li>You and your partner will have a maximum of ${minMessages} messages each that you can send to each other.</li>
    <li>Note (taking turns in the conversation):
      <ol type="a">
        <li>The Answerer sends the first message.</li>
        <li>You cannot send consecutive messages, you have to wait for your partner to respond before sending another message.</li>
      </ol>
    </li>
    <li>If you are the Answerer, you can choose to terminate the conversation early by pressing the “End Chat and Answer Now” button if you think you have found the correct answer.</li>
    <li>After the conversation is complete (either by choosing to terminate, or the pair reaches the maximum number of allowed messages), the Answerer should select the best option they think is correct and click "Submit Answer".</li>
    <li style="color: #cc0000;"><strong style="color: #cc0000;">IMPORTANT: You must engage in a proper conversation and make a meaningful attempt to solve the question. If you terminate prematurely or do not engage properly, payment might not be issued.</strong></li>
    <li style="color: #cc0000;"><strong style="color: #cc0000;">IMPORTANT: Please avoid long pauses or delays in your chat responses during the task to maintain a smooth conversation. Do not exit or refresh the page until you’ve fully completed the task.</strong></li>
    <li>You will attempt 3 total questions in the entire session. Your assigned role (Answerer or Helper) might change across these 3 questions.</li>
    <li>You can zoom into the image to inspect details.</li>
    <li>Do not share personal information or engage in small talk. Please try to be respectful in your messages, and avoid using colloquial or slang language . </li>
    <li>Ensure that you have a stable internet connection throughout the conversations. If you get disconnected, your answer will not be recorded. </li>
  </ol>
</div>
`;
    return baseInstructions;
  }



  function getQuestionTypeSpecificSidebarInstructions(questionType) {
    switch(questionType) {
      case 'counting':
        return `<li style="color: #0066cc;"><strong>The task is to find the count of a given object.</strong></li>
                <li style="color: #0066cc;"><strong>You and your partner must make sure that you are counting the total number of unique instances of that object in the room while preventing overcounting or undercounting.</strong></li>
              `;
      case 'spatial':
        return `<li style="color: #0066cc;"><strong>In this task, the Answerer must determine the direction of a target object from their own viewpoint.</strong></li>
                <li style="color: #0066cc;"><strong>The Answerer cannot see the object directly—it is visible only to the Helper. To identify where the object is located, the Answerer must communicate with the Helper and use the information obtained to infer its direction relative to themselves.</strong></li>
                <li style="color: #cc0000;"><strong style="color: #cc0000;">Note: Here, the directions are relative to the Answerer's own orientation, not the room layout. For example, "Behind" refers to the space directly opposite the direction the Answerer is facing.</strong></li>
              `;
      case 'anchor':
        return `<li style="color: #0066cc;"><strong>The task is to find the object that is common in both your and your partner's views.</strong></li>
                <li style="color: #0066cc;"><strong>Only one of the objects in the options will be common to both the views. Other objects in the options will be present in only one of the views of the room - either of the Answerer or the Helper.</strong></li>
              `;
      case 'relative_distance':
        return `<li style="color: #0066cc;"><strong>The task is to find which of the objects in the options is either the farthest or the closest to the object mentioned in the question.</strong></li>
                <li style="color: #0066cc;"><strong>The objects in the options are visible either in only your view or only in your partner's view. Be careful, as what might be the closest / farthest in your view might not be the correct answer, even an object which is not at all in your view might be the correct answer.</strong></li>
              `;
      case 'perspective_taking':
        return `<li style="color: #0066cc;"><strong>In this task, the Answerer must determine the direction of an object from the Helper's point of view.</strong></li>
                <li style="color: #0066cc;"><strong>The object is visible only to the Answerer, not to the Helper. To identify where the object lies relative to the Helper, the Answerer must communicate with the Helper and use the information obtained to infer the Helper's orientation.</strong></li>
                <li style="color: #cc0000;"><strong style="color: #cc0000;">Note: Here, directions are defined from the Helper's perspective, not the Answerer's. For example, "Front" refers to the space directly ahead of the Helper's current line of sight.</strong></li>
              `;
      default:
        return `<li>You and your partner will see different perspectives of the same scene and need to work together to solve the question correctly.</li>`;
    }
  }

  // function getQuestionTypeSpecificSidebarInstructions(questionType) {
  //   switch(questionType) {
  //     case 'counting':
  //       return `<li style="color: #8bd5ff;"><strong>Task Details (Read Carefully):</strong>
  //             <ol type="i">
  //               <li style="color: #8bd5ff;"><strong>In this task, you and your partner will each see a different view of the same room. Some objects might be visible in both views, while other objects might be visible in only one view.</strong></li>
  //               <li style="color: #8bd5ff;"><strong>Both of you will be given a multiple choice question about the room with only one correct answer.</strong></li>
  //                <li style="color: #8bd5ff;"><strong>Example Question: "What is the total number of lamps in the room?"</strong><br><strong>&nbsp&nbspOptions:</strong></li>
  //                <ol type="a" style="margin-left: 20px;">
  //                  <li style="color: #8bd5ff;"><strong>4</strong></li>
  //                  <li style="color: #8bd5ff;"><strong>3</strong></li>
  //                  <li style="color: #8bd5ff;"><strong>5</strong></li>
  //                  <li style="color: #8bd5ff;"><strong>6</strong></li>
  //                </ol>
  //               <li style="color: #8bd5ff;"><strong>You might see 1 lamp in your view and your partner might see 2 lamps in their view. You both might also be seeing the same lamp, so you have to prevent overcounting or undercounting the lamps by discussing with your partner.</strong></li>
  //               <li style="color: #8bd5ff;"><strong>Overall, the goal is to discuss and collaborate with your partner to determine the correct answer.</strong></li>
  //               <li style="color: #ff6666;"><strong style="color: #ff6666;">If you correctly answer the question, you will be rewarded with a bonus payment.</strong></li>
  //             </ol>
  //             </li>`;
  //     case 'spatial':
  //       return `<li style="color: #8bd5ff;"><strong>Task Details (Read Carefully):</strong>
  //         <ol type="i">
  //         <li style="color: #8bd5ff;"><strong>In this task, you and your partner will each see a different view of the same room. Some objects might be visible in both views, while other objects might be visible in only one view.</strong></li>
  //         <li style="color: #8bd5ff;"><strong>One of you will be given a multiple choice question about the room with only one correct answer.</strong></li>
  //         <li style="color: #8bd5ff;"><strong>The task of the person who is given the question is to seek help from their partner to answer the question correctly. And the task of the other person is to help their partner answer the question correctly.</strong></li>
  //         <li style="color: #8bd5ff;"><strong>You can either be the person who has been given the question or the person who is helping the partner.</strong></li>
  //         <li style="color: #8bd5ff;"><strong>Example Question: "From your perspective, in which direction is the light green cushioned sofa with a rounded back, and a cylindrical armrest located?"</strong><br><strong>&nbsp&nbspOptions:</strong></li>
  //         <ol type="a" style="margin-left: 20px;">
  //           <li style="color: #8bd5ff;"><strong>left</strong></li>
  //           <li style="color: #8bd5ff;"><strong>behind-right</strong></li>
  //           <li style="color: #8bd5ff;"><strong>front-right</strong></li>
  //           <li style="color: #8bd5ff;"><strong>behind</strong></li>
  //         </ol>
  //         <li style="color: #8bd5ff;"><strong>The object mentioned in the question will not be in the view of the person who has been given the question.</strong></li>
  //         <li style="color: #8bd5ff;"><strong>Overall, the goal is to discuss and collaborate with your partner to determine the correct answer.</strong></li>
  //         <li style="color: #ff6666;"><strong style="color: #ff6666;">If the question is answered correctly, both you and your partner will be rewarded with a bonus payment.</strong></li>
  //       </ol>
  //       </li>`;
  //     case 'anchor':
  //       return `<li style="color: #8bd5ff;"><strong>Task Details (Read Carefully):</strong>
  //             <ol type="i">
  //               <li style="color: #8bd5ff;"><strong>In this task, you and your partner will each see a different view of the same room. Some objects might be visible in both views, while other objects might be visible in only one view.</strong></li>
  //               <li style="color: #8bd5ff;"><strong>Both of you will be given a multiple choice question about the room with only one correct answer.</strong></li>
  //                <li style="color: #8bd5ff;"><strong>Example Question: "Which object appears in both your view and your partner's view of the room?"</strong><br><strong>&nbsp&nbspOptions:</strong></li>
  //                <ol type="a" style="margin-left: 20px;">
  //                  <li style="color: #8bd5ff;"><strong>tall white wooden cabinet with a single compartment</strong></li>
  //                  <li style="color: #8bd5ff;"><strong>ceramic circular plant container</strong></li>
  //                  <li style="color: #8bd5ff;"><strong>square canvas wall art with gray background</strong></li>
  //                  <li style="color: #8bd5ff;"><strong>light pink fabric sofa with three cushions and rounded armrests</strong></li>
  //                </ol>
  //               <li style="color: #8bd5ff;"><strong>Overall, the goal is to discuss and collaborate with your partner to determine the correct answer.</strong></li>
  //               <li style="color: #ff6666;"><strong style="color: #ff6666;">If you correctly answer the question, you will be rewarded with a bonus payment.</strong></li>
  //             </ol>
  //             </li>`;
  //     case 'relative_distance':
  //       return `<li style="color: #8bd5ff;"><strong>Task Details (Read Carefully):</strong>
  //             <ol type="i">
  //               <li style="color: #8bd5ff;"><strong>In this task, you and your partner will each see a different view of the same room. Some objects might be visible in both views, while other objects might be visible in only one view.</strong></li>
  //               <li style="color: #8bd5ff;"><strong>Both of you will be given a two-choice question about the room with only one correct answer.</strong></li>
  //               <li style="color: #8bd5ff;"><strong>Example Question: "Which object among the options is closer to the sofa (long rectangular shape, rounded armrests, light beige patterned fabric)?"</strong><br><strong>&nbsp&nbspOptions:</strong></li>
  //               <ol type="a" style="margin-left: 20px;">
  //                 <li style="color: #8bd5ff;"><strong>rectangular light natural wood shelf with multiple square compartments holding small decor and paper stacks</strong></li>
  //                 <li style="color: #8bd5ff;"><strong>tall light brown wooden shelf with two vertical columns containing books and small decorative items</strong></li>
  //               </ol>
  //               <li style="color: #8bd5ff;"><strong>The object mentioned in the question will be in both views. However, one of the objects in the options will only be in your view and the other object in the options will only be in your partner's view.</strong></li>
  //               <li style="color: #8bd5ff;"><strong>Overall, the goal is to discuss and collaborate with your partner to determine the correct answer.</strong></li>
  //               <li style="color: #ff6666;"><strong style="color: #ff6666;">If you correctly answer the question, you will be rewarded with a bonus payment.</strong></li>
  //             </ol>
  //             </li>`;
  //     case 'perspective_taking':
  //       return `<li style="color: #8bd5ff;"><strong>Task Details (Read Carefully):</strong>
  //             <ol type="i">
  //               <li style="color: #8bd5ff;"><strong>In this task, you and your partner will each see a different view of the same room. Some objects might be visible in both views, while other objects might be visible in only one view.</strong></li>
  //               <li style="color: #8bd5ff;"><strong>One of you will be given a multiple choice question about the room with only one correct answer.</strong></li>
  //               <li style="color: #8bd5ff;"><strong>The task of the person who is given the question is to seek help from their partner to answer the question correctly. And the task of the other person is to provide help to their partner.</strong></li>
  //               <li style="color: #8bd5ff;"><strong>You can either be the person who has been given the question or the person who is helping the partner.</strong></li>
  //               <li style="color: #8bd5ff;"><strong>Example Question: "From your partner's perspective, where is the tall black wooden shelf with multiple square compartments filled with books and items located?"</strong><br><strong>&nbsp&nbspOptions:</strong></li>
  //               <ol type="a" style="margin-left: 20px;">
  //                 <li style="color: #8bd5ff;"><strong>left</strong></li>
  //                 <li style="color: #8bd5ff;"><strong>behind-right</strong></li>
  //                 <li style="color: #8bd5ff;"><strong>front-right</strong></li>
  //                 <li style="color: #8bd5ff;"><strong>behind</strong></li>
  //               </ol>
  //               <li style="color: #8bd5ff;"><strong>The object mentioned in the question will only be in the view of the person who has been given the question. And not in the view of the other person.</strong></li>
  //               <li style="color: #8bd5ff;"><strong>Overall, the goal is to discuss and collaborate with your partner to determine the correct answer.</strong></li>
  //               <li style="color: #ff6666;"><strong style="color: #ff6666;">If the question is answered correctly, both you and your partner will be rewarded with a bonus payment.</strong></li>
  //             </ol>
  //             </li>`;
  //     default:
  //       return `<li>You and your partner will see different perspectives of the same scene and need to work together to solve the question correctly.</li>`;
  //   }
  // }

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
          '  <div style="font-size:18px; color:var(--muted);">Waiting for another participant to join. Please keep this tab open. We&apos;ll begin as soon as you&apos;re paired. If you are not paired within 5 minutes, study will timeout.</div>',
          // '  <div style="font-size:13px; color:var(--muted);">Please keep this tab open. We'll begin as soon as you're paired.</div>',
          '</div>'
        ].join('');
      }

      function htmlChat(p){
        const item = (p && p.item) || null;
        const minMessages = (p && p.min_turns) || trial.min_messages;
        const hasQuestion = item && item.has_question;
        const hasOptions = item && item.has_options;
        
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

        // Generate different content based on whether user has a question
        let centerContent;
        if (hasQuestion && hasOptions) {
          // User has a question - show normal interface
          centerContent = [
            '<section class="dc-center-bottom single-box">',
            '  <div class="dc-qa-wrap">',
            '    <h3 class="dc-goal-title">Goal: Discuss with your partner to answer the following question correctly.</h3>',
            '    <div class="dc-question">', goalQ, '</div>',
            '    <div id="dc-answer-group" class="dc-answers">',
            opts.map(function(opt, index){
              return [
                '<label class="dc-answer-option">',
                '  <input type="radio" name="dc-answer" value="', String(index), '" disabled />',
                '  <span>', String(opt), '</span>',
                '</label>'
              ].join('');
            }).join(''),
            '    </div>',
            '    <div class="dc-availability-note">Note: Submit button becomes accessible when ' + String(minMessages) + ' messages are sent.</div>',
            '    <button id="dc-submit" class="dc-btn dc-submit" disabled>Submit Answer</button>',
            '  </div>',
            '</section>'
          ].join('');
        } else {
          // User has no question - show helper interface
          centerContent = [
            '<section class="dc-center-bottom single-box">',
            '  <div class="dc-qa-wrap">',
            '    <h3 class="dc-goal-title">Goal: Help your partner answer their question correctly.</h3>',
            '    <div class="dc-question" style="color: #1a1a1a; font-style: italic;">',
            '      Your role is to help your partner by discussing what you see in the image and providing information that will help them answer their question correctly.',
            '    </div>',
            '    <div class="dc-availability-note" style="color: #1a1a1a;">',
            '      You will automatically proceed to the next page after either ' + String(minMessages) + ' messages are exchanged or the chat is terminated early by your partner.',
            '    </div>',
            '  </div>',
            '</section>'
          ].join('');
        }

        return styleTag() + [
          '<div class="dc-root">',
          '  <div class="dc-grid">',
          '    <section class="dc-panel dc-left" style="overflow:auto; min-height:0;">',
                    '      <div class="dc-instructions-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding: 10px; background: #f0f0f0; border-radius: 8px;">',
                    '        <h3 style="margin: 0; color: var(--text);">Instructions</h3>',
                    '        <button id="toggle-instructions" style="background: #8bd5ff; color: #000; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Minimize</button>',
                    '      </div>',
                    '      <div id="dc-instructions-content" class="dc-instructions">', (function() {
                      // Use server question type for sidebar instructions if available, otherwise fall back to item question type
                      const questionTypeForInstructions = p.server_question_type || (p && p.item && p.item.question_type) || 'all_types';
                      console.log('[DyadicChat] Generating sidebar instructions for question_type:', questionTypeForInstructions);
                      return generateSidebarInstructions(questionTypeForInstructions, minMessages);
                    })(), '</div>',
          '    </section>',
          '    <section class="dc-center">',
          '      <div class="dc-image">', imgHtml, '</div>',
          centerContent,
          '    </section>',
          '    <section class="dc-panel dc-right">',
          '      <div class="dc-title-row">',
          '        <div class="dc-title">ChatBox</div>',
          '        <div class="dc-small" style="font-size:15px; font-weight:bold;">',
          (p && p.questionNumber && p.totalQuestions ?
            '          <div style="margin-bottom:4px; font-size:15px; color:#0066cc;">Question ' + String(p.questionNumber) + ' of ' + String(p.totalQuestions) + '</div>' :
            ''
          ),
          '          <span>Number of Messages&nbsp;</span>',
          '          <span id="dc-messages">0</span> / <span id="dc-messages-total">', String(minMessages), '</span>',
          '        </div>',
          '      </div>',
          '      <div id="dc-chat" class="dc-chatbox" aria-live="polite"></div>',
          '      <div class="dc-controls">',
          '        <textarea id="dc-msg" class="dc-input dc-textarea" rows="1" placeholder="Type your message"></textarea>',
          '        <button id="dc-send" class="dc-btn">Send</button>',
          '      </div>',
          '      <div id="dc-early-terminate" class="dc-early-terminate" style="display: none; margin-top: 8px;">',
          '        <button id="dc-end-chat-early" class="dc-btn" style="background: linear-gradient(135deg, #ff9800, #f57c00); width: 100%;">End Chat & Answer Now</button>',
          '      </div>',
          '      <div id="dc-hint" class="dc-small dc-hint">Only one message at a time. Wait for your partner to respond.</div>',
          '    </section>',
          '  </div>',
          '</div>'
        ].join('');
      }

      // Use existing socket if provided, otherwise create new one
      const socket = trial.existingSocket || io(trial.socketUrl, { query: { pid: pidLabel } });
      let myTurn = false, chatClosed = false;
      let msgCount = 0;
      let heartbeatInterval = null;
      let lastPongTime = Date.now();
      let correctAnswerIndex = null; // Store the correct answer index for this user
      let correctAnswerText = null; // Store the correct answer text for this user
      let answerOptions = null; // Store the answer options array
      let t0 = null; // Will be set when users get paired
      let pendingTurnEvent = null; // Store turn event if it arrives before UI is ready
      let typingTimeout = null; // Timeout for stopping typing indicator
      let isTyping = false; // Track if user is currently typing
      let partnerTypingTimeout = null; // Timeout for hiding partner's typing indicator

      function redirectToProlific() {
        // Redirect to Prolific completion URL after a short delay
        setTimeout(() => {
          window.location.href = 'https://app.prolific.com/submissions/complete?cc=CSCCU793';
        }, 2000); // 2 second delay to show completion message
      }

      function showBlocked(msg){
        display_element.innerHTML = styleTag() + '<div class="dc-wait"><div class="dc-spinner"></div><div style="font-size:18px;color:var(--muted);margin-top:8px;">' + msg + '</div></div>';
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
        console.log('[DyadicChat] updateMessages - myTurn:', myTurn, 'chatClosed:', chatClosed, 'allow:', allow, 'sendBtn found:', !!sendBtn);
        if (sendBtn) {
          sendBtn.disabled = !allow;
          console.log('[DyadicChat] updateMessages - sendBtn disabled set to:', !allow);
        } else {
          console.warn('[DyadicChat] updateMessages - sendBtn not found in DOM');
        }
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

      function showTypingIndicator(){
        const chatbox = document.getElementById('dc-chat');
        if (!chatbox) return;

        // Check if typing indicator already exists
        let indicator = document.getElementById('dc-typing-indicator');
        if (!indicator) {
          // Create typing indicator if it doesn't exist
          indicator = document.createElement('div');
          indicator.id = 'dc-typing-indicator';
          indicator.className = 'dc-typing-indicator dc-row dc-partner';
          const bubble = document.createElement('span');
          bubble.className = 'dc-bubble dc-bubble-partner';
          const typingDots = document.createElement('span');
          typingDots.className = 'dc-typing-dots';
          typingDots.innerHTML = 'Partner is typing<span>.</span><span>.</span><span>.</span>';
          bubble.appendChild(typingDots);
          indicator.appendChild(bubble);
          chatbox.appendChild(indicator);
        }

        indicator.classList.add('show');
        chatbox.scrollTop = chatbox.scrollHeight;
      }

      function hideTypingIndicator(){
        const indicator = document.getElementById('dc-typing-indicator');
        if (indicator) {
          indicator.classList.remove('show');
          // Optionally remove the element after a delay to clean up
          // But keeping it is fine for performance
        }
      }

      function sendMsg(){
        const el = document.getElementById('dc-msg');
        const text = (el && el.value || '').trim(); if (!text) return;
        if (!myTurn || chatClosed) {
          console.log('[DyadicChat] sendMsg blocked - myTurn:', myTurn, 'chatClosed:', chatClosed);
          return;
        }
        console.log('[DyadicChat] sendMsg - sending message, myTurn:', myTurn, 'chatClosed:', chatClosed);

        // Stop typing indicator when sending message
        stopTyping();

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

      function endChatEarly(){
        console.log('[DyadicChat] User clicked End Chat Early button');

        // Stop typing indicator
        stopTyping();
        hideTypingIndicator();
        if (partnerTypingTimeout) {
          clearTimeout(partnerTypingTimeout);
          partnerTypingTimeout = null;
        }

        // Emit event to server that this user is ending the chat early
        socket.emit('chat:early_termination');

        // Close the chat
        chatClosed = true;

        // Update UI elements
        updateMessages();

        // Disable chat input and send button
        const msgInput = document.getElementById('dc-msg');
        const sendBtn = document.getElementById('dc-send');
        if (msgInput) msgInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;

        // Hide the early termination button
        const earlyTerminateDiv = document.getElementById('dc-early-terminate');
        if (earlyTerminateDiv) {
          earlyTerminateDiv.style.display = 'none';
          console.log('[DyadicChat] Early termination button hidden after click');
        }

        // Track chat end time
        chatEndTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

        // Update hint to show chat is closed
        const hint = document.getElementById('dc-hint');
        if (hint) {
          hint.textContent = 'Chat ended early. You can now submit your answer.';
        }

        // If user has no question, automatically proceed to survey
        if (!window.__userHasQuestion || !window.__userHasOptions) {
          console.log('[DyadicChat] Chat ended early and user has no question, proceeding to survey');
          setTimeout(() => {
            submitAnswer(); // This will handle the no-question case
          }, 1000); // Small delay to ensure UI updates
        }

        console.log('[DyadicChat] Chat ended early by user');
      }

      function submitAnswer(){
        // Check if user has a question to answer
        if (!window.__userHasQuestion || !window.__userHasOptions) {
          // User has no question - just notify server
          console.log('[DyadicChat] User has no question, notifying server');
          
          // Safety check: ensure t0 is set (should be set when paired)
          if (t0 === null) {
            console.warn('[DyadicChat] t0 not set, using current time as fallback');
            t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          }
          
          const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const rt = Math.round(nowTs - t0);
          
          // Track answer submit time
          answerSubmitTime = nowTs;
          
          // Store empty answer data
          window.__answerData = { messages: Math.floor(msgCount/2), choice: null, rt: rt, pid: pidLabel };
          
          // Store socket reference
          window.__socket = socket;
          
          // Notify server (no answer to submit)
          socket.emit('answer:submit', { choice: null, rt: rt });

          // Show waiting message - will transition to next question or survey
          display_element.innerHTML = '<div style="padding:40px; font-size:20px; text-align:center; color:var(--text); background:var(--bg); min-height:100vh;">Waiting for your partner to finish...</div>';
          return;
        }
        
        // User has a question - proceed with normal answer submission
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
        
        // Store the answer data
        window.__answerData = { messages: Math.floor(msgCount/2), choice: el.value, rt: rt, pid: pidLabel };
        
        // Store socket reference
        window.__socket = socket;
        
        socket.emit('answer:submit', { choice: el.value, rt: rt });
        
        // Store last answer for survey feedback (if this is the last question)
        window.__lastAnswer = el.value;

        // Show waiting message - will transition to next question or survey
        display_element.innerHTML = '<div style="padding:40px; font-size:20px; text-align:center; color:var(--text); background:var(--bg); min-height:100vh;">Answer submitted! Waiting for your partner to finish...</div>';
      }

      function showCombinedFeedbackAndSurvey(userAnswer) {
        // For multi-question sessions, skip individual question feedback
        // Only show a simple completion message before the survey
        let feedbackSection = `
          <!-- Completion Section -->
            <div style="text-align:center; margin-bottom:40px;">
            <h2 style="margin-bottom:30px; color:var(--text);">All Questions Completed!</h2>

            <div style="background:#ffffff; padding:30px; border-radius:12px; border:1px solid var(--border); margin-bottom:30px; box-shadow: var(--shadow);">
              <div style="font-size:24px; margin-bottom:20px; color:#4CAF50;">
                ✓ Thank you for completing all the questions!
                </div>
                
              <div style="font-size:18px; margin-bottom:20px; color:var(--text);">
                You and your partner have successfully completed all the collaborative tasks. Please proceed to fill out the survey below.
                </div>
                
              <div style="font-size:16px; color:#0066cc; margin-top:15px;">
                Great job working together!
                </div>
              </div>
            </div>
          `;
        
        const feedbackHTML = `
          <div style="max-width:800px; margin:0 auto; padding:20px 20px; color:var(--text); text-align:left; background:var(--bg); min-height:100vh;">
            ${feedbackSection}

            <!-- Survey Section -->
            <h2 style="text-align:center; margin-bottom:30px; color:var(--text);">Post-Study Survey</h2>
            <p style="margin-bottom:25px; font-size:16px; line-height:1.5; color:var(--text);">Thank you for participating! Please answer a few brief questions about your experience.</p>
            
            <form id="post-study-survey" style="background:#ffffff; padding:25px; border-radius:12px; border:1px solid var(--border); box-shadow: var(--shadow);">
              
              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#0066cc;">How difficult was the collaborative task?</label>
                <select name="difficulty" required style="width:100%; padding:10px; border-radius:8px; background:#ffffff; color:var(--text); border:1px solid #999999;">
                  <option value="">Select difficulty level</option>
                  <option value="very_easy">Very Easy</option>
                  <option value="easy">Easy</option>
                  <option value="moderate">Moderate</option>
                  <option value="difficult">Difficult</option>
                  <option value="very_difficult">Very Difficult</option>
                </select>
              </div>

              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#0066cc;">Were the instructions clear and easy to follow throughout the task?</label>
                <select name="instructions_clear" id="instructions_clear" required style="width:100%; padding:10px; border-radius:8px; background:#ffffff; color:var(--text); border:1px solid #999999;">
                  <option value="">Select an option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <div id="instructions_feedback" style="margin-top:10px; display:none;">
                  <label style="display:block; margin-bottom:8px; font-weight:bold; color:#ff9800;">Please briefly explain what was unclear about the instructions:</label>
                  <textarea name="instructions_feedback" rows="3" style="width:100%; padding:10px; border-radius:8px; background:#ffffff; color:var(--text); border:1px solid #999999; resize:vertical;" placeholder="Please provide brief feedback about what was unclear..."></textarea>
                </div>
              </div>

              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#0066cc;">Did you have a clear understanding of both the task and the question being asked?</label>
                <select name="task_understanding" id="task_understanding" required style="width:100%; padding:10px; border-radius:8px; background:#ffffff; color:var(--text); border:1px solid #999999;">
                  <option value="">Select an option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <div id="task_feedback" style="margin-top:10px; display:none;">
                  <label style="display:block; margin-bottom:8px; font-weight:bold; color:#ff9800;">Please briefly explain what was unclear about the task or question:</label>
                  <textarea name="task_feedback" rows="3" style="width:100%; padding:10px; border-radius:8px; background:#ffffff; color:var(--text); border:1px solid #999999; resize:vertical;" placeholder="Please provide brief feedback about what was unclear..."></textarea>
                </div>
              </div>

              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#0066cc;">Did you use pen and paper to sketch or do any rough work while answering the question?</label>
                <select name="pen_paper" id="pen_paper" required style="width:100%; padding:10px; border-radius:8px; background:#ffffff; color:var(--text); border:1px solid #999999;">
                  <option value="">Select an option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <div id="pen_paper_followup" style="margin-top:10px; display:none;">
                  <label style="display:block; margin-bottom:8px; font-weight:bold; color:#ff9800;">Did you sketch a rough map of the room to help answer the question?</label>
                  <select name="sketched_map" id="sketched_map" required style="width:100%; padding:10px; border-radius:8px; background:#ffffff; color:var(--text); border:1px solid #999999;">
                    <option value="">Select an option</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>

              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#0066cc;">How well did you communicate with your partner?</label>
                <select name="communication" required style="width:100%; padding:10px; border-radius:8px; background:#ffffff; color:var(--text); border:1px solid #999999;">
                  <option value="">Select communication quality</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>

              <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#0066cc;">How confident are you in your final answer? (1 = Not confident, 5 = Very confident)</label>
                <select name="confidence" required style="width:100%; padding:10px; border-radius:8px; background:#ffffff; color:var(--text); border:1px solid #999999;">
                  <option value="">Select confidence level</option>
                  <option value="1">1 - Not confident</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5 - Very confident</option>
                </select>
              </div>

              <div style="margin-bottom:25px;">
                <label style="display:block; margin-bottom:8px; font-weight:bold; color:#0066cc;">Any additional comments about the study?</label>
                <textarea name="comments" rows="3" style="width:100%; padding:10px; border-radius:8px; background:#ffffff; color:var(--text); border:1px solid #999999; resize:vertical;" placeholder="Optional comments..."></textarea>
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
            display_element.innerHTML = '<div style="padding:40px; font-size:20px; text-align:center; color:var(--text); background:var(--bg); min-height:100vh;">Thank you for completing the study! Your responses have been submitted. Redirecting to Prolific...</div>';
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
              // Stop typing indicator when message is sent
              stopTyping();
            }
          });

          // Typing indicator functionality
          msgEl.addEventListener('input', () => {
            if (!chatClosed) {
              handleTyping();
            }
          });

          msgEl.addEventListener('blur', () => {
            // Stop typing indicator when user leaves the input field
            stopTyping();
          });
        }
      }

      function handleTyping(){
        // Clear existing timeout
        if (typingTimeout) {
          clearTimeout(typingTimeout);
        }

        // If not already typing, emit typing start event
        if (!isTyping) {
          isTyping = true;
          socket.emit('typing:start');
        }

        // Set timeout to stop typing after 3 seconds of inactivity
        typingTimeout = setTimeout(() => {
          stopTyping();
        }, 3000);
      }

      function stopTyping(){
        if (isTyping) {
          isTyping = false;
          socket.emit('typing:stop');
        }
        if (typingTimeout) {
          clearTimeout(typingTimeout);
          typingTimeout = null;
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
            display_element.innerHTML = '<div class="dc-wait"><div class="dc-spinner"></div><div style="font-size:18px; text-align:center; color:var(--text);">Sorry — no partner joined within 5 minutes.</div><div style="font-size:13px;color:var(--muted); text-align:center;">You can close this tab and try again later.</div></div>';
            if (window.jsPsych) { window.jsPsych.finishTrial({ pairing_timeout: true }); }
          }} catch(e){}
        }, TIMEOUT_MS);
        window.__pairTimer = timer;
      })();
/* socket already defined */
/* duplicate removed */
      /* duplicate removed */
      /* duplicate removed */

      // Check if we already have pairing data from instructions phase
      if (window.pairingData && window.pairingData.item) {
        console.log('[DyadicChat] Using existing pairing data from instructions phase');
        // Request the full paired event from server
        socket.emit('request:paired_data');
      }
      
      socket.on('paired', function(p){ window.__pairedOnce = true; try{ if(window.__pairTimer){ clearTimeout(window.__pairTimer); delete window.__pairTimer; } }catch(e){}
        // Set reaction time start point when users get paired
        t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        
        // Set chat begin time
        chatBeginTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        
        // Verify role consistency
        const expectedRole = window.userRole; // Set by paired:instructions
        const receivedRole = p.role; // From paired event
        if (expectedRole && receivedRole && expectedRole !== receivedRole) {
          console.error(`[DyadicChat] ROLE MISMATCH ERROR! Expected role from instructions: ${expectedRole}, but received role in paired event: ${receivedRole}`);
          console.error(`[DyadicChat] This indicates a server-side bug. has_question=${p.item.has_question}, expected answerer=${expectedRole === 'answerer'}`);
        } else if (expectedRole && receivedRole) {
          console.log(`[DyadicChat] Role verified: ${receivedRole} (matches instructions)`);
        }
        
        // Store user's question status and answer data
        window.__userHasQuestion = p.item.has_question;
        window.__userHasOptions = p.item.has_options;

        console.log('[DyadicChat] Paired payload:', p);
        console.log('[DyadicChat] User has question:', p.item.has_question);
        console.log('[DyadicChat] User has options:', p.item.has_options);
        console.log('[DyadicChat] Role from event:', p.role, 'Role from instructions:', window.userRole);
        console.log('[DyadicChat] Item data:', p.item);
        
        if (p.item.has_question && p.item.has_options) {
          // Store the correct answer index, text, and options for this user
          correctAnswerIndex = p.item.correct_answer;
          answerOptions = p.item.options;
          correctAnswerText = answerOptions[correctAnswerIndex];

          console.log('[DyadicChat] User has question with options - showing early termination button');

        }
        
        display_element.innerHTML = htmlChat(p);
        let pairedPayload = p;

        // Now that HTML is rendered, we can safely access DOM elements
        setTimeout(() => {
          if (p.item.has_question && p.item.has_options) {
            console.log('[DyadicChat] User has question with options - showing early termination button');

            // Show early termination button for users with questions
            const earlyTerminateDiv = document.getElementById('dc-early-terminate');
            if (earlyTerminateDiv) {
              earlyTerminateDiv.style.display = 'block';
              console.log('[DyadicChat] Early termination button shown');
            } else {
              console.log('[DyadicChat] Early termination div not found!');
            }
          } else {
            console.log('[DyadicChat] User has no question or no options - hiding early termination button');

            // Hide early termination button for helper users
            const earlyTerminateDiv = document.getElementById('dc-early-terminate');
            if (earlyTerminateDiv) {
              earlyTerminateDiv.style.display = 'none';
              console.log('[DyadicChat] Early termination button hidden');
            } else {
              console.log('[DyadicChat] Early termination div not found!');
            }
          }

          // Set up event listeners
        const sendBtn = document.getElementById('dc-send');
        if (sendBtn) sendBtn.addEventListener('click', sendMsg);
        const submitBtn = document.getElementById('dc-submit');
        if (submitBtn) submitBtn.addEventListener('click', submitAnswer);
          const endChatEarlyBtn = document.getElementById('dc-end-chat-early');
          if (endChatEarlyBtn) endChatEarlyBtn.addEventListener('click', endChatEarly);
        }, 0);
        
        // Add instructions toggle functionality
        const toggleButton = document.getElementById('toggle-instructions');
        const instructionsContent = document.getElementById('dc-instructions-content');
        let isMinimized = true; // Default to minimized

        if (toggleButton && instructionsContent) {
          // Set initial state to minimized
          instructionsContent.style.display = 'none';
          toggleButton.textContent = 'Expand';
          
          toggleButton.addEventListener('click', function() {
            if (isMinimized) {
              instructionsContent.style.display = 'block';
              toggleButton.textContent = 'Minimize';
              isMinimized = false;
            } else {
              instructionsContent.style.display = 'none';
              toggleButton.textContent = 'Expand';
              isMinimized = true;
            }
          });
        }
        
        setupTextarea();
        setupZoom();
        startHeartbeat(); // Start heartbeat monitoring
      });

      socket.on('chat:message', function(msg){
        // Hide typing indicator when message is received
        hideTypingIndicator();
        if (partnerTypingTimeout) {
          clearTimeout(partnerTypingTimeout);
          partnerTypingTimeout = null;
        }
        addLine('Partner', msg.text);
        msgCount += 1;
        updateMessages();
      });
      socket.on('typing:start', function(){
        // Show typing indicator
        showTypingIndicator();

        // Clear existing timeout
        if (partnerTypingTimeout) {
          clearTimeout(partnerTypingTimeout);
        }

        // Auto-hide after 5 seconds if no message is received
        partnerTypingTimeout = setTimeout(() => {
          hideTypingIndicator();
        }, 5000);
      });
      socket.on('typing:stop', function(){
        // Hide typing indicator
        hideTypingIndicator();
        if (partnerTypingTimeout) {
          clearTimeout(partnerTypingTimeout);
          partnerTypingTimeout = null;
        }
      });
      socket.on('turn:you', function(){
        console.log('[DyadicChat] Received turn:you event - enabling send button');
        myTurn = true;
        chatClosed = false; // Ensure chat is not closed
        pendingTurnEvent = 'you'; // Store for later processing if needed
        console.log('[DyadicChat] turn:you - state updated: myTurn=true, chatClosed=false');
        // Use multiple setTimeout calls to ensure DOM is ready and state is updated
        setTimeout(() => {
          console.log('[DyadicChat] turn:you - calling updateMessages, myTurn:', myTurn, 'chatClosed:', chatClosed);
          updateMessages();
        }, 0);
        // Also update after a short delay to catch any timing issues
        setTimeout(() => {
          console.log('[DyadicChat] turn:you - delayed updateMessages call');
          updateMessages();
        }, 100);
        setTimeout(() => {
          console.log('[DyadicChat] turn:you - final updateMessages call');
          updateMessages();
        }, 500);
      });
      socket.on('turn:wait', function(){
        console.log('[DyadicChat] Received turn:wait event - disabling send button');
        myTurn = false;
        pendingTurnEvent = 'wait'; // Store for later processing if needed
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
          console.log('[DyadicChat] turn:wait - updating messages, myTurn:', myTurn);
          updateMessages();
        }, 0);
        setTimeout(() => {
          console.log('[DyadicChat] turn:wait - delayed updateMessages call');
          updateMessages();
        }, 100);
      });
      socket.on('chat:closed', function(){ 
        chatClosed = true; 

        // Stop typing indicator and hide partner's typing indicator
        stopTyping();
        hideTypingIndicator();
        if (partnerTypingTimeout) {
          clearTimeout(partnerTypingTimeout);
          partnerTypingTimeout = null;
        }

        updateMessages();
        
        // Track chat end time
        chatEndTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        
        // If user has no question (helper agent), automatically submit
        // This notifies the server that they've completed the question
        if (!window.__userHasQuestion || !window.__userHasOptions) {
          console.log('[DyadicChat] Chat closed and user has no question, auto-submitting');
          setTimeout(() => {
            submitAnswer(); // Auto-submit for helper agents
          }, 500); // Small delay to ensure UI updates
        } else {
          // User has a question - they can manually submit
          console.log('[DyadicChat] Chat closed, user can submit answer');
        }
      });
      socket.on('chat:early_termination', function(){
        console.log('[DyadicChat] Other user ended chat early');
        chatClosed = true;

        // Stop typing indicator and hide partner's typing indicator
        stopTyping();
        hideTypingIndicator();
        if (partnerTypingTimeout) {
          clearTimeout(partnerTypingTimeout);
          partnerTypingTimeout = null;
        }

        updateMessages();

        // Track chat end time
        chatEndTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

        // Update hint to show chat ended early by partner
        const hint = document.getElementById('dc-hint');
        if (hint) {
          if (!window.__userHasQuestion || !window.__userHasOptions) {
            hint.textContent = 'Your partner ended the chat early. Waiting...';
          } else {
            hint.textContent = 'Your partner ended the chat early. You can now submit your answer.';
          }
        }

        // Disable chat input and send button
        const msgInput = document.getElementById('dc-msg');
        const sendBtn = document.getElementById('dc-send');
        if (msgInput) msgInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;

        // Hide early termination button if visible
        const earlyTerminateDiv = document.getElementById('dc-early-terminate');
        if (earlyTerminateDiv) {
          earlyTerminateDiv.style.display = 'none';
        }

        // If user has no question (helper agent), automatically submit
        if (!window.__userHasQuestion || !window.__userHasOptions) {
          console.log('[DyadicChat] Chat ended early and user has no question, auto-submitting');
          setTimeout(() => {
            submitAnswer(); // Auto-submit for helper agents
          }, 500);
        } else {
          // User has a question - they can manually submit
          console.log('[DyadicChat] Chat ended early by partner, user can submit answer');
        }
      });

      // Handle transition to next question
      socket.on('next_question', function(p){
        console.log('[DyadicChat] Received next question event:', p);

        // Show transition screen briefly before loading next question
        display_element.innerHTML = `
          <div style="padding:40px; font-size:20px; text-align:center; color:var(--text); background:var(--bg); min-height:100vh;">
            <div style="margin-bottom:20px;">
              <div class="dc-spinner" style="margin:0 auto;"></div>
            </div>
            <div style="margin-top:20px;">
              Loading next question...
            </div>
            <div style="margin-top:10px; font-size:16px; color:#0066cc;">
              Question ${p.questionNumber} of ${p.totalQuestions}
            </div>
          </div>
        `;

        // Brief delay before showing the new question for smoother transition
        setTimeout(() => {
          // Reset state for new question
          msgCount = 0;
          chatClosed = false;
          myTurn = false; // Will be set by turn:you or turn:wait from server

          // Reset typing indicator state
          stopTyping();
          hideTypingIndicator();
          if (partnerTypingTimeout) {
            clearTimeout(partnerTypingTimeout);
            partnerTypingTimeout = null;
          }
          isTyping = false;

          // Update pairedPayload with new question data (used by updateMessages)
          pairedPayload = p;

          // Update user's question status
          window.__userHasQuestion = p.item.has_question;
          window.__userHasOptions = p.item.has_options;

          if (p.item.has_question && p.item.has_options) {
            // Store the correct answer index, text, and options for this user
            correctAnswerIndex = p.item.correct_answer;
            answerOptions = p.item.options;
            correctAnswerText = answerOptions[correctAnswerIndex];
          }

          // Reset timing for new question
          t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          chatBeginTime = t0;
          firstMessageTime = null;
          chatEndTime = null;
          answerSubmitTime = null;

          // Update display with new question
          display_element.innerHTML = htmlChat(p);

        // Setup UI for new question
        setTimeout(() => {
          if (p.item.has_question && p.item.has_options) {
            const earlyTerminateDiv = document.getElementById('dc-early-terminate');
            if (earlyTerminateDiv) {
              earlyTerminateDiv.style.display = 'block';
            }
          } else {
            const earlyTerminateDiv = document.getElementById('dc-early-terminate');
            if (earlyTerminateDiv) {
              earlyTerminateDiv.style.display = 'none';
            }
          }

          // Remove old event listeners before adding new ones to prevent duplicates
          const sendBtn = document.getElementById('dc-send');
          const submitBtn = document.getElementById('dc-submit');
          const endChatEarlyBtn = document.getElementById('dc-end-chat-early');

          // Clone elements to remove all event listeners, then re-add
          if (sendBtn) {
            const newSendBtn = sendBtn.cloneNode(true);
            sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
            newSendBtn.addEventListener('click', sendMsg);
          }
          if (submitBtn) {
            const newSubmitBtn = submitBtn.cloneNode(true);
            submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
            newSubmitBtn.addEventListener('click', submitAnswer);
          }
          if (endChatEarlyBtn) {
            const newEndChatBtn = endChatEarlyBtn.cloneNode(true);
            endChatEarlyBtn.parentNode.replaceChild(newEndChatBtn, endChatEarlyBtn);
            newEndChatBtn.addEventListener('click', endChatEarly);
          }

          // Add instructions toggle
          const toggleButton = document.getElementById('toggle-instructions');
          const instructionsContent = document.getElementById('dc-instructions-content');
          if (toggleButton && instructionsContent) {
            let isMinimized = true;
            instructionsContent.style.display = 'none';
            toggleButton.textContent = 'Expand';
            // Remove old onclick and add new one
            toggleButton.onclick = function() {
              if (isMinimized) {
                instructionsContent.style.display = 'block';
                toggleButton.textContent = 'Minimize';
                isMinimized = false;
              } else {
                instructionsContent.style.display = 'none';
                toggleButton.textContent = 'Expand';
                isMinimized = true;
              }
            };
          }

          setupTextarea();
          setupZoom();

          // Check if we have a pending turn event that arrived before UI was ready
          if (pendingTurnEvent === 'you') {
            console.log('[DyadicChat] Processing pending turn:you event that arrived before UI was ready');
            myTurn = true;
            chatClosed = false;
          } else if (pendingTurnEvent === 'wait') {
            console.log('[DyadicChat] Processing pending turn:wait event that arrived before UI was ready');
            myTurn = false;
          }
          pendingTurnEvent = null; // Clear pending event

          // Initial update - button state will reflect current myTurn state
          updateMessages();

          // Set up a polling mechanism to check for turn state updates
          // This ensures the button state is correct even if turn events are delayed
          let turnCheckInterval = null;
          let turnCheckCount = 0;
          const maxTurnChecks = 15; // Check for 7.5 seconds (15 * 500ms) to catch delayed events

          turnCheckInterval = setInterval(() => {
            turnCheckCount++;
            console.log('[DyadicChat] Turn check #' + turnCheckCount + ' - myTurn:', myTurn, 'chatClosed:', chatClosed);
            updateMessages();

            if (turnCheckCount >= maxTurnChecks) {
              clearInterval(turnCheckInterval);
              console.log('[DyadicChat] Stopped turn checking after', maxTurnChecks, 'checks');
              // Final check - if still false, log warning
              if (!myTurn && !chatClosed) {
                console.warn('[DyadicChat] WARNING: myTurn is still false after', maxTurnChecks, 'checks. Turn event may not have been received.');
              }
            }
          }, 500); // Check every 500ms

          // Also schedule a final delayed update to catch turn events that arrive after UI setup
          setTimeout(() => {
            console.log('[DyadicChat] Final delayed updateMessages after next_question UI setup');
            if (turnCheckInterval) {
              clearInterval(turnCheckInterval);
            }
            updateMessages();
            // Final state check
            console.log('[DyadicChat] Final state check - myTurn:', myTurn, 'chatClosed:', chatClosed);
          }, 4000); // 4 seconds should be enough for server's 1.5s delay + 100ms + network latency
        }, 0);
        }, 800); // 0.8 second delay for client-side transition (server already has 1.5s delay)
      });

      // Handle all questions complete - proceed to survey
      socket.on('all_questions_complete', function(){
        console.log('[DyadicChat] All questions completed, proceeding to survey');
        showCombinedFeedbackAndSurvey(window.__lastAnswer || null);
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
      try { display_element.innerHTML = '<div style="padding:40px; font-size:20px; text-align:center; color:var(--text); background:var(--bg); min-height:100vh;">Your partner disconnected or closed the tab. This session has ended.</div>'; } catch(e){}
      try { window.jsPsych.finishTrial({ ended: 'partner_disconnect' }); } catch(e){}
    });

    socket.on('connection_lost', function(){
        stopHeartbeat();
      try { display_element.innerHTML = '<div style="padding:40px; font-size:20px; text-align:center; color:#cc0000; background:var(--bg); min-height:100vh;">Connection lost. Please refresh the page to start a new session.</div>'; } catch(e){}
      try { window.jsPsych.finishTrial({ ended: 'connection_lost' }); } catch(e){}
      });

    }
  }

  DyadicChat.info = info;
  window.jsPsychDyadicChat = DyadicChat;
})();