const fs = require('fs');
const path = require('path');

function generateVCard(staff, baseUrl) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${staff.last_name || ''};${staff.first_name || ''};;;`,
    `FN:${staff.first_name || ''} ${staff.last_name || ''}`.trim(),
  ];

  if (staff.company) {
    lines.push(`ORG:${staff.company};`);
  }
  if (staff.job_title) {
    lines.push(`TITLE:${staff.job_title}`);
  }
  if (staff.department) {
    lines.push(`ROLE:${staff.department}`);
  }
  if (staff.phone) {
    lines.push(`TEL;TYPE=CELL,VOICE:${staff.phone}`);
  }
  if (staff.email) {
    lines.push(`EMAIL;TYPE=WORK,INTERNET:${staff.email}`);
  }
  if (staff.website_url) {
    lines.push(`URL;TYPE=WORK:${staff.website_url}`);
  } else {
    lines.push('URL;TYPE=WORK:https://www.cua.org.gh/');
  }
  lines.push('ADR;TYPE=WORK:;;44 Jones Nelson Street, Adabraka;Accra;;;Ghana');
  lines.push('NOTE:Ghana Co-operative Credit Unions Association (CUA) - ...building a happy family');

  // Embed Profile Picture
  if (staff.avatar_path) {
    // 1. If stored as Base64 Data URI (Serverless / Vercel mode)
    if (staff.avatar_path.startsWith('data:image/')) {
      const match = staff.avatar_path.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
      if (match) {
        const rawType = match[1].toLowerCase();
        const type = rawType.includes('png') ? 'PNG' : 'JPEG';
        lines.push(`PHOTO;ENCODING=b;TYPE=${type}:${match[2]}`);
      }
    } 
    // 2. If stored as an external URL (e.g. CDN or S3)
    else if (staff.avatar_path.startsWith('http://') || staff.avatar_path.startsWith('https://')) {
      lines.push(`PHOTO;VALUE=URI:${staff.avatar_path}`);
    }
    // 3. If stored on local disk
    else {
      const avatarFullPath = path.join(__dirname, '..', 'public', staff.avatar_path.replace(/^\//, ''));
      if (fs.existsSync(avatarFullPath)) {
        try {
          const stats = fs.statSync(avatarFullPath);
          if (stats.size < 400 * 1024) {
            const ext = path.extname(avatarFullPath).toLowerCase().replace('.', '');
            const imageType = ext === 'png' ? 'PNG' : 'JPEG';
            const fileData = fs.readFileSync(avatarFullPath);
            lines.push(`PHOTO;ENCODING=b;TYPE=${imageType}:${fileData.toString('base64')}`);
          }
        } catch (err) {
          console.error('Error reading avatar for vcard:', err);
        }
      }
    }
  }

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

module.exports = { generateVCard };
