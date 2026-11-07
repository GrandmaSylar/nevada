const fs = require('fs');
const path = require('path');
const os = require('os');
const sql = require('mssql');
const bcrypt = require('bcryptjs');

// On Vercel, root filesystem is read-only; use /tmp for fallback if needed
const isVercel = !!process.env.VERCEL;
const DATA_DIR = isVercel ? os.tmpdir() : path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    // ignore if read-only
  }
}

const LOCAL_DB_FILE = path.join(DATA_DIR, 'db.json');

// Check if MSSQL configuration is provided
const isMssql = !!(
  process.env.MSSQL_CONNECTION_STRING ||
  (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('mssql')) ||
  process.env.DB_SERVER
);

let pool = global._mssqlPool || null;

function getMssqlConfig() {
  if (process.env.MSSQL_CONNECTION_STRING) {
    return process.env.MSSQL_CONNECTION_STRING;
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('mssql')) {
    return process.env.DATABASE_URL;
  }

  return {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: process.env.DB_DATABASE || 'nevada_cards',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true' || isVercel, // Azure / remote requires true
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
      enableArithAbort: true,
      connectTimeout: 15000,
      requestTimeout: 15000,
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    }
  };
}

async function getPool() {
  if (pool && pool.connected) return pool;
  if (!isMssql) return null;

  try {
    pool = await sql.connect(getMssqlConfig());
    global._mssqlPool = pool;
    return pool;
  } catch (err) {
    console.error('MSSQL Connection failed:', err.message);
    pool = null;
    return null;
  }
}

// Local in-memory store for fallback
let localStore = {
  staff: [],
  leads: [],
  admins: []
};

function loadLocalStore() {
  if (fs.existsSync(LOCAL_DB_FILE)) {
    try {
      const data = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
      localStore = JSON.parse(data);
    } catch (err) {
      console.error('Error reading local db file:', err);
    }
  }
}

function saveLocalStore() {
  try {
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(localStore, null, 2), 'utf8');
  } catch (e) {
    // Read-only filesystem warning
  }
}

let dbInitialized = false;

// Initialize tables and seed default admin
async function initDb() {
  if (dbInitialized) return;

  const defaultAdminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const defaultAdminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(defaultAdminPass, salt);

  const activePool = await getPool();

  if (activePool) {
    try {
      // Create Tables in T-SQL
      await activePool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='staff' AND xtype='U')
        BEGIN
          CREATE TABLE staff (
            id NVARCHAR(64) PRIMARY KEY,
            slug NVARCHAR(64) UNIQUE NOT NULL,
            first_name NVARCHAR(100) NOT NULL,
            last_name NVARCHAR(100) NOT NULL,
            job_title NVARCHAR(150),
            department NVARCHAR(100),
            company NVARCHAR(150) DEFAULT 'Nevada',
            phone NVARCHAR(50),
            email NVARCHAR(150),
            whatsapp NVARCHAR(50),
            linkedin_url NVARCHAR(255),
            github_url NVARCHAR(255),
            website_url NVARCHAR(255),
            bio NVARCHAR(MAX),
            avatar_path NVARCHAR(MAX),
            is_active BIT DEFAULT 1,
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE()
          );
        END

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='leads' AND xtype='U')
        BEGIN
          CREATE TABLE leads (
            id NVARCHAR(64) PRIMARY KEY,
            staff_id NVARCHAR(64) FOREIGN KEY REFERENCES staff(id) ON DELETE CASCADE,
            visitor_name NVARCHAR(150) NOT NULL,
            visitor_contact NVARCHAR(150) NOT NULL,
            visitor_note NVARCHAR(MAX),
            source NVARCHAR(20) DEFAULT 'direct',
            created_at DATETIME2 DEFAULT GETDATE()
          );
        END

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='admins' AND xtype='U')
        BEGIN
          CREATE TABLE admins (
            id NVARCHAR(64) PRIMARY KEY,
            email NVARCHAR(150) UNIQUE NOT NULL,
            password_hash NVARCHAR(255) NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE()
          );
        END
      `);

      // Seed admin if table is empty
      const adminCheck = await activePool.request()
        .input('email', sql.NVarChar, defaultAdminEmail)
        .query('SELECT id FROM admins WHERE email = @email');

      if (adminCheck.recordset.length === 0) {
        await activePool.request()
          .input('id', sql.NVarChar, 'admin-1')
          .input('email', sql.NVarChar, defaultAdminEmail)
          .input('hash', sql.NVarChar, hash)
          .query('INSERT INTO admins (id, email, password_hash) VALUES (@id, @email, @hash)');
        console.log(`Default admin created in MSSQL: ${defaultAdminEmail} (password: ${defaultAdminPass})`);
      }

      dbInitialized = true;
      return;
    } catch (err) {
      console.error('Error during MSSQL table initialization:', err);
    }
  }

  // Fallback store
  loadLocalStore();
  if (!localStore.admins || localStore.admins.length === 0) {
    localStore.admins = [{
      id: 'admin-1',
      email: defaultAdminEmail,
      password_hash: hash,
      created_at: new Date().toISOString()
    }];
    saveLocalStore();
    console.log(`Default admin seeded in local store: ${defaultAdminEmail} (password: ${defaultAdminPass})`);
  }

  if (!localStore.staff || localStore.staff.length === 0) {
    localStore.staff = [{
      id: 'staff-sample',
      slug: 'john-doe',
      first_name: 'John',
      last_name: 'Doe',
      job_title: 'Head of Engineering',
      department: 'Technology',
      company: 'Nevada Systems',
      phone: '+1 555-019-2834',
      email: 'john.doe@example.com',
      whatsapp: '+15550192834',
      linkedin_url: 'https://linkedin.com/in/example',
      github_url: 'https://github.com/GrandmaSylar',
      website_url: 'https://example.com',
      bio: 'Building next-gen digital infrastructure and contactless connected hardware.',
      avatar_path: null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }];
    saveLocalStore();
  }

  dbInitialized = true;
}

// Database Operations
const db = {
  async getAllStaff() {
    const activePool = await getPool();
    if (activePool) {
      const res = await activePool.request().query('SELECT * FROM staff ORDER BY created_at DESC');
      return res.recordset.map(row => ({ ...row, is_active: !!row.is_active }));
    }
    loadLocalStore();
    return [...localStore.staff].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getStaffBySlug(slug) {
    const activePool = await getPool();
    if (activePool) {
      const res = await activePool.request()
        .input('slug', sql.NVarChar, slug)
        .query('SELECT * FROM staff WHERE slug = @slug');
      const row = res.recordset[0];
      return row ? { ...row, is_active: !!row.is_active } : null;
    }
    loadLocalStore();
    return localStore.staff.find(s => s.slug === slug) || null;
  },

  async getStaffById(id) {
    const activePool = await getPool();
    if (activePool) {
      const res = await activePool.request()
        .input('id', sql.NVarChar, id)
        .query('SELECT * FROM staff WHERE id = @id');
      const row = res.recordset[0];
      return row ? { ...row, is_active: !!row.is_active } : null;
    }
    loadLocalStore();
    return localStore.staff.find(s => s.id === id) || null;
  },

  async createStaff(data) {
    const id = 'staff-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    const now = new Date().toISOString();
    const staffMember = {
      id,
      slug: data.slug,
      first_name: data.first_name,
      last_name: data.last_name,
      job_title: data.job_title || '',
      department: data.department || '',
      company: data.company || 'Nevada',
      phone: data.phone || '',
      email: data.email || '',
      whatsapp: data.whatsapp || '',
      linkedin_url: data.linkedin_url || '',
      github_url: data.github_url || '',
      website_url: data.website_url || '',
      bio: data.bio || '',
      avatar_path: data.avatar_path || null,
      is_active: data.is_active !== undefined ? !!data.is_active : true,
      created_at: now,
      updated_at: now
    };

    const activePool = await getPool();
    if (activePool) {
      const req = activePool.request()
        .input('id', sql.NVarChar, staffMember.id)
        .input('slug', sql.NVarChar, staffMember.slug)
        .input('first_name', sql.NVarChar, staffMember.first_name)
        .input('last_name', sql.NVarChar, staffMember.last_name)
        .input('job_title', sql.NVarChar, staffMember.job_title)
        .input('department', sql.NVarChar, staffMember.department)
        .input('company', sql.NVarChar, staffMember.company)
        .input('phone', sql.NVarChar, staffMember.phone)
        .input('email', sql.NVarChar, staffMember.email)
        .input('whatsapp', sql.NVarChar, staffMember.whatsapp)
        .input('linkedin_url', sql.NVarChar, staffMember.linkedin_url)
        .input('github_url', sql.NVarChar, staffMember.github_url)
        .input('website_url', sql.NVarChar, staffMember.website_url)
        .input('bio', sql.NVarChar(sql.MAX), staffMember.bio)
        .input('avatar_path', sql.NVarChar(sql.MAX), staffMember.avatar_path)
        .input('is_active', sql.Bit, staffMember.is_active ? 1 : 0);

      const q = `
        INSERT INTO staff (
          id, slug, first_name, last_name, job_title, department, company,
          phone, email, whatsapp, linkedin_url, github_url, website_url,
          bio, avatar_path, is_active, created_at, updated_at
        ) VALUES (
          @id, @slug, @first_name, @last_name, @job_title, @department, @company,
          @phone, @email, @whatsapp, @linkedin_url, @github_url, @website_url,
          @bio, @avatar_path, @is_active, GETDATE(), GETDATE()
        );
        SELECT * FROM staff WHERE id = @id;
      `;
      const res = await req.query(q);
      const row = res.recordset[0];
      return row ? { ...row, is_active: !!row.is_active } : staffMember;
    }

    loadLocalStore();
    localStore.staff.push(staffMember);
    saveLocalStore();
    return staffMember;
  },

  async updateStaff(id, data) {
    const now = new Date().toISOString();
    const activePool = await getPool();
    if (activePool) {
      const req = activePool.request().input('id', sql.NVarChar, id);
      const setClauses = [];

      for (const [key, val] of Object.entries(data)) {
        if (key === 'id') continue;
        if (key === 'is_active') {
          req.input(key, sql.Bit, val ? 1 : 0);
          setClauses.push(`${key} = @${key}`);
        } else if (key === 'bio' || key === 'avatar_path') {
          req.input(key, sql.NVarChar(sql.MAX), val);
          setClauses.push(`${key} = @${key}`);
        } else {
          req.input(key, sql.NVarChar, val);
          setClauses.push(`${key} = @${key}`);
        }
      }
      setClauses.push('updated_at = GETDATE()');

      const q = `
        UPDATE staff SET ${setClauses.join(', ')} WHERE id = @id;
        SELECT * FROM staff WHERE id = @id;
      `;
      const res = await req.query(q);
      const row = res.recordset[0];
      return row ? { ...row, is_active: !!row.is_active } : null;
    }

    loadLocalStore();
    const index = localStore.staff.findIndex(s => s.id === id);
    if (index === -1) return null;

    localStore.staff[index] = {
      ...localStore.staff[index],
      ...data,
      updated_at: now
    };
    saveLocalStore();
    return localStore.staff[index];
  },

  async deleteStaff(id) {
    const activePool = await getPool();
    if (activePool) {
      await activePool.request()
        .input('id', sql.NVarChar, id)
        .query('DELETE FROM staff WHERE id = @id');
      return true;
    }
    loadLocalStore();
    localStore.staff = localStore.staff.filter(s => s.id !== id);
    localStore.leads = localStore.leads.filter(l => l.staff_id !== id);
    saveLocalStore();
    return true;
  },

  async createLead(data) {
    const id = 'lead-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    const now = new Date().toISOString();
    const lead = {
      id,
      staff_id: data.staff_id,
      visitor_name: data.visitor_name,
      visitor_contact: data.visitor_contact,
      visitor_note: data.visitor_note || '',
      source: data.source || 'direct',
      created_at: now
    };

    const activePool = await getPool();
    if (activePool) {
      const q = `
        INSERT INTO leads (id, staff_id, visitor_name, visitor_contact, visitor_note, source, created_at)
        VALUES (@id, @staff_id, @visitor_name, @visitor_contact, @visitor_note, @source, GETDATE());
        SELECT * FROM leads WHERE id = @id;
      `;
      const res = await activePool.request()
        .input('id', sql.NVarChar, lead.id)
        .input('staff_id', sql.NVarChar, lead.staff_id)
        .input('visitor_name', sql.NVarChar, lead.visitor_name)
        .input('visitor_contact', sql.NVarChar, lead.visitor_contact)
        .input('visitor_note', sql.NVarChar(sql.MAX), lead.visitor_note)
        .input('source', sql.NVarChar, lead.source)
        .query(q);
      return res.recordset[0] || lead;
    }

    loadLocalStore();
    localStore.leads.push(lead);
    saveLocalStore();
    return lead;
  },

  async getLeadsByStaffId(staffId) {
    const activePool = await getPool();
    if (activePool) {
      const res = await activePool.request()
        .input('staff_id', sql.NVarChar, staffId)
        .query('SELECT * FROM leads WHERE staff_id = @staff_id ORDER BY created_at DESC');
      return res.recordset;
    }
    loadLocalStore();
    return localStore.leads.filter(l => l.staff_id === staffId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getAllLeads() {
    const activePool = await getPool();
    if (activePool) {
      const q = `
        SELECT l.*, s.first_name, s.last_name, s.slug, s.job_title
        FROM leads l
        LEFT JOIN staff s ON l.staff_id = s.id
        ORDER BY l.created_at DESC
      `;
      const res = await activePool.request().query(q);
      return res.recordset;
    }
    loadLocalStore();
    return localStore.leads.map(lead => {
      const staff = localStore.staff.find(s => s.id === lead.staff_id);
      return {
        ...lead,
        first_name: staff ? staff.first_name : '',
        last_name: staff ? staff.last_name : '',
        slug: staff ? staff.slug : '',
        job_title: staff ? staff.job_title : ''
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getAdminByEmail(email) {
    const activePool = await getPool();
    if (activePool) {
      const res = await activePool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT * FROM admins WHERE LOWER(email) = LOWER(@email)');
      return res.recordset[0] || null;
    }
    loadLocalStore();
    return localStore.admins.find(a => a.email.toLowerCase() === email.toLowerCase()) || null;
  }
};

module.exports = { db, initDb };
