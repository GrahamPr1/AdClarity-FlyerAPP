// English strings for every NOP agent-facing screen, server message and
// email. es.ts must carry exactly these keys (checked by its type).
//
// Placeholders are {name}; fill them with tNop(). Keep values flat strings so
// the whole set exports to one review CSV for Basic Benefits.
//
// The auth.* values are the sign-in page's existing English, word for word:
// a NOP visitor in English sees exactly what everyone else sees.

export const en = {
  // ---- Page chrome ----
  "page.back_dashboard": "← Dashboard",
  "page.sign_out": "Sign out",
  "register.meta_title": "Agent registration",
  "register.title": "Register as a program agent",
  "register.intro": "Your Agent ID ties every flyer and QR code to you, so we confirm it's yours before linking it to this account.",
  "profile.meta_title": "Agent profile",
  "profile.title": "Your agent profile",
  "profile.intro": "Your Agent ID and program details come from your program administrator. The name, phone and email on your flyers are yours to edit.",

  // ---- Language toggle (bilingual on purpose, the same in both files) ----
  "lang.group": "Language / Idioma",
  "lang.en": "English / Inglés",
  "lang.es": "Español / Spanish",

  // ---- Shared ----
  "common.loading": "Loading…",
  "common.network": "We couldn't reach the server. Check your connection and try again.",
  "common.generic": "Something went wrong.",

  // ---- Registration steps ----
  "reg.id_label": "Agent ID",
  "reg.id_placeholder": "Issued by your program",
  "reg.continue": "Continue",
  "reg.checking": "Checking…",
  "reg.email_intro": "Agent ID {agentId}. Enter the email your program administrator has on file for you. We'll send a code there.",
  "reg.email_label": "Verification email",
  "reg.send_code": "Send code",
  "reg.sending": "Sending…",
  "reg.change_id": "Change Agent ID",
  "reg.code_sent_to": "We sent a 6-digit code to {sentTo}. It expires in 15 minutes.",
  "reg.code_sent": "We sent a 6-digit code. It expires in 15 minutes.",
  "reg.code_label": "Verification code",
  "reg.verify": "Verify",
  "reg.start_over": "Start over",
  "reg.confirm_line": "You are registering as {name}, Agent ID {agentId}.",
  "reg.confirm_help": "These are how you appear on your flyers. You can change them later. They never change your Agent ID or the details your program has on file.",
  "reg.confirm_submit": "Confirm and register",
  "reg.registering": "Registering…",
  "reg.not_me": "That's not me",
  "reg.done": "This account is registered as Agent ID {agentId}.",
  "reg.view_profile": "View your agent profile →",

  // ---- Display fields (registration and profile) ----
  "display.name": "Name on your flyers",
  "display.phone": "Phone on your flyers",
  "display.phone_placeholder": "(XXX) XXX-XXXX",
  "display.email": "Email on your flyers",

  // ---- Profile ----
  "profile.not_registered": "This account isn't registered as an agent.",
  "profile.register_link": "Register with your Agent ID",
  "profile.agent_id": "Agent ID",
  "profile.company": "Company",
  "profile.referral": "Referral code",
  "profile.enrollment_link": "Enrollment link",
  "profile.status": "Status",
  "status.active": "active",
  "status.pending": "pending",
  "status.suspended": "suspended",
  "status.terminated": "terminated",
  "status.not_on_roster": "not on roster",
  "profile.save": "Save",
  "profile.saving": "Saving…",
  "profile.saved": "Saved.",
  "profile.save_failed": "Couldn't save. Try again.",

  // ---- Server messages: registration ----
  "err.id_format": "Agent IDs are 1–10 digits.",
  "err.not_recognized": "Agent ID not recognized. Contact your program administrator.",
  "err.inactive": "This Agent ID can't be registered right now. Contact your program administrator.",
  "err.taken": "This Agent ID is already registered to another account. Your program administrator has been notified.",
  "err.email_mismatch": "That email doesn't match our records for this Agent ID. Your program administrator has been notified.",
  "err.account_registered": "This account is already registered as Agent ID {agentId}.",
  "err.expired": "Your code expired or your registration timed out. Please enter your Agent ID again.",
  "err.too_many": "Too many incorrect codes. Start again.",
  "err.wrong_code": "That code isn't right. Check the email and try again.",
  "err.send_failed": "We couldn't send the code. Try again in a moment.",
  "err.rate_limited": "Too many attempts. Wait a few minutes and try again.",

  // ---- Server messages: display-field validation ----
  "val.name_required": "Enter the name to show on your flyers.",
  "val.name_long": "Keep the name under 80 characters.",
  "val.phone": "Enter a 10-digit US phone number.",
  "val.email": "Enter a valid email address.",

  // ---- Generation block (returned by the four AI routes) ----
  "gen.blocked": "NOP flyers are generated from approved templates — coming soon",

  // ---- Verification email ----
  "email.subject": "Your {program} verification code: {code}",
  "email.intro": "Your OneFlyer verification code for the {program} is:",
  "email.expires": "It expires in 15 minutes. If you didn't try to register, you can ignore this email.",

  // ---- Sign-in / sign-up (shown translated only in NOP context) ----
  "auth.home_label": "OneFlyer — back to homepage",
  "auth.heading_login": "Client Login",
  "auth.heading_signup": "Create your account",
  "auth.heading_forgot": "Reset your password",
  "auth.sub_login": "Log in with your email and password to see your own flyers.",
  "auth.sub_signup": "Set up an email and password to save your flyers.",
  "auth.sub_signup_start": "One quick step, then you're straight into your first campaign. We need an account so your flyers are saved and only you can see them.",
  "auth.sub_forgot": "We'll email you a link to set a new one.",
  "auth.email_label": "Email",
  "auth.email_placeholder": "you@business.com",
  "auth.password_label": "Password",
  "auth.forgot_link": "Forgot password?",
  "auth.login_btn": "Log in",
  "auth.logging_in": "Signing you in…",
  "auth.no_account": "Don't have an account? Sign up",
  "auth.pw_placeholder": "At least 8 characters",
  "auth.pw_req_empty": "Must be at least 8 characters.",
  "auth.pw_req_ok": "Long enough.",
  "auth.pw_req_more_one": "1 more character needed.",
  "auth.pw_req_more": "{n} more characters needed.",
  "auth.confirm_pw": "Confirm password",
  "auth.create_btn": "Create account",
  "auth.creating": "Creating account…",
  "auth.have_account": "Already have an account? Log in",
  "auth.reset_btn": "Email me a reset link",
  "auth.sending": "Sending…",
  "auth.back_login": "← Back to login",
  "auth.reset_notice": "If that email has an account, a link to set a new password is on its way — check your inbox.",
  "auth.admin_toggle": "Site admin? Sign in with password",
  "auth.err_no_password": 'No password set for this email yet — use "Forgot password" to set one.',
  "auth.err_mismatch": "Incorrect email or password.",
  "auth.err_rate_limited": "Too many sign-in attempts. Please wait a few minutes and try again.",
  "auth.err_login_failed": "We couldn't sign you in just now. Your account is fine — please try again in a moment.",
  "auth.err_network": "Couldn't reach the server — check your connection and try again.",
  "auth.err_pw_mismatch": "Those two passwords don't match — retype them and try again.",
  "auth.err_exists": "An account with this email already exists — log in instead.",
  "auth.err_pw_short": "Password must be at least 8 characters",
  "auth.err_signup_failed": "We couldn't create your account just now. Nothing was charged or saved — please try again in a moment.",
  "auth.err_reset_failed": "Couldn't send the reset email right now — please try again later.",
  "auth.err_generic": "Something went wrong",

  // ---- Password reset (NOP visitors only; English = the original literals) ----
  "reset_email.subject": "Reset your OneFlyer password",
  "reset_email.intro": "Click the link below to set a new password for your OneFlyer account.",
  "reset_email.expires": "This link expires in 30 minutes and can only be used once. If you didn't request this, you can safely ignore this email.",
  "reset.heading": "Set a new password",
  "reset.sub": "Choose a password you'll use to log in from now on.",
  "reset.new_pw": "New password",
  "reset.confirm_pw": "Confirm new password",
  "reset.submit": "Set new password",
  "reset.saving": "Saving…",
  "reset.err_mismatch": "Passwords don't match.",
  "reset.err_missing": "This reset link is missing required information — please request a new one from the login page.",
  "reset.err_invalid": "This reset link is invalid or has expired — request a new one.",
} as const

export type NopStringKey = keyof typeof en
