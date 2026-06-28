import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

function daysUntil(dateStr) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr) - now) / 86400000);
}

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Qpon <onboarding@resend.dev>',
      to,
      subject,
      html,
    }),
  });
  return res.json();
}

export const handler = async () => {
  const snapshot = await db.collection('coupons')
    .where('redeemed', '==', false)
    .get();

  const reminders = [];

  for (const docSnap of snapshot.docs) {
    const c = docSnap.data();
    const days = daysUntil(c.expiry);

    if (days === 7 || days === 1) {
      reminders.push({ ...c, days });
    }
  }

  // Group by userId so one user gets one email per day
  const byUser = {};
  for (const r of reminders) {
    if (!byUser[r.userId]) byUser[r.userId] = [];
    byUser[r.userId].push(r);
  }

  // Get user emails from Firebase Auth
  const { getAuth } = await import('firebase-admin/auth');
  const auth = getAuth();

  for (const [uid, coupons] of Object.entries(byUser)) {
    try {
      const user = await auth.getUser(uid);
      const email = user.email;
      if (!email) continue;

      const couponRows = coupons.map(c => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${c.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:monospace;color:#7C3AED;">${c.code}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:${c.days === 1 ? '#EF4444' : '#F59E0B'};">
            ${c.days === 1 ? 'Expires tomorrow!' : 'Expires in 7 days'}
          </td>
        </tr>
      `).join('');

      const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
          <div style="background:#7C3AED;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:28px;letter-spacing:-1px;">Q<span style="color:#FBBF24;">p</span>on</h1>
            <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Coupon expiry reminder</p>
          </div>
          <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #E5E7EB;">
            <p style="color:#1E1B4B;font-size:15px;">Hey! These coupons are expiring soon — don't let them go to waste:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <thead>
                <tr style="background:#F5F3FF;">
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6B7280;">Brand</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6B7280;">Code</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6B7280;">Expiry</th>
                </tr>
              </thead>
              <tbody>${couponRows}</tbody>
            </table>
            <a href="https://qpon.netlify.app" style="display:block;background:#7C3AED;color:#fff;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px;">Open Qpon</a>
          </div>
          <p style="text-align:center;color:#9CA3AF;font-size:12px;margin-top:16px;">You're receiving this because you use Qpon.</p>
        </div>
      `;

      await sendEmail(email, `⏰ ${coupons.length} coupon${coupons.length > 1 ? 's' : ''} expiring soon!`, html);
      console.log(`Sent reminder to ${email} for ${coupons.length} coupons`);
    } catch (err) {
      console.error(`Failed for uid ${uid}:`, err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ reminders: reminders.length }) };
}

export const config = {
  schedule: '3 0 * * *',
};