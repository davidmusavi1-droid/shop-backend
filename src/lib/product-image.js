const sharp = require('sharp');
const MAX_IMAGE_BYTES = 3 * 1000 * 1000;

async function prepareImage(input, decode = sharp) {
  if (!Buffer.isBuffer(input) || !input.length || input.length > MAX_IMAGE_BYTES) {
    const error = new Error('Photo exceeds the original-file limit');
    error.code = 'IMAGE_TOO_LARGE';
    throw error;
  }
  const picture = decode(input, { limitInputPixels: 50000000, failOn: 'warning' });
  const metadata = await picture.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Invalid photo');
  await picture.stats(); // Fully decode to reject truncated/forged files, without re-encoding.
  return { buffer: input, width: metadata.width, height: metadata.height, format: metadata.format };
}
module.exports = { prepareImage, MAX_IMAGE_BYTES };
