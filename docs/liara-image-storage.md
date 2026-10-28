# MOTIF image storage on Liara

New uploads use Liara S3-compatible object storage only. The S3 SDK is a client library; the application does not use an Amazon storage service or Cloudinary fallback. Existing saved image URLs are unchanged.

## Release status

This repository change is a reconstruction of the upload integration. The previously reported v5 package was not available for comparison. Its deployed environment names and the active Liara release must be checked before merging into main, since main may deploy automatically.

## Configuration

Configure one complete family on the existing Liara application. Do not buy or create another bucket. Values below are descriptions, not credentials:

| Variable | Value |
| --- | --- |
| LIARA_ENDPOINT | HTTPS S3 endpoint copied from the existing Iran bucket's panel |
| LIARA_BUCKET | Existing bucket name, expected `motif-images`; verify in panel |
| LIARA_ACCESS_KEY | Existing access key, server-side only |
| LIARA_SECRET_KEY | Existing secret key, server-side only |
| LIARA_PUBLIC_URL | Public HTTPS base URL of that bucket, including the bucket path if required; object keys are appended to this URL |
| LIARA_REGION | Region expected by the S3 endpoint; defaults to `us-east-1` signing scope |

For compatibility, a complete `S3_` family with identical suffixes is supported. Within a family, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `BUCKET_NAME`, and `PUBLIC_BASE_URL` are accepted aliases. Do not mix incomplete families. Endpoint and public URL are distinct settings. A `.liara.cloud`, `.liara.space` , `.liara.ir` or `.liara.site` suffix alone does not establish Iran residency: confirm the bucket's region in the panel. Public URL must point to this same domestic bucket/custom domain.

The existing bucket needs public read access for product images. Upload credentials must permit PutObject. This code does not modify bucket ACLs, create buckets, or log credentials. Missing/invalid configuration returns a safe 503 after the admin check; storage failures return 502.

## Photo policy

- Input: JPEG, PNG or WebP, up to 10 MiB / 50 megapixels; no animations.
- Output: WebP, at most 3,000,000 bytes (3 MB), longest side at most 3200 pixels.
- Quality starts at 95; only retry at 92, 89, 86 if necessary. Each attempt uses the original source. If still too large, reject with a clear 413 instead of degrading further.
- Preserve aspect ratio and orientation; no upscaling or cropping. Remove EXIF/GPS.
- A file under 1 MB is acceptable when high-quality encoding naturally produces that size. There is no 2 MB minimum.
- Raw originals are not archived by this endpoint; retain source photos separately.
- This change does not add thumbnail variants or modify gallery rendering.

## Before production release

1. Compare the active Liara release/source with this branch and inspect only environment variable names to match the configuration family.
2. Confirm existing Iran bucket, public base URL and PutObject permission; do not disclose keys.
3. Run `npm test`, build and existing browser/integration CI.
4. Deploy a reviewed commit. Upload an actual garment photo through the admin panel; verify the returned URL is public, served by the domestic bucket, and below 3 MB. Inspect fabric/label detail at full size.
5. Save the product and confirm the image persists after reloading. Verify the deployed commit matches GitHub so an automatic build cannot restore the old upload implementation.

Local tests use fake storage and do not establish live credentials, residency, or public access. A real upload remains required.

The provided panel screenshots show endpoint `https://storage.iran.liara.site`, bucket `motif-images` and public base `https://motif-images.storage.iran.liara.site`. The variable names are truncated in the mobile inputs; verify their complete names before release. No credential values are recorded here.
