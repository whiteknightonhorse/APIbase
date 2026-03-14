import crypto from 'node:crypto';
import { getPrisma } from './prisma.service';
import { ensureRedisConnected } from './redis.service';
import { logger } from '../config/logger';

// ---------------------------------------------------------------------------
// Rate limiting — 5 submissions per IP per hour (§6.12)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SEC = 3600;

export async function checkIpRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `onboard:ratelimit:${ip}`;

  try {
    const r = await ensureRedisConnected();
    const count = await r.incr(key);

    if (count === 1) {
      await r.expire(key, RATE_LIMIT_WINDOW_SEC);
    }

    if (count > RATE_LIMIT_MAX) {
      const ttl = await r.ttl(key);
      return { allowed: false, retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SEC };
    }

    return { allowed: true };
  } catch (err) {
    // Onboarding is not a financial path — fail open on Redis error
    logger.warn({ err, ip }, 'Onboard rate limit Redis error, allowing submission');
    return { allowed: true };
  }
}

// ---------------------------------------------------------------------------
// Submission creation — PG transaction with outbox event (§6.12)
// ---------------------------------------------------------------------------

interface SubmissionData {
  company_name: string;
  api_url: string;
  contact_email: string;
  category: string;
  description: string;
  affiliate_program?: string;
  monthly_volume?: string;
}

export async function createSubmission(
  data: SubmissionData,
  ip: string,
): Promise<{ submission_id: string }> {
  const db = getPrisma();
  const submissionId = `sub_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  await db.$transaction([
    db.onboardingSubmission.create({
      data: {
        submission_id: submissionId,
        company_name: data.company_name,
        api_url: data.api_url,
        contact_email: data.contact_email,
        category: data.category,
        description: data.description,
        affiliate_program: data.affiliate_program || null,
        monthly_volume: data.monthly_volume || null,
        ip_address: ip,
      },
    }),
    db.outbox.create({
      data: {
        event_type: 'form_submission',
        payload: {
          submission_id: submissionId,
          company_name: data.company_name,
          api_url: data.api_url,
          contact_email: data.contact_email,
          category: data.category,
        },
      },
    }),
  ]);

  return { submission_id: submissionId };
}
