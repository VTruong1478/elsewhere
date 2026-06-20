import { NextRequest, NextResponse } from "next/server";
import { createResendClient, EMAIL_FROM } from "@/lib/resend";

interface PlaceSubmissionRecord {
  id?: string;
  place_name?: string;
  address_or_location?: string;
  submitter_full_name?: string | null;
  submitted_from_search?: string | null;
  created_at?: string;
}

interface SupabaseWebhookPayload {
  type?: string;
  table?: string;
  schema?: string;
  record?: PlaceSubmissionRecord;
}

export async function POST(request: NextRequest) {
  console.log("[new-submission webhook] request received");

  const secret = process.env.SUPABASE_WEBHOOK_SECRET?.trim();
  const provided = request.headers.get("x-webhook-secret");

  // [webhook debug] — temporary
  const receivedSecret = request.headers.get("x-webhook-secret");
  const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  console.log("[webhook debug] received length:", receivedSecret?.length);
  console.log("[webhook debug] expected length:", expectedSecret?.length);
  console.log("[webhook debug] received (masked):", receivedSecret ? receivedSecret.slice(0, 4) + "..." + receivedSecret.slice(-4) : "NULL");
  console.log("[webhook debug] expected (masked):", expectedSecret ? expectedSecret.slice(0, 4) + "..." + expectedSecret.slice(-4) : "NULL");
  console.log("[webhook debug] all header keys received:", [...request.headers.keys()]);

  if (!secret || !provided || provided !== secret) {
    console.warn(
      "[new-submission webhook] secret check failed —",
      !secret ? "SUPABASE_WEBHOOK_SECRET not set in env" : "header value mismatch",
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[new-submission webhook] secret check passed");

  let payload: SupabaseWebhookPayload;
  try {
    payload = (await request.json()) as SupabaseWebhookPayload;
  } catch {
    console.error("[new-submission webhook] failed to parse request body as JSON");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log("[new-submission webhook] payload type:", payload.type, "table:", payload.table, "schema:", payload.schema);

  if (
    payload.type !== "INSERT" ||
    payload.table !== "place_submissions" ||
    payload.schema !== "public" ||
    typeof payload.record !== "object" ||
    payload.record === null
  ) {
    console.warn("[new-submission webhook] unexpected payload:", JSON.stringify(payload));
    return NextResponse.json({ error: "Unexpected payload shape" }, { status: 400 });
  }

  const record = payload.record;
  const place_name = record.place_name?.trim() ?? "(unknown)";
  const address_or_location = record.address_or_location?.trim() ?? "(unknown)";
  const submitter_full_name = record.submitter_full_name?.trim() || "anonymous";
  const submitted_from_search = record.submitted_from_search?.trim() || null;
  const created_at = record.created_at ?? new Date().toISOString();

  console.log("[new-submission webhook] record parsed — place:", place_name, "| submitter:", submitter_full_name);

  const toEmail = process.env.DEVELOPER_NOTIFICATION_EMAIL?.trim();
  if (!toEmail) {
    console.error("[new-submission webhook] DEVELOPER_NOTIFICATION_EMAIL is not set — skipping email");
    return NextResponse.json({ ok: true });
  }

  const resendKeyPrefix = process.env.RESEND_API_KEY?.trim().slice(0, 8) ?? "(not set)";
  console.log("[new-submission webhook] sending email to:", toEmail, "| RESEND_API_KEY prefix:", resendKeyPrefix);

  const searchLine = submitted_from_search
    ? `<tr><td style="padding:4px 0;color:#6B6A62;">Submitted from search:</td><td style="padding:4px 0 4px 16px;">${escHtml(submitted_from_search)}</td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#EFEBE0;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EFEBE0;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#FCF9F4;border-radius:8px;padding:32px 40px;max-width:560px;width:100%;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9B9A91;">Elsewhere</p>
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#2F2F2F;line-height:1.3;">New place submission</h1>
              <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #D2D4C7;margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 0 4px;color:#6B6A62;font-size:14px;" colspan="2">
                    A new place was submitted on Elsewhere.
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#6B6A62;font-size:14px;white-space:nowrap;">Place name</td>
                  <td style="padding:4px 0 4px 16px;color:#2F2F2F;font-size:14px;font-weight:600;">${escHtml(place_name)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#6B6A62;font-size:14px;white-space:nowrap;">Location</td>
                  <td style="padding:4px 0 4px 16px;color:#2F2F2F;font-size:14px;">${escHtml(address_or_location)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#6B6A62;font-size:14px;white-space:nowrap;">Submitted by</td>
                  <td style="padding:4px 0 4px 16px;color:#2F2F2F;font-size:14px;">${escHtml(submitter_full_name)}</td>
                </tr>
                ${searchLine}
                <tr>
                  <td style="padding:4px 0;color:#6B6A62;font-size:14px;white-space:nowrap;">Submitted at</td>
                  <td style="padding:4px 0 4px 16px;color:#2F2F2F;font-size:14px;">${escHtml(formatDate(created_at))}</td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#9B9A91;">
                Review it in the
                <a href="https://supabase.com/dashboard" style="color:#3E4F73;">place_submissions table in Supabase</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const resend = createResendClient();
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: toEmail,
      subject: `New place submission: ${place_name}`,
      html,
    });

    if (error) {
      console.error("[new-submission webhook] Resend returned an error:", JSON.stringify(error));
    } else {
      console.log("[new-submission webhook] email sent successfully, Resend id:", data?.id);
    }
  } catch (err) {
    console.error("[new-submission webhook] exception calling Resend:", err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({ ok: true });
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}
