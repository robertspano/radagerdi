/* Apple Wallet (.pkpass) generator for Ráðagerði gift cards — zero npm deps.
 * Signing requires an Apple Developer Pass Type ID certificate. Configure EITHER:
 *   - env vars:  PASS_TYPE_ID, PASS_TEAM_ID, PASS_CERT_B64, PASS_KEY_B64, PASS_WWDR_B64  (base64 PEM)
 *   - or files:  <DATA_DIR>/certs/{signerCert.pem, signerKey.pem, wwdr.pem} + pass-config.json
 *                pass-config.json = { "passTypeIdentifier": "pass.is.radagerdi.gjafabref", "teamIdentifier": "XXXXXXXXXX" }
 * Until configured, isConfigured() returns false and the wallet page hides the button.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ASSET_DIR = path.join(__dirname, 'pass-assets');

// ---------- config ----------
function loadConfig(dataDir) {
  // env first (Render), then files (localhost)
  if (process.env.PASS_TYPE_ID && process.env.PASS_TEAM_ID && process.env.PASS_CERT_B64 && process.env.PASS_KEY_B64 && process.env.PASS_WWDR_B64) {
    return {
      passTypeIdentifier: process.env.PASS_TYPE_ID,
      teamIdentifier: process.env.PASS_TEAM_ID,
      cert: Buffer.from(process.env.PASS_CERT_B64, 'base64').toString('utf8'),
      key: Buffer.from(process.env.PASS_KEY_B64, 'base64').toString('utf8'),
      wwdr: Buffer.from(process.env.PASS_WWDR_B64, 'base64').toString('utf8'),
    };
  }
  try {
    const certDir = path.join(dataDir, 'certs');
    const cfg = JSON.parse(fs.readFileSync(path.join(certDir, 'pass-config.json'), 'utf8'));
    return {
      passTypeIdentifier: cfg.passTypeIdentifier,
      teamIdentifier: cfg.teamIdentifier,
      cert: fs.readFileSync(path.join(certDir, 'signerCert.pem'), 'utf8'),
      key: fs.readFileSync(path.join(certDir, 'signerKey.pem'), 'utf8'),
      wwdr: fs.readFileSync(path.join(certDir, 'wwdr.pem'), 'utf8'),
    };
  } catch (e) { return null; }
}
function isConfigured(dataDir) { return loadConfig(dataDir) != null; }

// ---------- crc32 (for zip) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---------- minimal zip writer (deflate) ----------
function buildZip(files) { // files: [{name, data:Buffer}]
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const raw = f.data;
    const comp = zlib.deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const nameB = Buffer.from(f.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);  // local file header
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // utf-8 flag
    local.writeUInt16LE(8, 8);           // deflate
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); // time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameB.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameB, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameB.length, 28);
    cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32); cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameB);
    offset += local.length + nameB.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

// ---------- signing (PKCS#7 detached via openssl) ----------
function signManifest(manifestBuf, cfg) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rgpass-'));
  try {
    const mPath = path.join(tmp, 'manifest.json');
    const certP = path.join(tmp, 'cert.pem');
    const keyP = path.join(tmp, 'key.pem');
    const wwdrP = path.join(tmp, 'wwdr.pem');
    const sigP = path.join(tmp, 'signature');
    fs.writeFileSync(mPath, manifestBuf);
    fs.writeFileSync(certP, cfg.cert); fs.writeFileSync(keyP, cfg.key); fs.writeFileSync(wwdrP, cfg.wwdr);
    execFileSync('openssl', ['smime', '-binary', '-sign', '-certfile', wwdrP, '-signer', certP, '-inkey', keyP,
      '-in', mPath, '-out', sigP, '-outform', 'DER'], { stdio: 'pipe' });
    return fs.readFileSync(sigP);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- pass builder ----------
function kr(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' kr.'; }

function buildPass(card, baseUrl, dataDir) {
  const cfg = loadConfig(dataDir);
  if (!cfg) return null;
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeIdentifier,
    teamIdentifier: cfg.teamIdentifier,
    serialNumber: card.id,
    organizationName: 'Ráðagerði Veitingahús',
    description: 'Ráðagerði gjafabréf',
    logoText: 'RÁÐAGERÐI',
    foregroundColor: 'rgb(255,255,255)',
    backgroundColor: 'rgb(98,159,103)',
    labelColor: 'rgb(230,242,232)',
    barcodes: [{
      format: 'PKBarcodeFormatQR',
      message: baseUrl + '/gjafabref/' + card.id,
      messageEncoding: 'iso-8859-1',
      altText: card.id.slice(0, 8).toUpperCase(),
    }],
    storeCard: {
      primaryFields: [{ key: 'balance', label: 'INNEIGN', value: kr(card.balance) }],
      secondaryFields: [{ key: 'holder', label: 'HANDHAFI', value: card.name }],
      backFields: [
        { key: 'about', label: 'Um gjafabréfið', value: 'Sýndu QR-kóðann við kassann — starfsfólk skannar hann og dregur af inneigninni. Nýjasta staða inneignar sést alltaf á ' + baseUrl + '/gjafabref/' + card.id },
        { key: 'restaurant', label: 'Ráðagerði Veitingahús', value: 'Ráðagerði, 170 Seltjarnarnes · +354 546 1700 · radagerdi@radagerdi170.is' },
      ],
    },
  };
  const files = [
    { name: 'pass.json', data: Buffer.from(JSON.stringify(passJson), 'utf8') },
    { name: 'icon.png', data: fs.readFileSync(path.join(ASSET_DIR, 'icon.png')) },
    { name: 'icon@2x.png', data: fs.readFileSync(path.join(ASSET_DIR, 'icon@2x.png')) },
    { name: 'icon@3x.png', data: fs.readFileSync(path.join(ASSET_DIR, 'icon@3x.png')) },
    { name: 'logo.png', data: fs.readFileSync(path.join(ASSET_DIR, 'logo.png')) },
    { name: 'logo@2x.png', data: fs.readFileSync(path.join(ASSET_DIR, 'logo@2x.png')) },
  ];
  const manifest = {};
  for (const f of files) manifest[f.name] = crypto.createHash('sha1').update(f.data).digest('hex');
  const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');
  const signature = signManifest(manifestBuf, cfg);
  files.push({ name: 'manifest.json', data: manifestBuf });
  files.push({ name: 'signature', data: signature });
  return buildZip(files);
}

module.exports = { buildPass, isConfigured };
