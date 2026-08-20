import { hasAdminAccess } from "./options";

/**
 * The tabs across the top, for whoever is looking, inside one hub.
 *
 * A student gets one. Admins get the ones that run the offer, plus a way into the
 * student view — being able to see what a course actually looks like before publishing
 * it is half of what "hidden" is for.
 *
 * Every href is scoped to the hub, so switching offers keeps you on the same tab.
 */
export function tabsFor(role: string, slug: string) {
  const base = `/h/${slug}`;
  if (!hasAdminAccess(role)) return [{ href: base, label: "Courses" }];
  return [
    { href: `${base}/manage`, label: "Courses" },
    { href: `${base}/students`, label: "Students" },
    { href: `${base}/progress`, label: "Progress" },
    { href: `${base}/settings`, label: "Settings" },
    { href: base, label: "Student view" },
  ];
}
