import { AwsClient } from "aws4fetch";

/* Подписанные ссылки на хранилище R2 (S3-адрес, не публичный r2.dev). */
export function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  const client = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, region: "auto", service: "s3" });
  const base = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`;
  return {
    async signPut(key: string, seconds = 3600) {
      return (await client.sign(`${base}/${key}?X-Amz-Expires=${seconds}`, { method: "PUT", aws: { signQuery: true } })).url;
    },
    async signGet(key: string, seconds = 3600) {
      return (await client.sign(`${base}/${key}?X-Amz-Expires=${seconds}`, { method: "GET", aws: { signQuery: true } })).url;
    },
  };
}
