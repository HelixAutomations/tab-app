// Minimal, code-defined scenarios for quick compose
// Keep content plain text for best Outlook compatibility; placeholders rIn terms of costs I am a [ROLE] and my hourly rate is [RATE]. We charge on a time recorded basis in 6minute units for all steps and work including emails in and out and telephone attendances. Here I have advised that you will need to budget [INSERT] for an initial review and advice. This is an estimate and not a fixed fee, but my hope and expectation is that at this stage you will be clear on where you stand. We can then discuss next steps at that stage. Further work will incur additional cost.main [TOKEN]

/**
 * Version token that changes whenever this module content is actually modified.
 * Import this in consumers and use it in a useEffect dependency to refresh
 * any local state derived from these scenarios without requiring a manual remount.
 * Only increment this manually when you change the scenarios content.
 */
export const SCENARIOS_VERSION: number = 4;

export type Scenario = {
  /** Stable id for persistence */
  id: string;
  /** Short display name for the button */
  name: string;
  /** Email subject line */
  subject: string;
  /** Email body (plain text, may include [TOKENS]) */
  body: string;
};

/**
 * Scenario presets used by the Pitch Builder.
 * Subheadings have been removed; subtle separators (— — —) are used for readability.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: 'before-call-call',
    name: 'Before call — Call',
    subject: 'Pitch before call — Call',
  body: `Thank you for your enquiry to Helix Law. I have set out below some details that I hope help in relation to your enquiry. We’re a specialist firm of solicitors and we only deal with litigation and disputes. We act nationally.

We often deal with disputes such as yours and I am confident we are well-placed to assist in relation to your matter.

Please let me know if you’re available for a call. The easiest way to schedule this is via the following link [Calendly]

In advance of the call it would be helpful if you can share with me [INSERT]

Transparently we charge for our time on an hourly rate basis. My hourly rate is [RATE] as a [ROLE]. There is no cost or obligation at this stage including for the call above. During the call I will try to give you an initial informal steer on your current position, next steps and costs and we can take it from there.

I look forward to speaking with you.`
  },
  {
    id: 'before-call-no-call',
    name: 'Before call — No call',
    subject: 'Pitch before call — No call',
  body: `Thank you for your enquiry to Helix Law. We're a specialist firm of solicitors and we only deal with litigation and disputes. We act nationally.

We haven't yet spoken but I have reviewed the details and information you have helpfully provided, thank you. You appear to be in a dispute with [INSERT] relating to [INSERT] and you have confirmed that [INSERT].

The dispute with [INSERT] creates difficulty for obvious reasons and you have asked [INSERT].

In addition to the above you should also consider [INSERT] as an additional aspect to keep in mind.

My immediate informal view is that your best next steps are likely to be [INSERT] but transparently I need to spend time reviewing your position and advising you on your current position and best next steps.

Transparently we charge for our time on an hourly rate basis. My hourly rate is [RATE] as a [ROLE]. Here you will need to budget [INSERT] for an initial review and advice, including a telephone conference to discuss your matter. This is an estimate and not a fixed fee, and I will confirm this when I have received all your documents and information. During the call I will try to give you an initial informal steer on your current position, next steps and costs and we can take it from there.

If you wish to go ahead please send me core documents such as [INSERT the contracts, notices, demands, accounts, relevant correspondence set out below] so that we can be as clear as possible on the factual position. I then anticipate confirming my advice on your best next steps.

To confirm our instructions please click [InstructLink]. This single link will verify your identity, request core documents and allow you to pay our funds on account.

As soon as you have completed this step we will be able to open a file and move this forward immediately. A retainer will be created with us when we send you our Client Care Letter in due course and it is only at that point that your instructions will be confirmed.

I hope the above is helpful and look forward to assisting you with this.`
  },
  {
    id: 'after-call-probably-cant-assist',
    name: 'After call — Probably can’t assist',
    subject: 'Pitch after call — Probably can’t assist',
    body: `Thank you for your enquiry and for your time on the phone earlier. It was good speaking with you.

The purpose of this email is to briefly follow up on our conversation which I hope you found useful.

We discussed that you are [INSERT]. You have a dispute with [INSERT] because [INSERT] and have confirmed that [INSERT].

The dispute with [INSERT] creates difficulty for you for obvious reasons, including because [INSERT].

One approach you might now consider taking is [INSERT]. This might be a cost effective way for you to now proceed.

For reasons we discussed in our call now may not be an appropriate time for you to instruct us but I have set out further details below in case you want to proceed. You should always keep in mind the cost; benefit, proportionality and timing of instructing us and incurring costs. For our part we are happy to assist you but transparently we charge for our work and time. I am a [ROLE] and my hourly rate is [RATE]. In terms of an initial review and advice you will need to budget [INSERT] which is a cost estimate and not a fixed fee. Further steps and time will incur additional cost.

If you wish to confirm our instructions notwithstanding the above please confirm your instructions by clicking [InstructLink]. This link will verify your identity, enable you to provide key documents and provide funds on account of costs in a quick and straightforward process.

On receipt of the above from you I will review the position and will confirm our cost estimate and we will then open a file and take it from there.

I hope the above [and our call] is useful and of course come back to me if I can help you further.

In the meantime, I’m wondering if you can help me by providing a brief positive Google review of me and Helix Law. We’re a small but specialist team, and this would make a huge difference to us.

If you don’t mind, please can you give us a brief 5* positive review at the following link:

http://bit.ly/2gGwyNJ

You will need to be signed into Google.

Many thanks in advance.`
  },
  {
    id: 'after-call-want-instruction',
    name: 'After call — Want the instruction',
    subject: 'Pitch after call — Want the instruction',
    body: `Thank you for your enquiry and for your time on the phone earlier. It was good speaking with you.

The purpose of this email is to briefly follow up on our conversation which I hope you found useful. I’d love to assist you with this and consider we’re well placed to do so. Don’t hesitate to contact me if you have any queries, otherwise I have set out next steps below to assist you.

We have discussed that you are [INSERT]. You have a dispute with [INSERT] because [INSERT] and have confirmed that [INSERT].

The dispute with [INSERT] situation creates difficulty for you for obvious reasons, including because [INSERT].

There are further potential problems and issues arising from the above that may need to be considered and addressed, such as [INSERT]. I will consider that further with you, within my review and advice.

In terms of most appropriate next steps clearly there is some complexity here and we have discussed that I need to formally review and advise on the background, your current position and your best next steps.

Ideally it would be helpful if you can please provide core documents including [INSERT the contracts, notices, demands, accounts, relevant correspondence set out below] so that I can understand what has happened to date as quickly as possible.

In terms of costs, we record and bill for our time in 6-minute units, so one hour is 10 units. We charge for all steps and work, including emails in and out, and telephone calls. Senior Partners record and bill at £475+VAT per hour, Partners at £425+VAT per hour, Associate Solicitors at £350+VAT per hour, Solicitors at £310+VAT per hour, and Trainee Solicitors and Paralegals at £210+VAT per hour. Here, for the initial review and advice, you will need to budget in the region of approximately [INSERT]+VAT. This is an estimate and not a fixed fee, but my hope and expectation is that at this stage, you will be clear on where you stand. We can then discuss the next steps at that stage. Further work will incur additional cost.

Please confirm your instructions by clicking [InstructLink]. This single link will allow you to verify your identity, provide the key documents needed and provide funds on account of costs in a quick and transparent checkout process.

Once provided I will briefly review this to confirm our time and cost estimate is accurate and we will then open a file. At that stage you will receive our Client Care Letter formally confirming the terms of our retainer.

I hope the above and our call have been useful and of course come back to me if I can help you further. I look forward to assisting you with this.`
  },
  {
    id: 'cfa',
    name: 'CFA',
    subject: 'Your Enquiry - Helix Law',
    body: `Thanks for your email. I am a [ROLE] and specialise in [INSERT].

As a starting point, please email me a brief summary of your situation and dispute — including the background, current position, your losses and how you've calculated them. I will review this and we can take it from there.

I note you are enquiring about alternative no win no fee funding. We aren't obliged to offer that type of funding and will only do so where it stacks up for you and for us.

In that context, please provide as much focussed/relevant information as you can, illustrating your case and who it is against, and we can consider this further.

At this stage there is no cost or obligation.

I look forward to hearing from you.`
  }
];
