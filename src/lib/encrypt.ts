import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12   // GCM 권장 IV 크기
const TAG_BYTES = 16  // GCM auth tag

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) throw new Error('ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.')
  if (hex.length !== 64) throw new Error('ENCRYPTION_KEY는 32바이트(64자리 hex)여야 합니다.')
  return Buffer.from(hex, 'hex')
}

/**
 * AES-256-GCM 암호화
 * 반환 형식: <iv 24hex><tag 32hex><ciphertext hex>
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex')
}

/**
 * AES-256-GCM 복호화
 * null 반환 = 복호화 실패 (키 불일치, 위변조 등)
 */
export function decrypt(ciphertext: string): string | null {
  try {
    const key = getKey()
    const iv = Buffer.from(ciphertext.slice(0, IV_BYTES * 2), 'hex')
    const tag = Buffer.from(ciphertext.slice(IV_BYTES * 2, (IV_BYTES + TAG_BYTES) * 2), 'hex')
    const encrypted = Buffer.from(ciphertext.slice((IV_BYTES + TAG_BYTES) * 2), 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
  } catch {
    return null
  }
}

/** 값이 있을 때만 암호화, null이면 그대로 반환 */
export function encryptNullable(value: string | null | undefined): string | null {
  if (!value) return null
  return encrypt(value)
}

/** 값이 있을 때만 복호화, null이면 그대로 반환 */
export function decryptNullable(value: string | null | undefined): string | null {
  if (!value) return null
  return decrypt(value)
}
