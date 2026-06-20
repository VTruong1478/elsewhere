import "server-only";
import { Resend } from "resend";

export const EMAIL_FROM = "noreply@goworkelsewhere.com";

export function createResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  return new Resend(apiKey);
}
