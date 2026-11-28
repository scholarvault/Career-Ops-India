/**
 * Portal Authentication & Dual-Hop Redirect Strategy Registry.
 * Defines safe human-in-the-loop sign-in methods across Indian job portals
 * without ever collecting passwords or bypassing bot checks.
 */

export type AuthMethod = "phone_otp" | "google_oauth" | "email_otp" | "email_password" | "browser_handover";

export interface PortalAuthProfile {
  id: string;
  name: string;
  supportedAuth: AuthMethod[];
  preferredAgentFlow: AuthMethod;
  headlessSessionReuse: boolean;
  /** Whether jobs on this portal often redirect out to an employer's external ATS site. */
  dualRedirectPattern: "mixed_redirect" | "mostly_portal" | "mostly_external";
  handlingNotes: string;
}

export const PORTAL_AUTH_PROFILES: PortalAuthProfile[] = [
  {
    id: "naukri",
    name: "Naukri",
    supportedAuth: ["email_otp", "phone_otp", "google_oauth", "email_password"],
    preferredAgentFlow: "email_otp",
    headlessSessionReuse: true,
    dualRedirectPattern: "mixed_redirect",
    handlingNotes:
      "OTP works purely in-app via naukriApi without typing passwords; Google One-Tap hands over to the visible Chrome pane (ui/browser.html). Roughly half of listings apply via Naukri questionnaire API and half redirect to Lever/Workday/SuccessFactors.",
  },
  {
    id: "apna",
    name: "Apna",
    supportedAuth: ["phone_otp", "google_oauth"],
    preferredAgentFlow: "phone_otp",
    headlessSessionReuse: true,
    dualRedirectPattern: "mostly_portal",
    handlingNotes:
      "Mobile-first (+91) OTP gateway; desktop web also offers Google sign-in. Requires persistent Chromium profile or phone OTP prompt in chat (connector planned).",
  },
  {
    id: "workindia",
    name: "WorkIndia",
    supportedAuth: ["phone_otp", "google_oauth"],
    preferredAgentFlow: "phone_otp",
    headlessSessionReuse: true,
    dualRedirectPattern: "mostly_portal",
    handlingNotes:
      "SMS/WhatsApp OTP authentication tied to +91 phone number; suited for blue/grey-collar and early-career ops, rare for 7-yr SaaS/AI Product roles (connector planned).",
  },
  {
    id: "indeed",
    name: "Indeed India",
    supportedAuth: ["google_oauth", "email_otp"],
    preferredAgentFlow: "google_oauth",
    headlessSessionReuse: true,
    dualRedirectPattern: "mixed_redirect",
    handlingNotes:
      "Strict Cloudflare + Turnstile protection + Google/email verification. Uses persistent profile data/browser-profile-indeed; fetchIndeedDetail detects whether a posting uses Indeed Easy Apply or redirects to the company's own ATS site.",
  },
  {
    id: "wellfound",
    name: "Wellfound (AngelList India)",
    supportedAuth: ["google_oauth", "email_password"],
    preferredAgentFlow: "google_oauth",
    headlessSessionReuse: true,
    dualRedirectPattern: "mixed_redirect",
    handlingNotes:
      "Best source for Seed/Series-A Founder's Office, 0-1, Co-Founder, and YC India roles; requires visible browser login handover once.",
  },
];
