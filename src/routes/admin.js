const express = require('express');
const multer = require('multer');
const { db } = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// In-memory storage for Vercel Serverless compatibility (read-only filesystem)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const mime = file.mimetype;
    if (allowed.test(mime)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, WEBP) are allowed.'));
    }
  }
});

// List all staff
router.get('/staff', async (req, res) => {
  try {
    const staff = await db.getAllStaff();
    return res.json({ staff });
  } catch (err) {
    console.error('Error listing staff:', err);
    return res.status(500).json({ error: 'Failed to fetch staff directory.' });
  }
});

// Get single staff member
router.get('/staff/:id', async (req, res) => {
  try {
    const staff = await db.getStaffById(req.params.id);
    if (!staff) return res.status(404).json({ error: 'Staff member not found.' });
    return res.json({ staff });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch staff member.' });
  }
});

// Create new staff
router.post('/staff', upload.single('avatar'), async (req, res) => {
  try {
    const {
      first_name, last_name, slug, job_title, department, company,
      phone, email, whatsapp, linkedin_url, github_url, website_url, bio, is_active
    } = req.body;

    if (!first_name || !last_name || !slug) {
      return res.status(400).json({ error: 'First name, last name, and slug are required.' });
    }

    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-');
    const existing = await db.getStaffBySlug(cleanSlug);
    if (existing) {
      return res.status(400).json({ error: 'This slug/URL is already taken.' });
    }

    let avatar_path = null;
    if (req.file) {
      // Store as Data URL directly in the database (compatible with Vercel serverless)
      avatar_path = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const staff = await db.createStaff({
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      slug: cleanSlug,
      job_title: (job_title || '').trim(),
      department: (department || '').trim(),
      company: (company || 'Nevada').trim(),
      phone: (phone || '').trim(),
      email: (email || '').trim(),
      whatsapp: (whatsapp || '').trim(),
      linkedin_url: (linkedin_url || '').trim(),
      github_url: (github_url || '').trim(),
      website_url: (website_url || '').trim(),
      bio: (bio || '').trim(),
      avatar_path,
      is_active: is_active === 'false' ? false : true
    });

    return res.status(201).json({ success: true, staff });
  } catch (err) {
    console.error('Error creating staff:', err);
    return res.status(500).json({ error: 'Failed to create staff member.' });
  }
});

// Update staff
router.put('/staff/:id', upload.single('avatar'), async (req, res) => {
  try {
    const existing = await db.getStaffById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    const {
      first_name, last_name, slug, job_title, department, company,
      phone, email, whatsapp, linkedin_url, github_url, website_url, bio,
      is_active, remove_avatar
    } = req.body;

    let cleanSlug = existing.slug;
    if (slug) {
      cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-');
      if (cleanSlug !== existing.slug) {
        const slugCheck = await db.getStaffBySlug(cleanSlug);
        if (slugCheck) {
          return res.status(400).json({ error: 'This slug/URL is already taken.' });
        }
      }
    }

    let avatar_path = existing.avatar_path;

    if (remove_avatar === 'true' || remove_avatar === true) {
      avatar_path = null;
    }

    if (req.file) {
      avatar_path = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const updated = await db.updateStaff(req.params.id, {
      first_name: first_name !== undefined ? first_name.trim() : existing.first_name,
      last_name: last_name !== undefined ? last_name.trim() : existing.last_name,
      slug: cleanSlug,
      job_title: job_title !== undefined ? job_title.trim() : existing.job_title,
      department: department !== undefined ? department.trim() : existing.department,
      company: company !== undefined ? company.trim() : existing.company,
      phone: phone !== undefined ? phone.trim() : existing.phone,
      email: email !== undefined ? email.trim() : existing.email,
      whatsapp: whatsapp !== undefined ? whatsapp.trim() : existing.whatsapp,
      linkedin_url: linkedin_url !== undefined ? linkedin_url.trim() : existing.linkedin_url,
      github_url: github_url !== undefined ? github_url.trim() : existing.github_url,
      website_url: website_url !== undefined ? website_url.trim() : existing.website_url,
      bio: bio !== undefined ? bio.trim() : existing.bio,
      avatar_path,
      is_active: is_active !== undefined ? (is_active === 'true' || is_active === true) : existing.is_active
    });

    return res.json({ success: true, staff: updated });
  } catch (err) {
    console.error('Error updating staff:', err);
    return res.status(500).json({ error: 'Failed to update staff member.' });
  }
});

// Delete staff
router.delete('/staff/:id', async (req, res) => {
  try {
    const existing = await db.getStaffById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Staff member not found.' });

    await db.deleteStaff(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error deleting staff:', err);
    return res.status(500).json({ error: 'Failed to delete staff member.' });
  }
});

// View all leads
router.get('/leads', async (req, res) => {
  try {
    const leads = await db.getAllLeads();
    return res.json({ leads });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch leads.' });
  }
});

module.exports = router;
