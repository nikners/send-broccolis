/* ==========================================================================
   SendSense — app.js
   Low-fidelity prototype. Vanilla JS, no modules, no build step.
   All "AI" output and all check rules are hardcoded demonstration values
   from data.js. There is no backend and nothing is persisted.
   ========================================================================== */

(function () {
  'use strict';

  var DATA = window.SENDSENSE_DATA;

  /* ===================================================== small utilities */

  function $(sel) { return document.querySelector(sel); }

  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESCAPES[c]; });
  }

  /* Normalisation used by the WhatsApp approved-template comparison.
     Keeps {name} intact: braces, letters, digits and spaces survive. */
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[.,!?;:"'`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function clock(d) {
    d = d || new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function stampNow() {
    var d = new Date();
    return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug',
      'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getFullYear() + ', ' + clock(d);
  }

  function formatWhen(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function nfmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* {name} -> the sample recipient name used in the phone preview.
     Any other {placeholder} is deliberately left visible so the Checks
     step can be seen to catch it. */
  function previewText(text) {
    return String(text == null ? '' : text).replace(/\{name\}/g, 'Aisha');
  }

  function segmentById(id) {
    var found = null;
    DATA.segments.forEach(function (s) { if (s.id === id) found = s; });
    return found || DATA.segments[0];
  }

  /* Which canned goal does this free text refer to? Exact normalised match
     first, then a single distinctive keyword, else the generic bucket. */
  function goalKeyOf(goal) {
    var g = norm(goal);
    if (!g) return 'generic';
    var keys = Object.keys(DATA.goals);
    for (var i = 0; i < keys.length; i++) {
      if (norm(DATA.goals[keys[i]].label) === g) return keys[i];
    }
    var hints = { bill: 'overdue', sale: 'sale', appt: 'appointment' };
    for (var k = 0; k < keys.length; k++) {
      if (g.indexOf(hints[keys[k]]) !== -1) return keys[k];
    }
    return 'generic';
  }

  /* ================================================================ state */

  function freshCampaign() {
    return {
      goal: '',
      message: '',
      draftKey: null,
      draftIndex: -1,
      channel: '',
      segmentId: DATA.segments[0].id,
      /* Neither "Send now" nor "Schedule for..." is chosen until the user
         picks one on the Review step. */
      scheduleMode: '',
      scheduleAt: '',
      warningsAck: false,
      name: ''
    };
  }

  var state = {
    user: null,
    campaigns: [],
    campaign: freshCampaign(),
    ui: {
      route: '',
      lastRoute: '',
      notesOn: false,
      legendOpen: false,
      drafting: false,
      draftTimer: null,
      drafted: false,          // has a canned draft been pulled for this campaign?
      savedAt: null,
      loginErrors: {},
      schedError: null,
      dialog: null,
      toastSeq: 0
    }
  };

  /* ===================================================== derived helpers */

  function charInfo(text) {
    var len = String(text || '').length;
    var parts = len > 160 ? Math.ceil(len / 153) : 1;
    return {
      len: len,
      parts: parts,
      text: len + ' characters. ' + parts + (parts === 1 ? ' part' : ' parts') +
        (parts > 1 ? ' (over 160 characters, so it splits into ' + parts + ' parts).' : '.')
    };
  }

  function channelNote() {
    var c = state.campaign;
    var info = charInfo(c.message);
    if (c.channel === 'SMS') return 'SMS: ' + info.text;
    if (c.channel === 'WhatsApp') {
      return 'WhatsApp: ' + info.len + ' characters. Approved template: ' +
        (matchesApprovedTemplate(c.message) ? 'yes.' : 'no, this text is not one of the approved templates.');
    }
    if (c.channel === 'RCS') return 'RCS: ' + info.len + ' characters. Rich card not shown in this prototype, so this is a plain text preview only.';
    return 'Pick a channel to see its notes.';
  }

  function matchesApprovedTemplate(text) {
    var n = norm(text);
    if (!n) return false;
    var ok = false;
    DATA.whatsappTemplates.forEach(function (t) { if (norm(t) === n) ok = true; });
    return ok;
  }

  /* Pick the approved template sharing the most words with the current text. */
  function bestApprovedTemplate(text) {
    var have = norm(text).split(' ').filter(function (w) { return w.length > 3; });
    var best = DATA.whatsappTemplates[0], bestScore = -1;
    DATA.whatsappTemplates.forEach(function (tpl) {
      var words = norm(tpl).split(' ');
      var score = words.filter(function (w) { return have.indexOf(w) !== -1; }).length;
      if (score > bestScore) { bestScore = score; best = tpl; }
    });
    return best;
  }

  function campaignNameFor(goal) {
    var key = goalKeyOf(goal);
    var g = DATA.goals[key];
    if (g && g.campaignName) return g.campaignName;
    var t = String(goal || 'Untitled campaign').trim();
    return t.length > 42 ? t.slice(0, 41) + '…' : t;
  }

  /* ======================================================== checks engine */

  /* Demonstration rules only. Not real compliance logic. */
  function runChecks() {
    var c = state.campaign;
    var text = c.message || '';
    var trimmed = text.trim();
    var rows = [];

    /* 1. Empty message */
    if (trimmed === '') {
      rows.push({
        id: 'empty', name: 'Message has content', status: 'error',
        detail: 'Error: the message is empty. Write some text on the Draft step.',
        backToDraft: true
      });
    } else {
      rows.push({
        id: 'empty', name: 'Message has content', status: 'pass',
        detail: 'Pass: the message has ' + trimmed.length + ' characters of text.'
      });
    }

    /* 2. Unfilled placeholders (anything other than {name}) */
    var found = text.match(/\{[^}]*\}/g) || [];
    var bad = found.filter(function (p) { return norm(p) !== '{name}'; });
    var unique = [];
    bad.forEach(function (b) { if (unique.indexOf(b) === -1) unique.push(b); });
    if (unique.length) {
      rows.push({
        id: 'placeholder', name: 'Placeholders filled in', status: 'error',
        detail: 'Error: unfilled placeholder ' + unique.join(', ') +
          '. Only {name} is supported in this prototype.',
        backToDraft: true
      });
    } else {
      rows.push({
        id: 'placeholder', name: 'Placeholders filled in', status: 'pass',
        detail: found.length
          ? 'Pass: only the {name} placeholder is left, which is expected.'
          : 'Pass: no placeholders in the message.'
      });
    }

    /* 3. SMS length / parts */
    if (c.channel === 'SMS') {
      var info = charInfo(text);
      if (info.parts > 1) {
        rows.push({
          id: 'length', name: 'SMS fits one message', status: 'warning',
          detail: 'Warning: This will be sent as ' + info.parts + ' parts. The message is ' +
            info.len + ' characters, over the 160 character limit.',
          backToDraft: true
        });
      } else {
        rows.push({
          id: 'length', name: 'SMS fits one message', status: 'pass',
          detail: trimmed === ''
            ? 'Pass: nothing to measure until the message has text.'
            : 'Pass: ' + info.len + ' characters, which fits in one SMS part.'
        });
      }
    }

    /* 4. WhatsApp approved template */
    if (c.channel === 'WhatsApp') {
      if (matchesApprovedTemplate(text)) {
        rows.push({
          id: 'template', name: 'WhatsApp approved template', status: 'pass',
          detail: 'Pass: the text matches one of the ' + DATA.whatsappTemplates.length +
            ' approved templates, so it can be sent.'
        });
      } else {
        rows.push({
          id: 'template', name: 'WhatsApp approved template', status: 'error',
          detail: 'Error: WhatsApp needs an approved template. This text is free-written, so it ' +
            'matches none of the ' + DATA.whatsappTemplates.length + ' approved templates.',
          fix: { act: 'fix-template', label: 'Use approved template' }
        });
      }
    }

    /* 5. Opt-out wording, for the weekend sale goal only */
    if (goalKeyOf(c.goal) === 'sale') {
      if (/reply\s+stop\s+to\s+opt\s+out/i.test(text)) {
        rows.push({
          id: 'optout', name: 'Opt-out wording', status: 'pass',
          detail: 'Pass: the message includes the opt-out wording.'
        });
      } else {
        rows.push({
          id: 'optout', name: 'Opt-out wording', status: 'warning',
          detail: 'Warning: the weekend sale message is missing "Reply STOP to opt out". ' +
            'Marketing messages usually have to carry opt-out wording.',
          fix: { act: 'fix-optout', label: 'Add it' }
        });
      }
    }

    /* Informational row so the RCS path is not an empty list. */
    if (c.channel === 'RCS') {
      rows.push({
        id: 'rcs', name: 'RCS rich card', status: 'pass',
        detail: 'Pass: no channel-specific rule. The rich card is not shown in this prototype.'
      });
    }

    return rows;
  }

  function checksSummary() {
    var rows = runChecks();
    var errors = rows.filter(function (r) { return r.status === 'error'; }).length;
    var warnings = rows.filter(function (r) { return r.status === 'warning'; }).length;
    return { rows: rows, errors: errors, warnings: warnings, ok: errors === 0 && (warnings === 0 || state.campaign.warningsAck) };
  }

  /* ============================================== heuristic note helper */

  function hn(code, text, block) {
    if (!state.ui.notesOn) return '';
    var cls = block ? 'hn hn-block' : 'hn';
    return '<span class="' + cls + '"><span class="hn-code">' + esc(code) + '</span> ' + esc(text) + '</span>';
  }

  /* ====================================================== phone preview */

  function phoneHTML(channel) {
    var c = state.campaign;
    var label = channel || c.channel || 'no channel picked';
    return '' +
      '<div class="phone">' +
        '<span class="phone-notch"></span>' +
        '<div class="phone-screen">' +
          '<div class="phone-header">' +
            '<span class="phone-name">Aisha</span>' +
            '<span class="phone-channel" id="preview-channel">' + esc(label) + ' preview</span>' +
          '</div>' +
          '<div class="phone-chat">' +
            '<div class="bubble bubble-out">' +
              '<span id="preview-text">' + esc(previewText(c.message) || '(no message yet)') + '</span>' +
              '<span class="bubble-meta">outgoing · preview</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ================================================================ views */

  function viewLogin() {
    var e = state.ui.loginErrors;
    function err(id, msg) {
      return e[id] ? ' aria-invalid="true" aria-describedby="' + id + '-err"' : '';
    }
    function errText(id) {
      return e[id] ? '<p class="msg msg-error" id="' + id + '-err">' + esc(e[id]) + '</p>' : '';
    }
    return '' +
      '<section class="panel panel-narrow">' +
        '<h1>Sign in to SendSense</h1>' +
        '<p class="muted small">Low-fidelity wireframe prototype. Nothing is sent and nothing is ' +
          'saved. Any non-empty username and password will sign you in.</p>' +
        '<form id="login-form" novalidate>' +
          '<div class="field">' +
            '<label for="login-user">Username</label>' +
            '<input type="text" id="login-user" name="username" autocomplete="username"' +
              err('username', '') + '>' +
            errText('username') +
          '</div>' +
          '<div class="field">' +
            '<label for="login-pass">Password</label>' +
            '<input type="password" id="login-pass" name="password" autocomplete="current-password"' +
              err('password', '') + '>' +
            errText('password') +
          '</div>' +
          '<button type="submit" class="btn btn-primary">Sign in</button>' +
        '</form>' +
      '</section>';
  }

  function viewCampaigns() {
    var counts = { Draft: 0, Scheduled: 0, Sent: 0 };
    state.campaigns.forEach(function (c) { counts[c.status] = (counts[c.status] || 0) + 1; });

    function word(n, s) { return n + ' ' + s + (n === 1 ? '' : 's'); }

    /* Only "draft" pluralises. "scheduled" and "sent" read the same at any
       count, so they are not pluralised. */
    function countWord(n, s) { return n + ' ' + s; }

    var rows = state.campaigns.map(function (c) {
      var seg = segmentById(c.segmentId);
      var action = '';
      if (c.status === 'Draft') {
        action = '<button type="button" class="btn btn-small" data-act="resume" data-id="' + esc(c.id) + '">Resume</button>';
      } else if (c.status === 'Scheduled') {
        action = '<button type="button" class="btn btn-small btn-danger-outline" data-act="cancel-schedule" data-id="' + esc(c.id) + '">Cancel schedule</button>';
      } else {
        action = '<button type="button" class="btn btn-small" data-act="view" data-id="' + esc(c.id) + '">View</button>';
      }
      return '' +
        '<tr>' +
          '<th scope="row">' + esc(c.name) + '</th>' +
          '<td>' + esc(c.channel) + '</td>' +
          '<td>' + esc(seg.name) + '<br><span class="muted small">' + nfmt(seg.count) + ' people</span></td>' +
          '<td class="status-cell"><span class="status-chip">' + esc(c.status) + '</span>' +
            (c.status === 'Scheduled' && c.scheduledFor ? '<br><span class="muted small">for ' + esc(c.scheduledFor) + '</span>' : '') + '</td>' +
          '<td class="muted small">' + esc(c.updated) + '</td>' +
          '<td class="actions-cell">' + action + '</td>' +
        '</tr>';
    }).join('');

    return '' +
      '<section class="panel">' +
        '<div class="panel-head panel-head-rule">' +
          '<div>' +
            '<h1>Campaigns</h1>' +
            '<p class="muted small" id="campaign-counter" role="status">' +
              nfmt(state.campaigns.length) + ' campaigns, ' + word(counts.Draft, 'draft') + ', ' +
              countWord(counts.Scheduled, 'scheduled') + ', ' + countWord(counts.Sent, 'sent') +
            '</p>' +
            hn('H1', 'the counter is announced because it has role="status"', true) +
          '</div>' +
          '<button type="button" class="btn btn-primary" data-act="new-campaign">New campaign</button>' +
        '</div>' +
        '<table>' +
          '<caption>All campaigns in this prototype session. Synthetic data only.</caption>' +
          '<thead><tr>' +
            '<th scope="col">Name</th><th scope="col">Channel</th><th scope="col">Recipients</th>' +
            '<th scope="col">Status' +
              hn('H1', 'the status is written as a word, never signalled by colour alone') +
            '</th><th scope="col">Updated</th><th scope="col">Actions</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</section>';
  }

  function viewGoal() {
    var c = state.campaign;
    var examples = DATA.goalOrder.map(function (k) {
      var g = DATA.goals[k];
      var on = norm(c.goal) === norm(g.label);
      return '<button type="button" class="goal-chip" data-act="use-goal" data-key="' + esc(k) + '" ' +
        'aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(g.label) + '</button>';
    }).join('');

    var len = c.goal.trim().length;
    var ready = len >= 10;

    return '' +
      '<section class="panel">' +
        '<h1 tabindex="-1">Step 1 of 5: Goal</h1>' +
        '<p class="muted small">Describe what you want to achieve. A first draft is written from this ' +
          'sentence, so keep it to one clear outcome.</p>' +
        '<div class="field">' +
          '<label for="goal-input">What do you want to achieve?</label>' +
          '<textarea id="goal-input" class="textarea-tall" aria-describedby="goal-help goal-count">' +
            esc(c.goal) + '</textarea>' +
          '<p class="counter" id="goal-count">' + len + ' characters</p>' +
          '<p class="helper" id="goal-help">' +
            (ready
              ? 'Goal saved. Press Next to write the first draft.'
              : 'Next is disabled until the goal has at least 10 characters. ' +
                'You have ' + len + '.') +
          '</p>' +
        '</div>' +
        '<h2>Or start from an example</h2>' +
        '<p class="helper">These three goals already have drafts, a suggested channel and a recipient ' +
          'list prepared for them. Choosing one fills the box above.</p>' +
        '<div class="goal-examples">' + examples + '</div>' +
        hn('H6', 'example goals are recognition, not recall: you pick from a list instead of remembering phrasing', true) +
      '</section>';
  }

  function viewDraft() {
    var c = state.campaign;

    if (state.ui.drafting) {
      return '' +
        '<section class="panel" aria-labelledby="draft-h">' +
          '<h1 tabindex="-1" id="draft-h">Step 2 of 5: Draft</h1>' +
          '<p class="msg msg-info" role="status">Drafting your message…</p>' +
          '<div class="panel panel-cap">' +
            '<p class="muted">Working from your goal. This takes about a second.</p>' +
            '<p class="muted small">In this prototype the draft is a canned string looked up by goal. ' +
              'There is no real AI behind this screen.</p>' +
          '</div>' +
          hn('H1', 'the drafting state is announced with role="status" so it is not a silent wait', true) +
        '</section>';
    }

    var key = c.draftKey || 'generic';
    var list = DATA.drafts[key] || DATA.drafts.generic;
    var info = charInfo(c.message);

    return '' +
      '<section class="panel">' +
        '<h1 tabindex="-1">Step 2 of 5: Draft</h1>' +
        '<p class="muted small">Goal: ' + esc(c.goal || '(none)') + '</p>' +
        '<div class="field">' +
          '<label for="draft-input">Message</label>' +
          '<textarea id="draft-input" aria-describedby="draft-count draft-note">' + esc(c.message) + '</textarea>' +
          '<p class="counter" id="draft-count">' + info.text + '</p>' +
          (key === 'generic'
            ? '<p class="helper" id="draft-note">Only one generic draft exists in this prototype, so ' +
              'Regenerate has no alternatives to cycle through.</p>'
            : '<p class="helper" id="draft-note">Draft ' + (c.draftIndex + 1) + ' of ' + list.length +
              '. Press Regenerate to cycle through the alternatives.</p>') +
        '</div>' +
        '<div class="row">' +
          '<button type="button" class="btn" data-act="regenerate">Regenerate</button>' +
          '<button type="button" class="btn-link" data-act="goto-goal">Edit the goal</button>' +
          hn('H3', 'Regenerate plus Back means nothing you wrote is thrown away', false) +
        '</div>' +
        '<hr class="divider">' +
        '<p class="msg msg-info">Note: This is a first draft. Please read and edit it before continuing.</p>' +
        '<p class="helper">The preview on the next step replaces <span class="mono">{name}</span> with ' +
          'the sample name Aisha, so you can see exactly what a recipient reads.</p>' +
        hn('H6', 'the whole message stays on screen, so it is read rather than remembered', true) +
      '</section>';
  }

  function viewChannel() {
    var c = state.campaign;
    var key = goalKeyOf(c.goal);
    var sug = DATA.channelSuggestions[key];

    function card(channel, desc) {
      var isSug = sug && sug.channel === channel;
      var checked = c.channel === channel;
      return '' +
        '<label class="channel-card">' +
          '<span class="channel-card-head">' +
            '<input type="radio" name="channel" value="' + esc(channel) + '"' +
              (checked ? ' checked' : '') + '> ' +
            '<span>' + esc(channel) + '</span>' +
            (isSug ? '<span class="badge">Suggested</span>' : '') +
          '</span>' +
          '<span class="channel-card-desc">' + esc(desc) + '</span>' +
        '</label>';
    }

    var hint = sug
      ? '<p class="msg msg-info">Suggested for this goal: <strong>' + esc(sug.channel) +
        '</strong>. ' + esc(sug.reason) + '</p>'
      : '<p class="msg msg-info">No channel is suggested for this goal, because this prototype only ' +
        'ships a suggestion for its three example goals. Pick one yourself.</p>';

    return '' +
      '<section class="panel">' +
        '<h1 tabindex="-1">Step 3 of 5: Channel</h1>' +
        '<div class="two-col">' +
          '<div>' +
            '<h2>Choose a channel</h2>' +
            '<div class="channel-grid">' +
              card('SMS', 'Plain text to any handset, with no app needed.') +
              card('WhatsApp', 'Needs one of a small set of approved templates.') +
              card('RCS', 'Would show a rich card. Not drawn in this prototype.') +
            '</div>' +
            hint +
            hn('H6', 'the suggested channel is labelled and gives a reason, so you are not asked to ' +
              'guess why it was suggested', true) +
            '<h2 class="mt-16">Channel notes</h2>' +
            '<p class="msg msg-info" id="channel-note">' + esc(channelNote()) + '</p>' +
            hn('H6', 'each channel states what it will do, so you are not left recalling the rules', true) +
            '<div id="wa-note">' + whatsappTemplateBlock(c.message) + '</div>' +
          '</div>' +
          '<div>' +
            '<h2>Preview</h2>' +
            '<p class="helper">Sent to Aisha, replacing <span class="mono">{name}</span>.</p>' +
            phoneHTML() +
            '<p class="helper mt-10">This preview updates as you type, so you do not ' +
              'have to press Next to check it.</p>' +
            hn('H1', 'the live preview shows the result of an action immediately', true) +
          '</div>' +
        '</div>' +
      '</section>';
  }

  /* Only ever rendered for WhatsApp, so the H6 note below it is always true
     at the moment it is shown. */
  function whatsappTemplateBlock(text) {
    if (state.campaign.channel !== 'WhatsApp') return '';
    var ok = matchesApprovedTemplate(text);
    var items = DATA.whatsappTemplates.map(function (t) {
      return '<li class="tpl-item">' + esc(t) + '</li>';
    }).join('');
    return '' +
      '<div class="panel panel-sub">' +
        '<h3>Approved WhatsApp templates</h3>' +
        '<p class="' + (ok ? 'msg msg-info' : 'msg msg-error') + '">' +
          (ok ? 'Pass: this message matches an approved template.'
               : 'Error: WhatsApp needs an approved template. The current text is not on the list below.') +
        '</p>' +
        '<ol class="small tpl-list">' + items + '</ol>' +
        hn('H6', 'the approved templates are listed on screen, so you can pick one instead of guessing', true) +
      '</div>';
  }

  function viewChecks() {
    var s = checksSummary();

    var items = s.rows.map(function (r) {
      var fix = '';
      if (r.fix) {
        fix = '<span class="small muted">Fix this:</span>' +
              '<button type="button" class="btn btn-small" data-act="' + esc(r.fix.act) + '">' +
                esc(r.fix.label) + '</button>';
      }
      if (r.backToDraft) {
        fix += (fix ? ' ' : '') +
          '<button type="button" class="btn-link" data-act="goto-draft">Back to Draft</button>';
      }
      var verdictWord = r.status.charAt(0).toUpperCase() + r.status.slice(1);
      return '' +
        '<li class="check-item is-' + esc(r.status) + '">' +
          '<div class="check-head">' +
            '<span class="check-name">' + esc(r.name) + '</span>' +
            '<span class="check-verdict">' + esc(verdictWord) + '</span>' +
          '</div>' +
          '<p class="check-detail">' + esc(r.detail) + '</p>' +
          (fix ? '<div class="check-fix">' + fix + '</div>' : '') +
        '</li>';
    }).join('');

    var gate;
    if (s.errors > 0) {
      gate = '<p class="msg msg-error"><strong>Error: Next is disabled.</strong> ' +
        s.errors + ' check' + (s.errors === 1 ? '' : 's') + ' must be fixed first. ' +
        'Errors are fixed, not skipped.</p>';
    } else if (s.warnings > 0 && !state.campaign.warningsAck) {
      gate = '<p class="msg msg-warning"><strong>Warning: Next is disabled.</strong> Tick the box ' +
        'below to confirm you have read the ' + s.warnings + ' warning' +
        (s.warnings === 1 ? '' : 's') + '.</p>' +
        '<p class="ack-row">' +
          '<label class="check-inline">' +
            '<input type="checkbox" id="warn-ack"' + (state.campaign.warningsAck ? ' checked' : '') +
              ' aria-describedby="warn-ack-help"> I have read the warnings' +
          '</label>' +
        '</p>' +
        '<p class="helper" id="warn-ack-help">Warnings do not stop the campaign, but the acknowledgement ' +
          'is reset if you change the message.</p>';
    } else if (s.warnings > 0) {
      gate = '<p class="msg msg-info">You acknowledged ' + s.warnings + ' warning' +
        (s.warnings === 1 ? '' : 's') + '. Next is available.</p>';
    } else {
      gate = '<p class="msg msg-info">All checks passed. Next is available.</p>';
    }

    return '' +
      '<section class="panel">' +
        '<h1 tabindex="-1">Step 4 of 5: Checks</h1>' +
        '<p class="muted small">These are demonstration rules that run in the page. They are not real ' +
          'compliance checks. Fixing something here re-runs the list immediately.</p>' +
        '<ul class="check-list">' + items + '</ul>' +
        hn('H5', 'checks are visible before sending, and each failure offers a way out', true) +
        '<hr class="divider">' +
        gate +
        hn('H5', 'Next stays disabled until errors are fixed, so the campaign cannot be sent broken', true) +
      '</section>';
  }

  function viewReview() {
    var c = state.campaign;
    var seg = segmentById(c.segmentId);
    var key = goalKeyOf(c.goal);
    var sug = DATA.channelSuggestions[key];
    var when = c.scheduleAt ? formatWhen(c.scheduleAt) : '';

    var options = DATA.segments.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === c.segmentId ? ' selected' : '') + '>' +
        esc(s.name) + ' (' + nfmt(s.count) + ')</option>';
    }).join('');

    return '' +
      '<section class="panel">' +
        '<h1 tabindex="-1">Step 5 of 5: Review and send</h1>' +
        '<div class="two-col">' +
          '<div>' +
            '<h2>Summary</h2>' +
            '<dl class="summary-list">' +
              '<dt>Goal</dt><dd>' + esc(c.goal) + '</dd>' +
              '<dt>Channel</dt><dd>' + esc(c.channel || 'none chosen') +
                (sug && sug.channel === c.channel
                  ? ' <span class="badge">Suggested</span><br><span class="muted small">' + esc(sug.reason) + '</span>'
                  : '') + '</dd>' +
              '<dt>Name</dt><dd>' + esc(c.name || campaignNameFor(c.goal)) + '</dd>' +
            '</dl>' +
            '<div class="field">' +
              '<label for="segment-select">Recipients</label>' +
              '<select id="segment-select" aria-describedby="segment-help">' + options + '</select>' +
              '<p class="helper" id="segment-help">' + nfmt(seg.count) +
                ' people will receive this message.</p>' +
              hn('H6', 'segments are named with their counts, so you are not guessing who gets it', true) +
            '</div>' +
            '<div class="field">' +
              '<span class="label" id="sched-label">When</span>' +
              '<div class="schedule-row" role="radiogroup" aria-labelledby="sched-label">' +
                '<label class="schedule-opt">' +
                  '<input type="radio" name="schedmode" value="now"' +
                    (c.scheduleMode === 'now' ? ' checked' : '') + '> Send now' +
                '</label>' +
                '<label class="schedule-opt">' +
                  '<input type="radio" name="schedmode" value="schedule"' +
                    (c.scheduleMode === 'schedule' ? ' checked' : '') + '> Schedule for…' +
                '</label>' +
              '</div>' +
              '<div class="schedule-datetime" id="sched-when-row"' +
                (c.scheduleMode === 'schedule' ? '' : ' hidden') + '>' +
                '<label class="small" for="sched-when">Date and time</label>' +
                '<input type="datetime-local" id="sched-when" value="' + esc(c.scheduleAt) + '">' +
                '<p class="helper" id="sched-when-help">' +
                  (c.scheduleMode === 'schedule'
                    ? (when ? 'Will send ' + nfmt(seg.count) + ' messages ' + when + '.' : 'Pick a date and time.')
                    : '') +
                '</p>' +
                '<p class="msg msg-error" id="sched-when-err"' +
                  (state.ui.schedError ? '' : ' hidden') + '>' +
                  (state.ui.schedError ? esc(state.ui.schedError) : '') + '</p>' +
              '</div>' +
            '</div>' +
            '<h2>Message</h2>' +
            '<p class="msg msg-info">' + esc(previewText(c.message)) + '</p>' +
            '<p class="helper">Read-only here. To change it press Back twice to reach Draft. ' +
              'Nothing is lost either way.</p>' +
            hn('H3', 'Back keeps the message, the channel and the segment', true) +
          '</div>' +
          '<div>' +
            '<h2>Final preview</h2>' +
            '<p class="helper">Sent to Aisha, replacing <span class="mono">{name}</span>.</p>' +
            phoneHTML() +
            hn('H6', 'the exact template text is on screen at the point of sending', true) +
          '</div>' +
        '</div>' +
        '<p class="action-hint">Choose when to send above. Your choice sets the label of the ' +
          'bottom right button, which sits in the same fixed bar as Back on every step.</p>' +
      '</section>';
  }

  /* =================================================== create-flow chrome */

  var STEPS = [
    { n: 1, route: '#/new/goal',    label: 'Goal' },
    { n: 2, route: '#/new/draft',   label: 'Draft' },
    { n: 3, route: '#/new/channel', label: 'Channel' },
    { n: 4, route: '#/new/checks',  label: 'Checks' },
    { n: 5, route: '#/new/review',  label: 'Review' }
  ];

  function stepIndex(route) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].route === route) return i;
    return -1;
  }

  function nextEnabled(route) {
    var c = state.campaign;
    if (route === '#/new/goal') return c.goal.trim().length >= 10;
    if (route === '#/new/draft') return true;
    if (route === '#/new/channel') return !!c.channel;
    if (route === '#/new/checks') return checksSummary().ok;
    if (route === '#/new/review') return !!c.scheduleMode;
    return true;
  }

  function backRoute(route) {
    var i = stepIndex(route);
    return i <= 0 ? '#/campaigns' : STEPS[i - 1].route;
  }

  function primaryActionLabel(route) {
    if (route === '#/new/review') {
      /* Nothing chosen yet, so the label stays neutral rather than implying
         that one of the two options is already selected. */
      if (!state.campaign.scheduleMode) return 'Send or schedule';
      return state.campaign.scheduleMode === 'schedule' ? 'Schedule' : 'Send now';
    }
    return 'Next';
  }

  /* Why the forward button is unavailable, in words rather than by leaving
     the user to guess why a greyed-out button will not respond. */
  function gateHint(route) {
    if (nextEnabled(route)) return '';
    if (route === '#/new/goal') return 'Next needs a goal of at least 10 characters.';
    if (route === '#/new/channel') return 'Next needs a channel.';
    if (route === '#/new/checks') return 'Next is disabled until the checks allow it.';
    if (route === '#/new/review') return 'Choose when to send first.';
    return '';
  }

  /* Re-evaluate the forward button without re-rendering the whole step, so
     that live edits do not throw away the caret. */
  function syncFlowGating() {
    var btn = document.querySelector('[data-act=next]');
    if (btn) btn.disabled = !nextEnabled(state.ui.route);
    var hint = document.getElementById('gate-hint');
    if (hint) hint.textContent = gateHint(state.ui.route);
  }

  function renderFlowBar() {
    var bar = document.getElementById('flowbar');
    var action = document.getElementById('actionbar');
    var route = state.ui.route;
    var idx = stepIndex(route);
    document.body.classList.toggle('has-actionbar', idx !== -1);
    if (idx === -1) {
      bar.hidden = true; bar.innerHTML = '';
      action.hidden = true; action.innerHTML = '';
      return;
    }

    var items = STEPS.map(function (s, i) {
      var isCurrent = i === idx;
      var isDone = i < idx;
      var classes = 'stepper-item' + (isCurrent ? ' is-current' : '') + (isDone ? ' is-done' : '');
      var label = '<span class="step-num">' + s.n + '</span>';
      var name = '<span class="step-name">' + esc(s.label) + '</span>';
      var stateTxt = isCurrent
        ? '<span class="step-state">(current)</span>'
        : (isDone ? '<span class="step-state">(done)</span>' : '');
      if (isDone) {
        name = '<a class="step-link" href="' + s.route + '" data-step-back="' + s.route + '">' +
          name + '</a>';
      }
      /* aria-current="step" gives assistive tech the standard hook; the visible
         "(current)" text means it is not signalled by styling alone. */
      return '<li class="' + classes + '"' + (isCurrent ? ' aria-current="step"' : '') + '>' +
        label + name + stateTxt + '</li>';
    }).join('');

    var enabled = nextEnabled(route);
    var isReview = route === '#/new/review';
    var primaryAct = isReview ? 'send' : 'next';

    bar.hidden = false;
    bar.innerHTML = '' +
      '<nav class="stepper" aria-label="Campaign steps">' +
        '<ol>' + items + '</ol>' +
        hn('H4', 'the same five steps in the same order on every step', true) +
      '</nav>' +
      '<p class="status-line" id="savestatus" role="status" aria-live="polite"></p>' +
      hn('H1', 'the saved time is always on screen, so you know your work is kept', true);

    /* The Back / forward row is a fixed bar at the foot of the viewport, so it
       cannot move with the length of a step's content. The tags get their own
       row inside the bar, which keeps the button row's height constant even
       when the gate hint text is long, so the buttons never shift between
       steps. */
    action.hidden = false;
    action.innerHTML = '' +
      '<div class="step-actions">' +
        '<div class="action-row">' +
          '<button type="button" class="btn" data-act="back">Back</button>' +
          '<span class="spacer"></span>' +
          '<span class="action-hint" id="gate-hint"></span>' +
          '<button type="button" class="btn btn-primary" data-act="' + primaryAct + '"' +
            (enabled ? '' : ' disabled') + '>' + esc(primaryActionLabel(route)) + '</button>' +
        '</div>' +
        '<div class="action-tags">' +
          hn('H3', 'Back never clears what you entered', false) +
          hn('H4', 'the forward button is always bottom right of the same fixed bar', false) +
        '</div>' +
      '</div>';

    paintStatusLine();
    var gh = document.getElementById('gate-hint');
    if (gh) gh.textContent = gateHint(route);
    syncActionBarHeight();
  }

  /* The bar is taller when heuristic notes are on, because the H3 and H4 tags
     wrap onto a second line. Measuring it keeps the page padding correct
     instead of relying on a guessed fixed height. */
  function syncActionBarHeight() {
    var action = document.getElementById('actionbar');
    if (!action || action.hidden) {
      document.body.style.removeProperty('--actionbar-h');
      return;
    }
    document.body.style.setProperty('--actionbar-h', action.offsetHeight + 'px');
  }

  /* The role="status" node is persistent chrome, so the saved time is
     announced by updating text rather than by re-inserting the node. */
  function paintStatusLine() {
    var el = document.getElementById('savestatus');
    if (!el) return;
    el.textContent = state.ui.savedAt
      ? 'Draft saved ' + state.ui.savedAt
      : 'No changes yet in this session.';
  }

  function touchDraft() {
    state.ui.savedAt = clock();
    paintStatusLine();
  }

  /* ============================================================== dialogs */

  var dialogSeq = 0;

  function openDialog(opts) {
    closeDialog();
    var host = document.getElementById('dialog-host');
    var titleId = 'dlg-title-' + (++dialogSeq);
    var prevFocus = document.activeElement;

    host.innerHTML = '' +
      '<div class="dialog-backdrop">' +
        '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="' + titleId + '">' +
          '<h2 id="' + titleId + '">' + esc(opts.title) + '</h2>' +
          '<div class="dialog-body">' + opts.body + '</div>' +
          '<div class="dialog-actions">' +
            '<button type="button" class="btn" data-dlg="cancel">' +
              esc(opts.cancelLabel || 'Cancel') + '</button>' +
            '<button type="button" class="btn btn-primary" data-dlg="confirm">' +
              esc(opts.confirmLabel || 'Confirm') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var box = host.querySelector('.dialog');
    var buttons = {
      cancel: host.querySelector('[data-dlg="cancel"]'),
      confirm: host.querySelector('[data-dlg="confirm"]')
    };
    var defaultKey = opts.defaultFocus === 'cancel' ? 'cancel' : 'confirm';
    state.ui.dialog = { opts: opts, prevFocus: prevFocus, buttons: buttons };
    buttons[defaultKey].focus();
    box.addEventListener('keydown', trapTab);
    return box;
  }

  function trapTab(e) {
    if (e.key !== 'Tab') return;
    var box = e.currentTarget;
    var f = box.querySelectorAll('button, [href], input, select, textarea');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function closeDialog() {
    var d = state.ui.dialog;
    var host = document.getElementById('dialog-host');
    host.innerHTML = '';
    state.ui.dialog = null;
    if (d && d.prevFocus && document.contains(d.prevFocus)) {
      try { d.prevFocus.focus(); } catch (err) { /* element gone */ }
    }
  }

  /* =============================================================== toasts */

  function showToast(opts) {
    var host = document.getElementById('toast-host');
    var ms = opts.ms || 8000;
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<span class="toast-text">' + esc(opts.text) + '</span>' +
      (opts.undo
        ? '<div class="toast-actions">' +
            '<button type="button" class="btn btn-small" data-toast-undo>Undo</button>' +
            '<span class="toast-note">This offer disappears in ' + Math.round(ms / 1000) +
              ' seconds.</span>' +
          '</div>' +
          '<div class="toast-countdown"></div>'
        : '');
    /* Duration is a runtime value, so it is set as a custom property rather
       than written into the markup. */
    var bar = el.querySelector('.toast-countdown');
    if (bar) bar.style.setProperty('--toast-ms', ms + 'ms');
    host.appendChild(el);

    if (opts.undo) {
      el.querySelector('[data-toast-undo]').addEventListener('click', function () {
        clearTimeout(el._t);
        host.removeChild(el);
        opts.undo();
      });
    }
    el._t = setTimeout(function () {
      if (el.parentNode) host.removeChild(el);
    }, ms);
    return el;
  }

  /* ================================================================ router */

  function go(route) {
    if (location.hash === route) render();
    else location.hash = route;
  }

  function currentRoute() {
    var h = location.hash || '#/login';
    return h;
  }

  function canEnter(route) {
    var c = state.campaign;
    if (route === '#/login') return true;
    /* Everything else needs a signed-in user. Because state is in memory
       only, a reload lands back on the login screen. */
    if (!state.user) return false;
    if (route === '#/campaigns') return true;
    switch (route) {
      case '#/new/goal': return true;
      case '#/new/draft': return c.goal.trim().length > 0;
      case '#/new/channel': return c.goal.trim().length > 0;
      case '#/new/checks': return c.goal.trim().length > 0;
      case '#/new/review': return checksSummary().ok;
      default: return false;
    }
  }

  function render() {
    var route = currentRoute();
    var view = document.getElementById('view');
    var changed = route !== state.ui.lastRoute;

    /* Leaving the Draft step cancels a pending drafting timer. */
    if (state.ui.draftTimer && route !== '#/new/draft') {
      clearTimeout(state.ui.draftTimer);
      state.ui.draftTimer = null;
      state.ui.drafting = false;
    }

    if (!canEnter(route)) {
      go(state.user ? '#/new/goal' : '#/login');
      return;
    }

    state.ui.route = route;

    /* On first arrival at Channel, pre-select the suggested channel so the
       user confirms a recommendation instead of having to recall an answer.
       Only applied while nothing is chosen, so a real choice is never
       overwritten. Goals outside the three examples get no suggestion. */
    if (route === '#/new/channel' && !state.campaign.channel) {
      var sug = DATA.channelSuggestions[goalKeyOf(state.campaign.goal)];
      if (sug) state.campaign.channel = sug.channel;
    }

    view.innerHTML =
      route === '#/login' ? viewLogin() :
      route === '#/campaigns' ? viewCampaigns() :
      route === '#/new/goal' ? viewGoal() :
      route === '#/new/draft' ? viewDraft() :
      route === '#/new/channel' ? viewChannel() :
      route === '#/new/checks' ? viewChecks() :
      route === '#/new/review' ? viewReview() : viewLogin();

    renderFlowBar();
    paintTopbar(route);

    if (changed && stepIndex(route) !== -1) {
      var h = view.querySelector('h1');
      if (h) h.focus();
    }
    state.ui.lastRoute = route;
  }

  /* Re-render, then put the caret back where the user left it. Used by the
     heuristic-notes toggle, which rebuilds the whole step and would otherwise
     jump the caret to the end of whatever field is being typed in. */
  function renderPreservingFocus() {
    var a = document.activeElement;
    var id = a && a.id ? a.id : null;
    var start = null, end = null;
    if (id && typeof a.selectionStart === 'number') {
      start = a.selectionStart;
      end = a.selectionEnd;
    }
    render();
    if (!id) return;
    var again = document.getElementById(id);
    if (!again) return;
    again.focus();
    if (start !== null && typeof again.setSelectionRange === 'function') {
      try { again.setSelectionRange(start, end); } catch (err) { /* not a text field */ }
    }
  }

  function paintTopbar(route) {
    var who = document.getElementById('who');
    if (state.user) {
      who.innerHTML = 'Signed in as ' + esc(state.user.name);
      who.hidden = false;
    } else {
      who.textContent = '';
      who.hidden = true;
    }
    var links = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < links.length; i++) {
      var key = links[i].getAttribute('data-nav');
      var on = (key === 'campaigns' && route === '#/campaigns') ||
               (key === 'new' && route.indexOf('#/new/') === 0);
      if (on) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
    var legend = document.getElementById('legend');
    legend.hidden = !state.ui.legendOpen;
    /* Only the topbar Legend button is a disclosure trigger, so only
       elements that already declare aria-expanded are updated. The legend's
       "Close legend" button is an action, not a trigger, and stays out of it. */
    var lbtns = document.querySelectorAll('[data-act="toggle-legend"]');
    for (var k = 0; k < lbtns.length; k++) {
      if (lbtns[k].getAttribute('aria-expanded') !== null) {
        lbtns[k].setAttribute('aria-expanded', state.ui.legendOpen ? 'true' : 'false');
      }
    }
  }

  /* ====================================================== draft generation */

  function startDrafting() {
    var c = state.campaign;
    if (state.ui.drafted) return;      /* Back must not re-draft */
    state.ui.drafting = true;
    render();
    state.ui.draftTimer = setTimeout(function () {
      state.ui.draftTimer = null;
      var key = goalKeyOf(c.goal);
      var list = DATA.drafts[key] || DATA.drafts.generic;
      c.draftKey = list.length > 1 ? key : 'generic';
      c.draftIndex = 0;
      c.message = list[0];
      c.warningsAck = false;
      state.ui.drafted = true;
      state.ui.drafting = false;
      touchDraft();
      render();
      var ta = document.getElementById('draft-input');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }, 1500);
  }

  function regenerate() {
    var c = state.campaign;
    var key = c.draftKey || goalKeyOf(c.goal);
    var list = DATA.drafts[key] || DATA.drafts.generic;
    c.draftIndex = (c.draftIndex + 1) % list.length;
    c.message = list[c.draftIndex];
    c.warningsAck = false;
    touchDraft();
    render();
    var ta = document.getElementById('draft-input');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  /* ========================================== surgical live-region updates */

  function syncGoalDerived() {
    var len = state.campaign.goal.trim().length;
    var count = document.getElementById('goal-count');
    var help = document.getElementById('goal-help');
    var next = document.querySelector('[data-act="next"]');
    if (count) count.textContent = len + ' characters';
    if (help) {
      help.textContent = len >= 10
        ? 'Goal saved. Press Next to write the first draft.'
        : 'Next is disabled until the goal has at least 10 characters. You have ' + len + '.';
    }
    if (next) next.disabled = len < 10;
    var hintEl = document.getElementById('gate-hint');
    if (hintEl) hintEl.textContent = gateHint(state.ui.route);
    var chips = document.querySelectorAll('[data-act="use-goal"]');
    for (var i = 0; i < chips.length; i++) {
      var g = DATA.goals[chips[i].getAttribute('data-key')];
      chips[i].setAttribute('aria-pressed',
        norm(state.campaign.goal) === norm(g.label) ? 'true' : 'false');
    }
  }

  function syncDraftDerived() {
    var text = state.campaign.message || '';
    var cc = document.getElementById('draft-count');
    if (cc) cc.textContent = charInfo(text).text;
    var pv = document.getElementById('preview-text');
    if (pv) pv.textContent = previewText(text) || '(no message yet)';
    var cn = document.getElementById('channel-note');
    if (cn) cn.textContent = channelNote();
    var pc = document.getElementById('preview-channel');
    if (pc && state.campaign.channel) pc.textContent = state.campaign.channel + ' preview';
  }

  /* ==================================================== campaign lifecycle */

  function findCampaign(id) {
    var found = null;
    state.campaigns.forEach(function (c) { if (c.id === id) found = c; });
    return found;
  }

  function resumeCampaign(id) {
    var c = findCampaign(id);
    if (!c) return;
    var keep = state.campaign;
    state.campaign = {
      goal: c.goal || '',
      message: c.message || '',
      draftKey: goalKeyOf(c.goal) === 'generic' ? 'generic' : goalKeyOf(c.goal),
      draftIndex: 0,
      channel: c.channel || '',
      segmentId: c.segmentId || DATA.segments[0].id,
      scheduleMode: '',
      scheduleAt: '',
      warningsAck: false,
      name: c.name || ''
    };
    state.ui.drafted = !!keep.message;
    state.ui.savedAt = null;
    paintStatusLine();
    go('#/new/draft');
  }

  function doSend() {
    var c = state.campaign;
    var seg = segmentById(c.segmentId);
    /* The forward button is disabled until a timing choice is made, so this
       guard should never fire. It stops an unset choice silently behaving as
       "send now" if it ever did. */
    if (!c.scheduleMode) return;
    var schedule = c.scheduleMode === 'schedule';

    function build(status) {
      return {
        id: 'cmp_' + (Date.now()),
        name: c.name || campaignNameFor(c.goal),
        goal: c.goal,
        channel: c.channel,
        segmentId: c.segmentId,
        status: status,
        updated: stampNow(),
        message: c.message,
        scheduledFor: schedule ? formatWhen(c.scheduleAt) : ''
      };
    }

    if (!schedule) {
      openDialog({
        title: 'Send this message now?',
        body: '<p><strong>' + nfmt(seg.count) + ' people</strong> will receive this message. ' +
            'Sending can\'t be undone.</p>' +
          '<p class="msg msg-warning">Warning: there is no Undo on the confirmation toast after ' +
            'sending. This is deliberate, which is why this dialog says so and puts Cancel under ' +
            'the keyboard focus by default.</p>' +
          '<p class="muted small">Cancel is focused. Press Escape to cancel as well.</p>',
        cancelLabel: 'Cancel',
        confirmLabel: 'Send now',
        defaultFocus: 'cancel',
        onConfirm: function () {
          closeDialog();
          var row = build('Sent');
          state.campaigns.push(row);
          state.campaign = freshCampaign();
          state.ui.drafted = false;
          showToast({ text: 'Sent ' + nfmt(seg.count) + ' messages. There is no Undo for sending.', ms: 7000 });
          go('#/campaigns');
        }
      });
      return;
    }

    if (!c.scheduleAt) {
      state.ui.schedError = 'Error: pick a date and time before scheduling.';
      render();
      return;
    }

    openDialog({
      title: 'Schedule this campaign?',
      body: '<p>This will schedule <strong>' + nfmt(seg.count) + ' messages</strong> for <strong>' +
          esc(formatWhen(c.scheduleAt)) + '</strong>. You can cancel the schedule later.</p>' +
        '<p class="muted small">After confirming you get 8 seconds to Undo from the toast on the ' +
        'dashboard.</p>',
      cancelLabel: 'Cancel',
      confirmLabel: 'Schedule',
      onConfirm: function () {
        closeDialog();
        var row = build('Scheduled');
        state.campaigns.push(row);
        state.campaign = freshCampaign();
        state.ui.drafted = false;
        showToast({
          text: 'Campaign scheduled. Undo',
          ms: 8000,
          undo: function () {
            var i = state.campaigns.indexOf(row);
            if (i !== -1) state.campaigns.splice(i, 1);
            showToast({ text: 'Schedule undone. The campaign was not created.', ms: 5000 });
            render();
          }
        });
        go('#/campaigns');
      }
    });
  }

  /* Single entry point for signing in. The login button is type="submit" so
     that Enter works, which means both a click and an Enter key arrive here as
     a submit event. Handling only that event stops the logic running twice. */
  function doSignin() {
    var u = document.getElementById('login-user').value.trim();
    var p = document.getElementById('login-pass').value.trim();
    var errs = {};
    if (!u) errs.username = 'Error: enter a username.';
    if (!p) errs.password = 'Error: enter a password.';
    if (errs.username || errs.password) {
      state.ui.loginErrors = errs;
      render();
      var firstBad = errs.username ? document.getElementById('login-user')
                                  : document.getElementById('login-pass');
      if (firstBad) firstBad.focus();
      return;
    }
    state.ui.loginErrors = {};
    state.user = { name: DATA.user.name };
    state.ui.lastRoute = '';
    go('#/campaigns');
  }

  /* =============================================================== events */

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var c = state.campaign;

    switch (act) {
      case 'signout':
        state.user = null;
        state.campaigns = [];
        state.campaign = freshCampaign();
        state.ui.drafted = false;
        state.ui.savedAt = null;
        state.ui.lastRoute = '';
        state.ui.loginErrors = {};
        go('#/login');
        return;

      case 'toggle-legend':
        state.ui.legendOpen = !state.ui.legendOpen;
        paintTopbar(state.ui.route);
        return;

      case 'new-campaign':
        state.campaign = freshCampaign();
        state.ui.drafted = false;
        state.ui.savedAt = null;
        state.ui.loginErrors = {};
        go('#/new/goal');
        return;

      case 'resume':
        resumeCampaign(el.getAttribute('data-id'));
        return;

      case 'view':
        showToast({ text: 'This prototype does not open a sent campaign. The row stays on the dashboard.', ms: 5000 });
        return;

      case 'cancel-schedule':
        var row = findCampaign(el.getAttribute('data-id'));
        if (!row) return;
        var seg = segmentById(row.segmentId);
        openDialog({
          title: 'Cancel this schedule?',
          body: '<p><strong>' + esc(row.name) + '</strong> is scheduled for ' +
              esc(row.scheduledFor || 'a set time') + ' for ' + nfmt(seg.count) +
              ' people.</p><p>Cancelling moves it back to Draft. You can undo this from the toast.</p>',
          cancelLabel: 'Keep schedule',
          confirmLabel: 'Cancel schedule',
          onConfirm: function () {
            closeDialog();
            var wasStatus = row.status;
            var wasWhen = row.scheduledFor;
            row.status = 'Draft';
            row.scheduledFor = '';
            row.updated = stampNow();
            render();
            showToast({
              text: 'Schedule cancelled. Undo',
              ms: 8000,
              undo: function () {
                row.status = wasStatus;
                row.scheduledFor = wasWhen;
                showToast({ text: 'Schedule restored.', ms: 5000 });
                render();
              }
            });
          }
        });
        return;

      case 'use-goal':
        var g = DATA.goals[el.getAttribute('data-key')];
        state.campaign.goal = g.label;
        state.campaign.segmentId = g.segmentId;
        state.campaign.draftKey = g.key;
        state.campaign.draftIndex = -1;
        state.campaign.warningsAck = false;
        /* A fresh example goal invalidates any existing draft. */
        state.ui.drafted = false;
        state.campaign.message = '';
        touchDraft();
        render();
        var gi = document.getElementById('goal-input');
        if (gi) { gi.focus(); gi.setSelectionRange(gi.value.length, gi.value.length); }
        return;

      case 'regenerate':
        regenerate();
        return;

      case 'goto-goal':
        go('#/new/goal');
        return;

      case 'goto-draft':
        go('#/new/draft');
        return;

      case 'fix-optout':
        c.message = String(c.message || '').replace(/\s*$/, '') + ' Reply STOP to opt out';
        c.warningsAck = false;
        touchDraft();
        render();
        return;

      case 'fix-template':
        c.message = bestApprovedTemplate(c.message);
        c.warningsAck = false;
        touchDraft();
        render();
        return;

      case 'back':
        go(backRoute(state.ui.route));
        return;

      case 'next':
        if (!nextEnabled(state.ui.route)) return;
        if (state.ui.route === '#/new/goal') {
          go('#/new/draft');
          startDrafting();
        } else {
          go(STEPS[stepIndex(state.ui.route) + 1].route);
        }
        return;

      case 'send':
        state.ui.schedError = null;
        doSend();
        return;
    }
  });

  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'login-form') {
      e.preventDefault();
      doSignin();
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'goal-input') {
      state.campaign.goal = t.value;
      state.campaign.warningsAck = false;
      syncGoalDerived();
      touchDraft();
    } else if (t.id === 'draft-input') {
      state.campaign.message = t.value;
      state.campaign.warningsAck = false;
      syncDraftDerived();
      touchDraft();
    } else if (t.id === 'login-user' || t.id === 'login-pass') {
      /* Clear that field's error as soon as the user starts typing. Remove
         just the error node rather than re-rendering, so the caret, the
         focus and the other field's value all survive. */
      var key = t.id === 'login-user' ? 'username' : 'password';
      if (state.ui.loginErrors[key]) {
        delete state.ui.loginErrors[key];
        var errNode = document.getElementById(key + '-err');
        if (errNode && errNode.parentNode) errNode.parentNode.removeChild(errNode);
        t.removeAttribute('aria-invalid');
        t.removeAttribute('aria-describedby');
      }
    } else if (t.id === 'sched-when') {
      state.campaign.scheduleAt = t.value;
      state.ui.schedError = null;
      touchDraft();
      var err = document.getElementById('sched-when-err');
      if (err) { err.hidden = true; err.textContent = ''; }
      var help = document.getElementById('sched-when-help');
      if (help && t.value) {
        help.textContent = 'Will send ' + nfmt(segmentById(state.campaign.segmentId).count) +
          ' messages ' + formatWhen(t.value) + '.';
      }
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'notes-toggle') {
      state.ui.notesOn = t.checked;
      renderPreservingFocus();
    } else if (t.name === 'channel') {
      state.campaign.channel = t.value;
      state.campaign.warningsAck = false;
      state.ui.schedError = null;
      syncDraftDerived();
      touchDraft();
      var wa = document.getElementById('wa-note');
      if (wa) wa.innerHTML = whatsappTemplateBlock(state.campaign.message);
      var warn = document.getElementById('warn-ack');
      if (warn) warn.checked = state.campaign.warningsAck;
      syncFlowGating();
    } else if (t.id === 'segment-select') {
      state.campaign.segmentId = t.value;
      touchDraft();
      var help = document.getElementById('segment-help');
      if (help) help.textContent = nfmt(segmentById(t.value).count) + ' people will receive this message.';
    } else if (t.name === 'schedmode') {
      state.campaign.scheduleMode = t.value;
      state.ui.schedError = null;
      touchDraft();
      render();
    } else if (t.id === 'warn-ack') {
      state.campaign.warningsAck = t.checked;
      render();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.ui.dialog) {
      e.preventDefault();
      state.ui.dialog.opts.onCancel ? state.ui.dialog.opts.onCancel() : closeDialog();
      return;
    }
    if (e.key === 'Escape' && !state.ui.dialog && state.ui.notesOn) {
      /* Esc is only required to close dialogs. Nothing else listens. */
    }
  });

  document.addEventListener('click', function (e) {
    if (state.ui.dialog && e.target.classList &&
        e.target.classList.contains('dialog-backdrop')) {
      closeDialog();
      return;
    }
    var d = e.target.closest ? e.target.closest('[data-dlg]') : null;
    if (d && state.ui.dialog) {
      var which = d.getAttribute('data-dlg');
      if (which === 'cancel') {
        state.ui.dialog.opts.onCancel ? state.ui.dialog.opts.onCancel() : closeDialog();
      } else {
        state.ui.dialog.opts.onConfirm();
      }
    }
  });

  /* ================================================================ start */

  DATA.campaigns.forEach(function (c) { state.campaigns.push(c); });
  document.getElementById('notes-toggle').checked = false;
  if (!location.hash) location.hash = '#/login';
  render();
  window.addEventListener('hashchange', render);

})();