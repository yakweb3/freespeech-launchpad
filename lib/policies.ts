export const RULES = [
  {
    title: "Challenge ideas. Leave people safe.",
    body: "Disagreement, criticism, and unpopular opinions belong here. Threats, targeted harassment, and calls for violence do not.",
  },
  {
    title: "Respect personal privacy.",
    body: "Do not publish private contact information, identifying records, or intimate material without consent.",
  },
  {
    title: "Keep the conversation usable.",
    body: "No spam, scams, impersonation, coordinated vote manipulation, or repetitive promotional posts.",
  },
  {
    title: "Share responsibly.",
    body: "Post material you have the right to share. No sexual exploitation, non-consensual sexual material, or other prohibited content. This initial community does not allow explicit sexual content.",
  },
  {
    title: "Moderation comes with a reason.",
    body: "Rules apply across viewpoints. Reports are reviewed by staff; report counts alone do not remove posts. You can appeal a decision.",
  },
];
export const POLICIES: Record<
  string,
  {
    title: string;
    intro: string;
    sections: { heading: string; body: string }[];
  }
> = {
  about: {
    title: "A place for open conversation",
    intro:
      "FreeSpeech is an independent community for questions, ideas, everyday experiences, and thoughtful disagreement.",
    sections: [
      {
        heading: "Built around the discussion",
        body: "Read publicly, choose a pseudonym, and join the conversation. Share text, photographs, links, and short videos. Use categories to find your interests and personal mute controls to shape your feed.",
      },
      {
        heading: "A small community, with room to grow",
        body: "We are starting with General, Society, Technology, Culture, and Feedback. Suggest improvements in Feedback. Community numbers reflect actual forum activity.",
      },
    ],
  },
  rules: {
    title: "Community guidelines",
    intro:
      "Make room for different perspectives. These initial guidelines apply to posts, comments, profiles, and uploaded media.",
    sections: RULES.map((r) => ({ heading: r.title, body: r.body })),
  },
  moderation: {
    title: "How moderation works",
    intro:
      "Moderation should be understandable, consistent, and open to correction.",
    sections: [
      {
        heading: "Reports start a review",
        body: "Choose a report reason and provide context. Staff review the content and the applicable rule. Reports do not automatically remove content, and disagreement alone is not a reason for removal.",
      },
      {
        heading: "Actions and explanations",
        body: "Staff may warn members, remove content, lock discussions, or restrict accounts. Affected members receive the reason in their notification inbox. Staff actions are logged internally.",
      },
      {
        heading: "Appeals",
        body: "Use Contact & appeals to explain what you believe was missed. Include the post link or action reference. Staff will respond in your support inbox. Muting a member changes your own experience; it does not restrict that member for everyone.",
      },
    ],
  },
  privacy: {
    title: "Privacy notice",
    intro:
      "Your posts are public. Your account email is private. Use a pseudonym if you prefer.",
    sections: [
      {
        heading: "Information the forum stores",
        body: "We store your sign-in identifier, private email supplied by the identity provider, chosen profile, posts, comments, uploads, votes, saved posts, notification preferences, reports, appeals, and moderation history. Technical request data may also be processed by the hosting provider for security and service operation.",
      },
      {
        heading: "Sign-in and cookies",
        body: "Sign-in is currently provided through ChatGPT. Authentication cookies are managed by that service. The forum stores browser-local drafts and reading positions, a navigation preference, and an additional security cookie after staff verification. No advertising trackers are added by this application.",
      },
      {
        heading: "Visibility and retention",
        body: "Public posts, comments, and profiles can be copied or indexed when the site is public. Emails, saved posts, reports, and private preferences are not public. You can export your account data or delete your account in Settings. Account deletion removes your profile and anonymizes retained discussion text; uploads and private preferences are deleted. Removed content may remain in restricted moderation records until an administrator purges it. Backups can retain previous versions until their retention period ends.",
      },
      {
        heading: "Requests and operator details",
        body: "Use Contact & appeals for privacy requests. Before public launch, the operator must supply their contact details and confirm jurisdiction-specific terms, age rules, and retention periods. This notice describes the implemented application and remains subject to that launch review.",
      },
    ],
  },
  terms: {
    title: "Terms of use",
    intro:
      "These initial terms describe how this community is intended to work. The operator must finalize them before public launch.",
    sections: [
      {
        heading: "Participation",
        body: "Choose an appropriate pseudonym and follow the community guidelines. Keep access to your sign-in account secure. This initial version is intended for adults; the operator must confirm its age policy before public launch.",
      },
      {
        heading: "Your content",
        body: "You retain your rights to your content. By submitting material, you allow the forum to store and display it to operate the discussion service. Only submit material you are entitled to share. Public submissions may be seen, indexed, or copied by others.",
      },
      {
        heading: "Moderation and availability",
        body: "Staff may enforce the published rules and explain restrictions. You may appeal through Contact & appeals. Service availability is not guaranteed. Important content should be backed up independently.",
      },
      {
        heading: "Account deletion",
        body: "Deleting your account removes identifying profile information and personal settings. Discussion text may remain under a deleted-member label to preserve conversation context. Review the Privacy notice and the deletion confirmation for details.",
      },
    ],
  },
};
