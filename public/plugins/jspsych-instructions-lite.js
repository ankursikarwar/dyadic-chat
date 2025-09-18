(function(){
  class JsPsychInstructionsLite {
    constructor(jsPsych){ this.jsPsych = jsPsych; }
    trial(display_element, trial){
      const pages = Array.isArray(trial.pages) ? trial.pages : [];
      let idx = 0;
      const render = () => {
        const prevBtn = trial.show_clickable_nav && idx>0 ? '<button class="jspsych-btn" id="instr-prev">' + (trial.button_label_previous||'Previous') + '</button>' : '';
        const nextLabel = idx < pages.length-1 ? (trial.button_label_next||'Next') : (trial.button_label_finish||'Begin Task');
        const nextBtn = trial.show_clickable_nav ? '<button class="jspsych-btn" id="instr-next" style="font-size: 18px; padding: 15px 25px; background: linear-gradient(135deg, #4CAF50, #45a049); border: 2px solid #66BB6A; box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3); font-weight: bold; transition: all 0.3s ease;">' + nextLabel + '</button>' : '';
        display_element.innerHTML = '<style>#instr-next:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4) !important; background: linear-gradient(135deg, #5CBF60, #4CAF50) !important; }</style>'
          + '<div style="max-width:1400px;margin:0 auto;padding-top:28px;text-align:left;color:#fff;">'
          + '<div class="instr-page">' + (pages[idx]||'') + '</div>'
          + '<div style="margin-top:20px; display:flex; gap:12px; justify-content: center; align-items: center;">' + prevBtn + nextBtn + '</div></div>';
        if (trial.show_clickable_nav){
          const n = display_element.querySelector('#instr-next'); if (n) n.addEventListener('click', (e)=>{ e.preventDefault(); if (idx < pages.length-1){ idx++; render(); } else { this.jsPsych.finishTrial({ page_index: idx }); } });
          const p = display_element.querySelector('#instr-prev'); if (p) p.addEventListener('click', (e)=>{ e.preventDefault(); if (idx>0){ idx--; render(); } });
        }
      };
      render();
    }
  }
  JsPsychInstructionsLite.info = { name: 'instructions-lite', parameters: { pages: { default: [] }, show_clickable_nav: { default: true }, button_label_next: { default: 'Next' }, button_label_previous: { default: 'Previous' } } };
  window.jsPsychInstructions = JsPsychInstructionsLite;
})();