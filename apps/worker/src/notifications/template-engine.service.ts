import { Injectable, Logger } from "@nestjs/common";
import * as Handlebars from "handlebars";

export interface RenderedTemplate {
    subject: string;
    htmlBody: string;
    textBody: string;
}

@Injectable()
export class NotificationTemplateEngineService {
    private readonly logger = new Logger(NotificationTemplateEngineService.name);
    private readonly templates = new Map<string, { subject: Handlebars.TemplateDelegate; html: Handlebars.TemplateDelegate; text: Handlebars.TemplateDelegate }>();

    constructor() {
        this.registerDefaultTemplates();
    }

    private registerDefaultTemplates() {
        this.templates.set("staff_invitation", {
            subject: Handlebars.compile("You have been invited to BookPro"),
            html: Handlebars.compile(`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;background:#0b1428;color:#eaf2ff;border-radius:16px"><h1 style="margin-top:0">Join your team on BookPro</h1><p style="color:#a8b5ca;line-height:1.6">A workspace administrator invited you to join their BookPro team. This secure, single-use invitation expires {{expiresAt}}.</p><p style="margin:28px 0"><a href="{{invitationUrl}}" style="display:inline-block;padding:13px 20px;background:#38bdf8;color:#06101f;text-decoration:none;border-radius:9px;font-weight:700">Accept invitation</a></p><p style="color:#7888a3;font-size:12px">If you were not expecting this invitation, you can ignore this email.</p></div>`),
            text: Handlebars.compile("You have been invited to join a BookPro workspace. Accept this single-use invitation before {{expiresAt}}: {{invitationUrl}}"),
        });
        this.templates.set("customer_invitation", {
            subject: Handlebars.compile("{{studioName}} invited you to connect on BookPro"),
            html: Handlebars.compile(`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;background:#0b1428;color:#eaf2ff;border-radius:16px"><h1 style="margin-top:0;font-size:24px;color:#ffffff">{{studioName}} Customer Invitation</h1><p style="color:#a8b5ca;line-height:1.6">You have been invited by <strong>{{studioName}}</strong> to connect your customer account on BookPro. This allows you to manage appointments, view booking history, and access member services.</p><p style="color:#a8b5ca;line-height:1.6">Sign in with the invited email address, or create and verify your customer account first. This secure, single-use invitation expires {{expiresAt}}.</p><p style="margin:28px 0"><a href="{{invitationUrl}}" style="display:inline-block;padding:14px 24px;background:#38bdf8;color:#06101f;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">Review & Accept Invitation</a></p><p style="color:#7888a3;font-size:12px">If you were not expecting this invitation, you can safely ignore this email.</p></div>`),
            text: Handlebars.compile("{{studioName}} invited you to connect your customer account on BookPro. Review your single-use invitation before {{expiresAt}}: {{invitationUrl}}"),
        });
        this.templates.set("email_verification", {
            subject: Handlebars.compile("Complete your BookPro registration"),
            html: Handlebars.compile(`
                <!doctype html>
                <html lang="en">
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm your BookPro email</title></head>
                <body style="margin:0;padding:0;background:#050a17;color:#eaf2ff;font-family:Arial,'Helvetica Neue',sans-serif;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#050a17;">
                    <tr><td align="center" style="padding:40px 16px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#0b1428;border:1px solid #22304b;border-radius:20px;overflow:hidden;box-shadow:0 24px 64px #00000066;">
                        <tr><td style="padding:28px 32px;border-bottom:1px solid #22304b;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
                            <td style="font-size:20px;font-weight:800;letter-spacing:-0.4px;color:#ffffff;">Book<span style="color:#38bdf8;">Pro</span></td>
                            <td align="right"><span style="display:inline-block;padding:6px 10px;border:1px solid #1e749c;border-radius:999px;color:#7dd3fc;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Secure email check</span></td>
                          </tr></table>
                        </td></tr>
                        <tr><td style="padding:36px 32px 32px;">
                          <p style="margin:0 0 12px;color:#7dd3fc;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Registration confirmation</p>
                          <h1 style="margin:0 0 16px;color:#ffffff;font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-0.7px;">Confirm your email</h1>
                          <p style="margin:0 0 24px;color:#a8b5ca;font-size:15px;line-height:1.7;">Hello {{fullName}}, enter this code in BookPro to confirm that you control this email address.</p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:26px 12px;background:#071021;border:1px solid #1e749c;border-radius:14px;">
                            <div style="color:#7dd3fc;font-family:'Courier New',monospace;font-size:38px;line-height:1;font-weight:800;letter-spacing:0.22em;white-space:nowrap;">{{verificationCode}}</div>
                            <div style="margin-top:14px;color:#7888a3;font-size:12px;line-height:1.5;">Expires in {{expiresInMinutes}} minutes</div>
                          </td></tr></table>
                          <p style="margin:24px 0 0;color:#a8b5ca;font-size:13px;line-height:1.65;">BookPro will never ask you to share this code. If you did not begin this registration, no action is required.</p>
                        </td></tr>
                        <tr><td style="padding:18px 32px 24px;background:#071021;border-top:1px solid #17243a;color:#66758f;font-size:11px;line-height:1.6;">This is an automated security message from BookPro. Replies to this email are not monitored.</td></tr>
                      </table>
                    </td></tr>
                  </table>
                </body>
                </html>
            `),
            text: Handlebars.compile("Hello {{fullName}},\n\nYour BookPro email confirmation code is: {{verificationCode}}\n\nIt expires in {{expiresInMinutes}} minutes. BookPro will never ask you to share this code.\n\nIf you did not begin this registration, no action is required."),
        });

        // 1. Booking Confirmation
        this.templates.set("booking_confirmation", {
            subject: Handlebars.compile("Appointment Confirmed: {{serviceName}} with {{studioName}}"),
            html: Handlebars.compile(`
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <div style="border-bottom: 2px solid {{brandColor}}; padding-bottom: 12px; margin-bottom: 20px;">
                        <h2 style="color: #0f172a; margin: 0;">{{studioName}}</h2>
                        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">{{locationAddress}}</p>
                    </div>
                    <p style="font-size: 16px;">Hello <strong>{{customerName}}</strong>,</p>
                    <p>Your appointment has been successfully confirmed!</p>
                    <div style="background-color: #f8fafc; border-left: 4px solid {{brandColor}}; padding: 16px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 4px 0;"><strong>Service:</strong> {{serviceName}}</p>
                        <p style="margin: 4px 0;"><strong>Date & Time:</strong> {{startFormatted}} ({{durationMin}} min)</p>
                        <p style="margin: 4px 0;"><strong>Stylist / Staff:</strong> {{staffName}}</p>
                        <p style="margin: 4px 0;"><strong>Location:</strong> {{locationName}} - {{locationAddress}}</p>
                        <p style="margin: 4px 0;"><strong>Price / Deposit:</strong> {{priceFormatted}}</p>
                    </div>
                    <p style="font-size: 13px; color: #64748b;">Need to make changes? You can reschedule or cancel according to our policy terms online.</p>
                </div>
            `),
            text: Handlebars.compile(`Hello {{customerName}},\n\nYour appointment for {{serviceName}} with {{studioName}} is confirmed for {{startFormatted}}.\nStaff: {{staffName}}\nLocation: {{locationName}} ({{locationAddress}})\nTotal: {{priceFormatted}}\n\nThank you for choosing {{studioName}}!`),
        });

        // 2. Appointment Rescheduled
        this.templates.set("appointment_rescheduled", {
            subject: Handlebars.compile("Appointment Updated: {{serviceName}} with {{studioName}}"),
            html: Handlebars.compile(`
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <div style="border-bottom: 2px solid {{brandColor}}; padding-bottom: 12px; margin-bottom: 20px;">
                        <h2 style="color: #0f172a; margin: 0;">{{studioName}}</h2>
                    </div>
                    <p style="font-size: 16px;">Hello <strong>{{customerName}}</strong>,</p>
                    <p>Your appointment has been successfully rescheduled to a new time.</p>
                    <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 4px 0;"><strong>Service:</strong> {{serviceName}}</p>
                        <p style="margin: 4px 0;"><strong>New Date & Time:</strong> {{startFormatted}}</p>
                        <p style="margin: 4px 0;"><strong>Staff:</strong> {{staffName}}</p>
                        <p style="margin: 4px 0;"><strong>Location:</strong> {{locationName}} - {{locationAddress}}</p>
                    </div>
                </div>
            `),
            text: Handlebars.compile(`Hello {{customerName}},\n\nYour appointment for {{serviceName}} has been rescheduled to {{startFormatted}} with {{staffName}}.\n\nThank you, {{studioName}}`),
        });

        // 2b. Appointment Reschedule Proposed (Studio request pending customer acceptance)
        this.templates.set("appointment_reschedule_proposed", {
            subject: Handlebars.compile("Reschedule Proposed: {{serviceName}} with {{studioName}}"),
            html: Handlebars.compile(`
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <div style="border-bottom: 2px solid {{brandColor}}; padding-bottom: 12px; margin-bottom: 20px;">
                        <h2 style="color: #0f172a; margin: 0;">{{studioName}}</h2>
                    </div>
                    <p style="font-size: 16px;">Hello <strong>{{customerName}}</strong>,</p>
                    <p>The studio has proposed a new time for your upcoming appointment:</p>
                    <div style="background-color: #f8fafc; border-left: 4px solid #38bdf8; padding: 16px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 4px 0;"><strong>Service:</strong> {{serviceName}}</p>
                        <p style="margin: 4px 0;"><strong>Proposed Time:</strong> {{proposedStartFormatted}}</p>
                        <p style="margin: 4px 0;"><strong>Specialist:</strong> {{staffName}}</p>
                        {{#if reason}}<p style="margin: 4px 0;"><strong>Note from Studio:</strong> {{reason}}</p>{{/if}}
                    </div>
                    <p>Please review and accept or decline this change in your customer portal:</p>
                    <div style="text-align: center; margin: 24px 0;">
                        <a href="{{portalUrl}}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Review Reschedule Request</a>
                    </div>
                </div>
            `),
            text: Handlebars.compile(`Hello {{customerName}},\n\n{{studioName}} has proposed a new time for your appointment: {{proposedStartFormatted}} with {{staffName}}.\nPlease review and accept or decline on your customer portal: {{portalUrl}}`),
        });

        // 3. Appointment Cancelled (Hallmark Midnight Theme & Calendar Sync)
        this.templates.set("appointment_cancelled", {
            subject: Handlebars.compile("Appointment Cancelled: {{serviceName}} with {{studioName}}"),
            html: Handlebars.compile(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Cancelled</title>
</head>
<body style="margin:0;padding:0;background-color:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#030712;padding:36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" style="max-width:580px;background-color:#0b1329;border:1px solid rgba(56,189,248,0.25);border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.65);">
          <!-- Top Bar Brand & Status -->
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid rgba(255,255,255,0.08);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-size:20px;font-weight:800;color:#f8fafc;letter-spacing:-0.02em;">
                      {{studioName}}
                    </div>
                    <div style="font-size:12px;color:#94a3b8;margin-top:2px;">
                      Appointment Ref: <span style="font-family:'Courier New',monospace;color:#38bdf8;font-weight:700;">BP-{{bookingRef}}</span>
                    </div>
                  </td>
                  <td align="right" valign="top">
                    <span style="display:inline-block;padding:5px 12px;border-radius:6px;background-color:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);color:#fca5a5;font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">
                      Cancelled
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:28px 32px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#f8fafc;letter-spacing:-0.02em;">
                Appointment Cancelled
              </h1>
              <p style="margin:0 0 24px;font-size:14.5px;color:#cbd5e1;line-height:1.6;">
                Hello <strong>{{customerName}}</strong>, your scheduled appointment for <strong>{{serviceName}}</strong> has been cancelled in accordance with our cancellation policy.
              </p>

              <!-- Appointment Details Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#071021;border:1px solid #17243a;border-radius:12px;margin-bottom:20px;overflow:hidden;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">
                      SERVICE & SCHEDULE
                    </div>
                    <div style="font-size:16px;font-weight:800;color:#f8fafc;margin-bottom:8px;">
                      {{serviceName}}
                    </div>
                    <div style="font-size:13.5px;color:#cbd5e1;margin-bottom:6px;">
                      🗓️ <strong>Date & Time:</strong> {{startFormatted}}
                    </div>
                    {{#if staffName}}
                    <div style="font-size:13px;color:#94a3b8;margin-bottom:4px;">
                      👤 <strong>Specialist:</strong> {{staffName}}
                    </div>
                    {{/if}}
                    {{#if locationName}}
                    <div style="font-size:13px;color:#94a3b8;">
                      📍 <strong>Location:</strong> {{locationName}}{{#if locationAddress}} — {{locationAddress}}{{/if}}
                    </div>
                    {{/if}}
                  </td>
                </tr>
              </table>

              <!-- Cancellation Reason -->
              {{#if reason}}
              <div style="background-color:rgba(15,23,42,0.7);border-left:3px solid #f43f5e;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#e2e8f0;line-height:1.5;">
                <strong style="color:#fca5a5;">Cancellation Reason:</strong> {{reason}}
              </div>
              {{/if}}

              <!-- Policy & Financial Breakdown -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#071021;border:1px solid #17243a;border-radius:12px;margin-bottom:20px;overflow:hidden;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">
                      FINANCIAL SETTLEMENT & POLICY SUMMARY
                    </div>
                    <div style="font-size:13px;color:#cbd5e1;line-height:1.6;margin-bottom:12px;">
                      {{financialSummary}}
                    </div>
                    {{#if feeFormatted}}
                    <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #17243a;font-size:12.5px;color:#94a3b8;">
                      <span>Cancellation Fee Retained:</span>
                      <strong style="color:#f87171;">{{feeFormatted}}</strong>
                    </div>
                    {{/if}}
                    {{#if refundFormatted}}
                    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12.5px;color:#94a3b8;">
                      <span>Refund Processed:</span>
                      <strong style="color:#34d399;">{{refundFormatted}}</strong>
                    </div>
                    {{/if}}
                  </td>
                </tr>
              </table>

              <!-- Calendar Removal Notice -->
              <div style="background-color:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:10px;padding:14px 16px;margin-bottom:24px;font-size:12.5px;color:#94a3b8;line-height:1.5;">
                📅 <strong style="color:#38bdf8;">Calendar Update:</strong> This appointment has been removed from your active schedule and the business operations calendar. An iCalendar cancellation update is attached (<code style="color:#38bdf8;">cancellation.ics</code>) to remove or strike out this event in Google Calendar, Apple Calendar, and Outlook.
              </div>

              <!-- Action / Rebook -->
              <div style="text-align:center;margin:28px 0 12px;">
                <a href="{{rebookUrl}}" target="_blank" style="display:inline-block;padding:12px 28px;border-radius:8px;background-color:#0284c7;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;box-shadow:0 4px 14px rgba(2,132,199,0.4);">
                  Book Another Appointment
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid rgba(255,255,255,0.08);background-color:#071021;text-align:center;">
              <div style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:4px;">
                {{studioName}}
              </div>
              <div style="font-size:11px;color:#64748b;line-height:1.5;">
                Operating Timezone: <strong>{{organizationTimezone}}</strong><br>
                Powered by BookPro Appointment Engine.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
            `),
            text: Handlebars.compile(`Hello {{customerName}},\n\nYour appointment for {{serviceName}} with {{studioName}} scheduled for {{startFormatted}} has been cancelled.\n\nReason: {{reason}}\n\nFinancial Settlement: {{financialSummary}}\n{{#if feeFormatted}}Cancellation Fee: {{feeFormatted}}\n{{/if}}{{#if refundFormatted}}Refund Issued: {{refundFormatted}}\n{{/if}}\nCalendar Status: This appointment has been removed from your schedule and the business operations calendar. An iCalendar cancellation is attached to update Google Calendar, Apple Calendar, and Outlook.\n\nBook another appointment: {{rebookUrl}}\n\nThank you,\n{{studioName}}`),
        });

        // 4. Payment Receipt
        this.templates.set("payment_receipt", {
            subject: Handlebars.compile("Payment Receipt ({{amountFormatted}}): {{studioName}}"),
            html: Handlebars.compile(`
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #0f172a; margin: 0 0 16px 0;">Payment Receipt</h2>
                    <p>Thank you for your payment of <strong>{{amountFormatted}}</strong> to <strong>{{studioName}}</strong>.</p>
                    <div style="background-color: #f8fafc; padding: 16px; margin: 16px 0; border-radius: 4px;">
                        <p style="margin: 4px 0;"><strong>Payment ID:</strong> {{paymentId}}</p>
                        <p style="margin: 4px 0;"><strong>Amount Paid:</strong> {{amountFormatted}} {{currency}}</p>
                        <p style="margin: 4px 0;"><strong>Date:</strong> {{paidAtFormatted}}</p>
                    </div>
                </div>
            `),
            text: Handlebars.compile(`Payment Receipt from {{studioName}}\n\nAmount: {{amountFormatted}} {{currency}}\nPayment ID: {{paymentId}}\nDate: {{paidAtFormatted}}`),
        });

        // 5. Refund Processed
        this.templates.set("refund_processed", {
            subject: Handlebars.compile("Refund Processed ({{amountFormatted}}): {{studioName}}"),
            html: Handlebars.compile(`
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #0f172a; margin: 0 0 16px 0;">Refund Processed</h2>
                    <p>A refund of <strong>{{amountFormatted}}</strong> has been processed to your original payment method.</p>
                    <div style="background-color: #f8fafc; padding: 16px; margin: 16px 0; border-radius: 4px;">
                        <p style="margin: 4px 0;"><strong>Refund ID:</strong> {{refundId}}</p>
                        <p style="margin: 4px 0;"><strong>Amount Refunded:</strong> {{amountFormatted}} {{currency}}</p>
                    </div>
                </div>
            `),
            text: Handlebars.compile(`Refund Notification from {{studioName}}\n\nAmount: {{amountFormatted}} {{currency}}\nRefund ID: {{refundId}}`),
        });

        // 6. Appointment Reminder
        this.templates.set("appointment_reminder", {
            subject: Handlebars.compile("Appointment Reminder: {{serviceName}} with {{studioName}} ({{startFormatted}})"),
            html: Handlebars.compile(`
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <div style="border-bottom: 2px solid {{brandColor}}; padding-bottom: 12px; margin-bottom: 20px;">
                        <h2 style="color: #0f172a; margin: 0;">{{studioName}}</h2>
                    </div>
                    <p style="font-size: 16px;">Hello <strong>{{customerName}}</strong>,</p>
                    <p>This is a friendly reminder for your upcoming appointment:</p>
                    <div style="background-color: #f8fafc; border-left: 4px solid {{brandColor}}; padding: 16px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 4px 0;"><strong>Service:</strong> {{serviceName}}</p>
                        <p style="margin: 4px 0;"><strong>When:</strong> {{startFormatted}}</p>
                        <p style="margin: 4px 0;"><strong>Staff:</strong> {{staffName}}</p>
                        <p style="margin: 4px 0;"><strong>Where:</strong> {{locationAddress}}</p>
                    </div>
                    <p style="font-size: 13px; color: #64748b;">We look forward to seeing you!</p>
                </div>
            `),
            text: Handlebars.compile(`Appointment Reminder: {{serviceName}} at {{studioName}} on {{startFormatted}}.\nStaff: {{staffName}}\nAddress: {{locationAddress}}`),
        });

        // 7. Waitlist Joined Confirmation
        this.templates.set("waitlist_joined", {
            subject: Handlebars.compile("Waitlist Confirmed: {{serviceName}} with {{studioName}}"),
            html: Handlebars.compile(`
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <div style="border-bottom: 2px solid {{brandColor}}; padding-bottom: 12px; margin-bottom: 20px;">
                        <h2 style="color: #0f172a; margin: 0;">{{studioName}}</h2>
                    </div>
                    <p style="font-size: 16px;">Hello <strong>{{customerName}}</strong>,</p>
                    <p>You have been added to our waitlist! We'll notify you as soon as an opening matching your preferences becomes available.</p>
                    <div style="background-color: #f8fafc; border-left: 4px solid {{brandColor}}; padding: 16px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 4px 0;"><strong>Requested Service:</strong> {{serviceName}}</p>
                        <p style="margin: 4px 0;"><strong>Date Window:</strong> {{startWindowDate}} to {{endWindowDate}}</p>
                        <p style="margin: 4px 0;"><strong>Time Preference:</strong> {{timePreference}}</p>
                    </div>
                    <p style="font-size: 13px; color: #64748b;">Thank you for your patience.</p>
                </div>
            `),
            text: Handlebars.compile(`Hello {{customerName}},\n\nYou're on the waitlist for {{serviceName}} at {{studioName}} between {{startWindowDate}} and {{endWindowDate}}.\nWe will notify you immediately when a slot opens!`),
        });

        // 8. Waitlist Offer Dispatched
        this.templates.set("waitlist_offer", {
            subject: Handlebars.compile("⚡ A Slot Opened Up! {{serviceName}} with {{studioName}}"),
            html: Handlebars.compile(`
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <div style="border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 20px;">
                        <h2 style="color: #0f172a; margin: 0;">{{studioName}}</h2>
                    </div>
                    <p style="font-size: 16px;">Good news <strong>{{customerName}}</strong>!</p>
                    <p>An appointment slot has opened up for you:</p>
                    <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 4px 0;"><strong>Service:</strong> {{serviceName}}</p>
                        <p style="margin: 4px 0;"><strong>Date & Time:</strong> {{startFormatted}}</p>
                        <p style="margin: 4px 0;"><strong>Stylist / Staff:</strong> {{staffName}}</p>
                        <p style="margin: 4px 0;"><strong>Location:</strong> {{locationName}}</p>
                        <p style="margin: 4px 0; color: #b91c1c;"><strong>⚡ Offer Expires:</strong> {{expiresFormatted}}</p>
                    </div>
                    <div style="text-align: center; margin: 24px 0;">
                        <a href="{{claimUrl}}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Claim Appointment Now</a>
                    </div>
                    <p style="font-size: 13px; color: #64748b;">This offer is time-limited and available on a first-come, first-served basis.</p>
                </div>
            `),
            text: Handlebars.compile(`Great news {{customerName}}!\n\nA slot opened for {{serviceName}} at {{studioName}} on {{startFormatted}} with {{staffName}}.\nClaim here: {{claimUrl}}\nOffer expires at {{expiresFormatted}}.`),
        });

        // 9. Waitlist Offer Expiring Soon
        this.templates.set("waitlist_offer_expiring", {
            subject: Handlebars.compile("⏳ Expiring Soon: Your {{serviceName}} Offer with {{studioName}}"),
            html: Handlebars.compile(`
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #b91c1c; margin: 0 0 16px 0;">Your Offer is Expiring Soon</h2>
                    <p>Hello <strong>{{customerName}}</strong>,</p>
                    <p>Your reserved offer for <strong>{{serviceName}}</strong> on <strong>{{startFormatted}}</strong> will expire shortly at {{expiresFormatted}}.</p>
                    <div style="text-align: center; margin: 20px 0;">
                        <a href="{{claimUrl}}" style="background-color: #b91c1c; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Claim Slot Before It Expires</a>
                    </div>
                </div>
            `),
            text: Handlebars.compile(`Reminder: Your offer for {{serviceName}} at {{studioName}} on {{startFormatted}} expires at {{expiresFormatted}}.\nClaim now: {{claimUrl}}`),
        });

        // 10. Waitlist Offer Lost
        this.templates.set("waitlist_offer_lost", {
            subject: Handlebars.compile("Waitlist Update: {{serviceName}} with {{studioName}}"),
            html: Handlebars.compile(`
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #0f172a; margin: 0 0 16px 0;">Slot Claimed by Another Guest</h2>
                    <p>Hello <strong>{{customerName}}</strong>,</p>
                    <p>The recent opening for <strong>{{serviceName}}</strong> on {{startFormatted}} was claimed by another customer.</p>
                    <p>You remain active on our waitlist, and we will notify you as soon as the next opening arises!</p>
                </div>
            `),
            text: Handlebars.compile(`Hello {{customerName}},\n\nThe opening for {{serviceName}} on {{startFormatted}} was claimed by another guest. You remain on the waitlist for future openings!`),
        });
    }

    render(templateName: string, variables: Record<string, any>): RenderedTemplate {
        const safeVars = {
            brandColor: "#0284c7",
            studioName: "BookPro Studio",
            ...variables,
        };

        if (templateName === "organization_campaign") {
            const values = { ...safeVars };
            return {
                subject: Handlebars.compile(String(variables.subject || "News from {{studioName}}"))(values),
                htmlBody: Handlebars.compile(String(variables.htmlBody || ""))(values),
                textBody: Handlebars.compile(String(variables.textBody || ""))(values),
            };
        }
        const tpl = this.templates.get(templateName);
        if (!tpl) {
            this.logger.warn(`Template "${templateName}" not found. Falling back to generic notification template.`);
            const fallbackMsg = (safeVars as any).message || `You have a new notification from ${safeVars.studioName}`;
            return {
                subject: `Notification from ${safeVars.studioName}`,
                htmlBody: `<p>${fallbackMsg}</p>`,
                textBody: fallbackMsg,
            };
        }

        return {
            subject: tpl.subject(safeVars),
            htmlBody: tpl.html(safeVars),
            textBody: tpl.text(safeVars),
        };
    }
}
