const sharp = require('sharp');
const MAX_IMAGE_BYTES = 3 * 1000 * 1000;

async function prepareImage(input, decode = sharp) {
  const picture = decode(input, { limitInputPixels: 50000000, failOn: 'warning' });
  const metadata = await picture.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Invalid photo');
  // Start with high quality. Re-encode from the source, never from a lossy intermediate.
  // No upscaling, cropping or EXIF/GPS retention. 3 MB is a ceiling, not a target.
  for (const quality of [95, 92, 89, 86]) {
    const { data, info } = await picture.clone().rotate()
      .resize({ width: 3200, height: 3200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality }).toBuffer({ resolveWithObject: true });
    if (data.length <= MAX_IMAGE_BYTES) return { buffer: data, width: info.width, height: info.height };
  }
  const error = new Error('Photo exceeds quality budget');
  error.code = 'IMAGE_TOO_LARGE';
  throw error;
}
module.exports = { prepareImage, MAX_IMAGE_BYTES };
