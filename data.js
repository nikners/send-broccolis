/* ==========================================================================
   SendSense — data.js
   ALL DATA IN THIS FILE IS SYNTHETIC AND HARDCODED FOR DEMONSTRATION.
   There is no backend, no API and no real AI. The "drafts" below are
   canned strings chosen by a lookup in app.js, not generated output.

   Loaded before app.js via a plain <script> tag.
   ========================================================================== */

window.SENDSENSE_DATA = {

  /* Shown in the top bar once signed in. Deliberately generic: this is a
     prototype, not a real account. */
  user: {
    name: 'Demo Operator'
  },

  /* ------------------------------------------------------------------
     Recipient segments (synthetic, invented counts)
     ------------------------------------------------------------------ */
  segments: [
    { id: 'seg_overdue', name: 'Overdue accounts',        count: 1240 },
    { id: 'seg_sale',    name: 'Weekend sale shoppers',   count: 3120 },
    { id: 'seg_appt',    name: 'Appointment reminders',  count: 486 }
  ],

  /* ------------------------------------------------------------------
     The three example goals offered on step 1 (Goal).
     `key` is how the rest of the app looks up canned drafts, a suggested
     channel and a default recipient segment.
     ------------------------------------------------------------------ */
  goals: {
    bill: {
      key: 'bill',
      label: 'Remind customers about overdue bills',
      segmentId: 'seg_overdue',
      campaignName: 'Bill reminder'
    },
    sale: {
      key: 'sale',
      label: 'Announce a weekend sale',
      segmentId: 'seg_sale',
      campaignName: 'Weekend sale announcement'
    },
    appt: {
      key: 'appt',
      label: "Confirm tomorrow's appointments",
      segmentId: 'seg_appt',
      campaignName: 'Appointment confirmation'
    }
  },

  /* Order the three example goals are shown in on step 1. */
  goalOrder: ['bill', 'sale', 'appt'],

  /* ------------------------------------------------------------------
     Canned "AI" drafts.
     app.js picks a list of 3 alternatives and cycles through them with the
     Regenerate button. The list has exactly ONE entry for `generic`, which
     is why Regenerate explains itself when the goal is not an example goal.

     Each draft contains the literal placeholder {name}. The phone preview
     replaces it with the sample name "Aisha". Any OTHER placeholder left in
     the text is what step 4 (Checks) flags as an error.
     ------------------------------------------------------------------ */
  drafts: {

    bill: [
      'Hi {name}, a friendly reminder that your bill is overdue. You can settle it online or by phone at any time. Thank you.',
      'Hi {name}, this is a gentle reminder that your most recent bill is still outstanding. You can pay online, by phone or in the app. If you have already paid then please ignore this message. Thank you for being a customer.',
      'Hi {name}, your balance of {amount} is now {days} days overdue. Please pay online or call us if you need help.'
    ],

    sale: [
      'Hi {name}, our weekend sale is on Friday. Save 20% this weekend only. Reply STOP to opt out',
      'Hi {name}, weekend sale: 20% off storewide through Sunday. Reply STOP to opt out',
      'Hi {name}, your weekend sale code is {code}. Save 20% in store this Friday and Saturday only. Reply STOP to opt out'
    ],

    appt: [
      'Hi {name}, confirming your appointment tomorrow at 10:00. Reply STOP to opt out',
      'Hi {name}, this is a reminder that you are booked in with us tomorrow morning. Please arrive five minutes early so we can start on time. If you need to move the appointment then call the number in your confirmation email. Thank you.',
      'Hi {name}, your appointment is tomorrow at {time}. See you then.'
    ],

    generic: [
      'Hi {name}, here is a short update from us. Reply STOP to opt out'
    ]
  },

  /* ------------------------------------------------------------------
     Suggested channel + one-line plain reason, per example goal.
     Used on step 3 (Channel). No suggestion exists for the generic goal.
     ------------------------------------------------------------------ */
  channelSuggestions: {
    bill: {
      channel: 'SMS',
      reason: 'A bill reminder is short and urgent, and SMS reaches any handset without an app install.'
    },
    sale: {
      channel: 'WhatsApp',
      reason: 'A sale announcement benefits from richer formatting, such as bold text, which WhatsApp supports.'
    },
    appt: {
      channel: 'SMS',
      reason: 'A reminder is short and time-critical, so SMS works even if the person never opens an app.'
    }
  },

  /* ------------------------------------------------------------------
     Approved WhatsApp templates.
     Step 4 (Checks) compares the normalised message against these. Exact
     normalised match = Pass, anything else = Error with a "Use approved
     template" fix.
     ------------------------------------------------------------------ */
  whatsappTemplates: [
    'Hi {name}, our weekend sale is on Friday. Save 20% this weekend only. Reply STOP to opt out',
    'Hi {name}, weekend sale: 20% off storewide through Sunday. Reply STOP to opt out',
    'Hi {name}, reminder: your bill is overdue. Pay online or call us. Reply STOP to opt out',
    'Hi {name}, confirming your appointment tomorrow at 10am. Reply STOP to opt out'
  ],

  /* ------------------------------------------------------------------
     Seeded campaigns for the dashboard: 1 Draft, 1 Scheduled, 2 Sent.
     `updated` is a fixed synthetic string, not derived from the clock.
     The Draft row carries a goal + message so "Resume" can load it back
     into the in-progress campaign in app.js.
     ------------------------------------------------------------------ */
  campaigns: [
    {
      id: 'cmp_seed_1',
      name: 'Autumn bill reminder',
      goal: 'Remind customers about overdue bills',
      channel: 'SMS',
      segmentId: 'seg_overdue',
      status: 'Draft',
      updated: '30 Sep 2026, 14:20',
      message: 'Hi {name}, a friendly reminder that your bill is overdue. You can settle it online or by phone at any time. Thank you.'
    },
    {
      id: 'cmp_seed_2',
      name: 'Weekend sale announcement',
      goal: 'Announce a weekend sale',
      channel: 'WhatsApp',
      segmentId: 'seg_sale',
      status: 'Scheduled',
      updated: '6 Oct 2026, 09:05',
      scheduledFor: 'Thursday, 15 October 2026 at 10:00',
      message: 'Hi {name}, our weekend sale is on Friday. Save 20% this weekend only. Reply STOP to opt out'
    },
    {
      id: 'cmp_seed_3',
      name: 'Appointment confirmation',
      goal: "Confirm tomorrow's appointments",
      channel: 'RCS',
      segmentId: 'seg_appt',
      status: 'Sent',
      updated: '2 Oct 2026, 11:40',
      message: 'Hi {name}, confirming your appointment tomorrow at 10:00. Reply STOP to opt out'
    },
    {
      id: 'cmp_seed_4',
      name: 'Opening hours change',
      goal: 'Tell customers about new opening hours',
      channel: 'SMS',
      segmentId: 'seg_sale',
      status: 'Sent',
      updated: '18 Sep 2026, 08:15',
      message: 'Hi {name}, our opening hours have changed. We are now open 9am to 6pm from Monday. Reply STOP to opt out'
    }
  ]
};