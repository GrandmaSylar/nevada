const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { db } = require('../db');
const { generateVCard } = require('../vcard');

const router = express.Router();
const PROFILE_HTML_PATH = path.join(__dirname, '..', 'views', 'profile.html');

// Public staff digital card view
router.get('/:slug', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase().trim();
    const staff = await db.getStaffBySlug(slug);

    if (!staff || !staff.is_active) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Card Not Found</title>
          <style>
            body { background: #0b0f19; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px; }
            .box { max-width: 360px; }
            h1 { font-size: 1.5rem; margin-bottom: 8px; color: #f87171; }
            p { color: #94a3b8; font-size: 0.95rem; }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>Card Unavailable</h1>
            <p>This digital card could not be found or has been deactivated.</p>
          </div>
        </body>
        </html>
      `);
    }

    let template = fs.readFileSync(PROFILE_HTML_PATH, 'utf8');

    // Initials calculation
    const initials = `${(staff.first_name || '')[0] || ''}${(staff.last_name || '')[0] || ''}`.toUpperCase() || 'ST';

    // Inject data
    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    const staffData = {
      ...staff,
      company: staff.company || 'Ghana Co-operative Credit Unions Association',
      website_url: staff.website_url || 'https://www.cua.org.gh/',
      location_url: 'https://www.google.com/maps/search/?api=1&query=44+Jones+Nelson+Street+Adabraka+Accra+Ghana',
      address: '44 Jones Nelson Street, Adabraka, Accra, Ghana'
    };

    template = template
      .replace(/{{SLUG}}/g, staffData.slug)
      .replace(/{{FIRST_NAME}}/g, staffData.first_name || '')
      .replace(/{{LAST_NAME}}/g, staffData.last_name || '')
      .replace(/{{FULL_NAME}}/g, `${staffData.first_name} ${staffData.last_name}`.trim())
      .replace(/{{JOB_TITLE}}/g, staffData.job_title || '')
      .replace(/{{DEPARTMENT}}/g, staffData.department || '')
      .replace(/{{COMPANY}}/g, staffData.company)
      .replace(/{{PHONE}}/g, staffData.phone || '')
      .replace(/{{EMAIL}}/g, staffData.email || '')
      .replace(/{{WHATSAPP}}/g, staffData.whatsapp || '')
      .replace(/{{LINKEDIN}}/g, staffData.linkedin_url || '')
      .replace(/{{GITHUB}}/g, staffData.github_url || '')
      .replace(/{{WEBSITE}}/g, staffData.website_url)
      .replace(/{{LOCATION_URL}}/g, staffData.location_url)
      .replace(/{{ADDRESS}}/g, staffData.address)
      .replace(/{{BIO}}/g, staffData.bio || '')
      .replace(/{{AVATAR_PATH}}/g, staffData.avatar_path || '')
      .replace(/{{INITIALS}}/g, initials)
      .replace(/{{BASE_URL}}/g, baseUrl)
      .replace(/{{DATA_JSON}}/g, JSON.stringify(staffData).replace(/"/g, '&quot;'));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(template);
  } catch (err) {
    console.error('Error rendering profile:', err);
    return res.status(500).send('Error loading card profile.');
  }
});

// Dynamic vCard download
router.get('/:slug/vcard', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase().trim();
    const staff = await db.getStaffBySlug(slug);

    if (!staff) {
      return res.status(404).send('Staff member not found.');
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    const vCardString = generateVCard(staff, baseUrl);
    const filename = `${staff.slug}.vcf`;

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(vCardString);
  } catch (err) {
    console.error('Error generating vCard:', err);
    return res.status(500).send('Error generating contact file.');
  }
});

// Dynamic high-contrast QR Code generation (print-ready for black cards)
router.get('/:slug/qr.png', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase().trim();
    const staff = await db.getStaffBySlug(slug);

    if (!staff) {
      return res.status(404).send('Staff member not found.');
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const targetUrl = `${protocol}://${host}/p/${staff.slug}?src=qr`;

    // Generate high-resolution QR with white border/box for black cards
    const qrBuffer = await QRCode.toBuffer(targetUrl, {
      type: 'png',
      width: 600,
      margin: 4,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(qrBuffer);
  } catch (err) {
    console.error('Error generating QR:', err);
    return res.status(500).send('Error generating QR code.');
  }
});

// 2-Way Lead Exchange ("Connect with me" submission)
router.post('/:slug/exchange', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase().trim();
    const staff = await db.getStaffBySlug(slug);

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    const { visitor_name, visitor_contact, visitor_note, source } = req.body;

    if (!visitor_name || !visitor_contact) {
      return res.status(400).json({ error: 'Name and contact are required.' });
    }

    const lead = await db.createLead({
      staff_id: staff.id,
      visitor_name: visitor_name.trim(),
      visitor_contact: visitor_contact.trim(),
      visitor_note: (visitor_note || '').trim(),
      source: source || 'direct'
    });

    return res.json({ success: true, lead_id: lead.id });
  } catch (err) {
    console.error('Error recording lead:', err);
    return res.status(500).json({ error: 'Failed to record contact details.' });
  }
});

module.exports = router;

