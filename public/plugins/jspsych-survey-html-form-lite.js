(function(){
  class JsPsychSurveyHtmlFormLite {
    constructor(jsPsych){ this.jsPsych = jsPsych; }
    trial(display_element, trial){
      const btn = trial.button_label || 'Continue';
      const html = '<div style="max-width:900px;margin:0 auto;color:#fff;">'
        + '<form id="jspsych-survey-html-form-lite">'
        + (trial.html || '')
        + '<div style="margin-top:12px;"><button class="jspsych-btn" id="jspsych-survey-html-form-lite-next">'
        + btn + '</button></div></form></div>';
      display_element.innerHTML = html;
      const form = display_element.querySelector('#jspsych-survey-html-form-lite');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const obj = {}; for (const [k,v] of fd.entries()) { if (obj[k]) { if (!Array.isArray(obj[k])) obj[k]=[obj[k]]; obj[k].push(v); } else obj[k]=v; }
        for (const el of form.querySelectorAll('[required]')) { const val = fd.get(el.name); if (!val) { el.focus(); return; } }
        this.jsPsych.finishTrial({ responses: JSON.stringify(obj) });
      });
    }
  }
  JsPsychSurveyHtmlFormLite.info = { name: 'survey-html-form-lite', parameters: { html: { default: '' }, button_label: { default: 'Continue' } } };
  window.jsPsychSurveyHtmlForm = JsPsychSurveyHtmlFormLite;
})();