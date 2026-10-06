/** Friendly names for the iOS share targets people most often send email with. */
const SHARE_TARGET_NAMES: [pattern: string, name: string][] = [
  ['com.apple.UIKit.activity.Mail', 'Mail'],
  ['com.google.Gmail', 'Gmail'],
  ['com.microsoft.Office.Outlook', 'Outlook'],
  ['com.yahoo.Aerogram', 'Yahoo Mail'],
  ['com.readdle.smartemail', 'Spark'],
  ['ch.protonmail', 'Proton Mail'],
  ['com.apple.UIKit.activity.Message', 'Messages'],
];

/** The app the share sheet handed the report to, when iOS tells us; null when unknown. */
export function describeShareTarget(activityType: string | null | undefined) {
  if (!activityType) return null;

  const match = SHARE_TARGET_NAMES.find(([pattern]) => activityType.includes(pattern));
  return match ? match[1] : null;
}

/** The text handed to the share sheet: recipients can't be prefilled, so name the address. */
export function buildShareMessage(email: { recipient: string; subject: string; body: string }) {
  return `To: ${email.recipient}\nSubject: ${email.subject}\n\n${email.body}`;
}
