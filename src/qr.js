const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  sharp = null;
}

const LOGO_PATH = path.join(__dirname, '..', 'public', 'images', 'cua-logo.png');

/**
 * Generate a high-contrast corporate styled QR code with CUA logo centered.
 * Uses Error Correction 'H' (High - up to 30% recovery) so detection remains instant.
 */
async function generateStyledQr(targetUrl, options = {}) {
  const width = options.width || 600;
  // Deep CUA Corporate Navy (#002244) provides maximum optical contrast against white
  const darkColor = options.darkColor || '#002244';
  const lightColor = options.lightColor || '#ffffff';

  if (sharp && fs.existsSync(LOGO_PATH)) {
    try {
      const qrBuffer = await QRCode.toBuffer(targetUrl, {
        type: 'png',
        width,
        margin: 3,
        color: {
          dark: darkColor,
          light: lightColor
        },
        errorCorrectionLevel: 'H'
      });

      // Frame badge occupying ~25% of QR area (safe for level H up to 30%)
      const badgeSize = Math.round(width * 0.25);
      const badgeRadius = Math.round(badgeSize * 0.16);
      const badgeSvg = Buffer.from(`
        <svg width="${badgeSize}" height="${badgeSize}">
          <rect x="0" y="0" width="${badgeSize}" height="${badgeSize}" rx="${badgeRadius}" fill="#ffffff" stroke="${darkColor}" stroke-width="4" />
        </svg>
      `);

      const logoSize = Math.round(badgeSize * 0.82);
      const logoBuffer = await sharp(LOGO_PATH)
        .resize(logoSize, logoSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .toBuffer();

      return await sharp(qrBuffer)
        .composite([
          { input: badgeSvg, gravity: 'center' },
          { input: logoBuffer, gravity: 'center' }
        ])
        .png({ quality: 95 })
        .toBuffer();
    } catch (err) {
      console.warn('Sharp compositing failed, falling back:', err.message);
    }
  }

  // Fallback high-contrast QR with error correction H
  return await QRCode.toBuffer(targetUrl, {
    type: 'png',
    width,
    margin: 3,
    color: {
      dark: darkColor,
      light: lightColor
    },
    errorCorrectionLevel: 'H'
  });
}

module.exports = { generateStyledQr };
