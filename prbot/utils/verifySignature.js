const crypto = require('crypto');
const config = require('../config');

// ต้องใช้ raw body (Buffer) ไม่ใช่ JSON ที่ parse แล้ว ไม่งั้น HMAC จะไม่ตรงกัน
function verifySignature(rawBody, signatureHeader) {
    if (!signatureHeader || !config.webhookSecret) return false;

    const expected = 'sha256=' + crypto
        .createHmac('sha256', config.webhookSecret)
        .update(rawBody)
        .digest('hex');

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signatureHeader);

    // timingSafeEqual throws if buffers have different lengths, so guard first
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

module.exports = { verifySignature };
