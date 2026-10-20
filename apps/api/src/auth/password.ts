import * as crypto from 'node:crypto';

/**
 * RFC 9106 Argon2id Password Hashing & Verification Engine.
 *
 * - Produces standard PHC-formatted `$argon2id$v=19$m=...,t=...,p=...$<saltB64>$<tagB64>` hashes.
 * - Uses an exact RFC 9106 Argon2id (`y = 2`, `v = 0x13`) implementation backed by `node:crypto`
 *   `blake2b512` so zero native C++ addon build failures or lockfile drift occur across platforms.
 * - Also verifies `$scrypt$n=16384,r=8,p=1$...` development seed hashes in constant time and
 *   flags `needsRehash: true` so seeded development accounts upgrade to Argon2id on login.
 */

export interface Argon2idParams {
  readonly memoryKiB: number;
  readonly passes: number;
  readonly parallelism: number;
  readonly tagLength: number;
}

const DEFAULT_ARGON2ID_PARAMS: Argon2idParams = {
  memoryKiB: 256,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
};

const BLAKE2B_IV = new BigUint64Array([
  0x6a09e667f3bcc908n,
  0xbb67ae8584caa73bn,
  0x3c6ef372fe94f82bn,
  0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n,
  0x9b05688c2b3e6c1fn,
  0x1f83d9abfb41bd6bn,
  0x5be0cd19137e2179n,
]);

const BLAKE2B_SIGMA: ReadonlyArray<readonly number[]> = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
];

const MASK64 = 0xffffffffffffffffn;
const MASK32 = 0xffffffffn;

function rotr64(x: bigint, n: bigint): bigint {
  return ((x >> n) | ((x << (64n - n)) & MASK64)) & MASK64;
}

function blake2bVariable(input: Buffer, outLen = 64): Buffer {
  if (outLen === 64) {
    return crypto.createHash('blake2b512').update(input).digest();
  }

  const h = new BigUint64Array(BLAKE2B_IV);
  h[0] = ((h[0] ?? 0n) ^ (0x01010000n ^ BigInt(outLen))) & MASK64;

  const v = new BigUint64Array(16);
  const m = new BigUint64Array(16);
  let tLow = 0n;
  let offset = 0;
  const totalLen = input.length;

  const gMix = (a: number, b: number, c: number, d: number, x: bigint, y: bigint): void => {
    v[a] = ((v[a] ?? 0n) + (v[b] ?? 0n) + x) & MASK64;
    v[d] = rotr64((v[d] ?? 0n) ^ (v[a] ?? 0n), 32n);
    v[c] = ((v[c] ?? 0n) + (v[d] ?? 0n)) & MASK64;
    v[b] = rotr64((v[b] ?? 0n) ^ (v[c] ?? 0n), 24n);
    v[a] = ((v[a] ?? 0n) + (v[b] ?? 0n) + y) & MASK64;
    v[d] = rotr64((v[d] ?? 0n) ^ (v[a] ?? 0n), 16n);
    v[c] = ((v[c] ?? 0n) + (v[d] ?? 0n)) & MASK64;
    v[b] = rotr64((v[b] ?? 0n) ^ (v[c] ?? 0n), 63n);
  };

  const compressBlock = (block: Buffer, isLast: boolean): void => {
    for (let i = 0; i < 8; i++) {
      v[i] = h[i] ?? 0n;
      v[i + 8] = BLAKE2B_IV[i] ?? 0n;
    }
    v[12] = ((v[12] ?? 0n) ^ tLow) & MASK64;
    if (isLast) {
      v[14] = ~(v[14] ?? 0n) & MASK64;
    }
    for (let i = 0; i < 16; i++) {
      m[i] = block.readBigUInt64LE(i * 8);
    }
    for (let r = 0; r < 12; r++) {
      const s = BLAKE2B_SIGMA[r] ?? [];
      gMix(0, 4, 8, 12, m[s[0] ?? 0] ?? 0n, m[s[1] ?? 0] ?? 0n);
      gMix(1, 5, 9, 13, m[s[2] ?? 0] ?? 0n, m[s[3] ?? 0] ?? 0n);
      gMix(2, 6, 10, 14, m[s[4] ?? 0] ?? 0n, m[s[5] ?? 0] ?? 0n);
      gMix(3, 7, 11, 15, m[s[6] ?? 0] ?? 0n, m[s[7] ?? 0] ?? 0n);
      gMix(0, 5, 10, 15, m[s[8] ?? 0] ?? 0n, m[s[9] ?? 0] ?? 0n);
      gMix(1, 6, 11, 12, m[s[10] ?? 0] ?? 0n, m[s[11] ?? 0] ?? 0n);
      gMix(2, 7, 8, 13, m[s[12] ?? 0] ?? 0n, m[s[13] ?? 0] ?? 0n);
      gMix(3, 4, 9, 14, m[s[14] ?? 0] ?? 0n, m[s[15] ?? 0] ?? 0n);
    }
    for (let i = 0; i < 8; i++) {
      h[i] = ((h[i] ?? 0n) ^ (v[i] ?? 0n) ^ (v[i + 8] ?? 0n)) & MASK64;
    }
  };

  while (totalLen - offset > 128) {
    tLow += 128n;
    compressBlock(input.subarray(offset, offset + 128), false);
    offset += 128;
  }

  const lastBlock = Buffer.alloc(128);
  input.copy(lastBlock, 0, offset, totalLen);
  tLow += BigInt(totalLen - offset);
  compressBlock(lastBlock, true);

  const out = Buffer.alloc(64);
  for (let i = 0; i < 8; i++) {
    out.writeBigUInt64LE(h[i] ?? 0n, i * 8);
  }
  return out.subarray(0, outLen);
}

function blake2bLong(input: Buffer, outLen: number): Buffer {
  const outLenBytes = Buffer.alloc(4);
  outLenBytes.writeUInt32LE(outLen, 0);
  const prefixed = Buffer.concat([outLenBytes, input]);

  if (outLen <= 64) {
    return blake2bVariable(prefixed, outLen);
  }

  const r = Math.ceil(outLen / 32) - 2;
  const chunks: Buffer[] = [];
  let v = blake2bVariable(prefixed, 64);
  chunks.push(Buffer.from(v.subarray(0, 32)));

  for (let i = 1; i < r; i++) {
    v = blake2bVariable(v, 64);
    chunks.push(Buffer.from(v.subarray(0, 32)));
  }

  const remaining = outLen - 32 * r;
  v = blake2bVariable(v, remaining);
  chunks.push(Buffer.from(v));

  return Buffer.concat(chunks, outLen);
}

function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function fBlaMka(x: bigint, y: bigint): bigint {
  const m = (x & MASK32) * (y & MASK32);
  return (x + y + 2n * m) & MASK64;
}

function gRound(v: BigUint64Array, a: number, b: number, c: number, d: number): void {
  v[a] = fBlaMka(v[a] ?? 0n, v[b] ?? 0n);
  v[d] = rotr64((v[d] ?? 0n) ^ (v[a] ?? 0n), 32n);
  v[c] = fBlaMka(v[c] ?? 0n, v[d] ?? 0n);
  v[b] = rotr64((v[b] ?? 0n) ^ (v[c] ?? 0n), 24n);
  v[a] = fBlaMka(v[a] ?? 0n, v[b] ?? 0n);
  v[d] = rotr64((v[d] ?? 0n) ^ (v[a] ?? 0n), 16n);
  v[c] = fBlaMka(v[c] ?? 0n, v[d] ?? 0n);
  v[b] = rotr64((v[b] ?? 0n) ^ (v[c] ?? 0n), 63n);
}

function pRound(
  v: BigUint64Array,
  i0: number,
  i1: number,
  i2: number,
  i3: number,
  i4: number,
  i5: number,
  i6: number,
  i7: number,
  i8: number,
  i9: number,
  i10: number,
  i11: number,
  i12: number,
  i13: number,
  i14: number,
  i15: number,
): void {
  gRound(v, i0, i4, i8, i12);
  gRound(v, i1, i5, i9, i13);
  gRound(v, i2, i6, i10, i14);
  gRound(v, i3, i7, i11, i15);
  gRound(v, i0, i5, i10, i15);
  gRound(v, i1, i6, i11, i12);
  gRound(v, i2, i7, i8, i13);
  gRound(v, i3, i4, i9, i14);
}

function compressG(
  X: BigUint64Array,
  Y: BigUint64Array,
  out: BigUint64Array,
  xorWithOut: boolean,
): void {
  const R = new BigUint64Array(128);
  const Q = new BigUint64Array(128);
  for (let i = 0; i < 128; i++) {
    const val = (X[i] ?? 0n) ^ (Y[i] ?? 0n);
    R[i] = val;
    Q[i] = val;
  }

  for (let row = 0; row < 8; row++) {
    const o = row * 16;
    pRound(
      Q,
      o,
      o + 1,
      o + 2,
      o + 3,
      o + 4,
      o + 5,
      o + 6,
      o + 7,
      o + 8,
      o + 9,
      o + 10,
      o + 11,
      o + 12,
      o + 13,
      o + 14,
      o + 15,
    );
  }

  for (let col = 0; col < 8; col++) {
    const c = col * 2;
    pRound(
      Q,
      c,
      c + 1,
      c + 16,
      c + 17,
      c + 32,
      c + 33,
      c + 48,
      c + 49,
      c + 64,
      c + 65,
      c + 80,
      c + 81,
      c + 96,
      c + 97,
      c + 112,
      c + 113,
    );
  }

  for (let i = 0; i < 128; i++) {
    const z = (R[i] ?? 0n) ^ (Q[i] ?? 0n);
    out[i] = xorWithOut ? (out[i] ?? 0n) ^ z : z;
  }
}

export function computeArgon2idRawTag(
  password: Buffer,
  salt: Buffer,
  params: Argon2idParams,
  secret: Buffer = Buffer.alloc(0),
  associatedData: Buffer = Buffer.alloc(0),
): Buffer {
  const { memoryKiB: m, passes: t, parallelism: p, tagLength } = params;
  const y = 2; // Argon2id
  const v = 0x13;

  const h0Input = Buffer.concat([
    u32le(p),
    u32le(tagLength),
    u32le(m),
    u32le(t),
    u32le(v),
    u32le(y),
    u32le(password.length),
    password,
    u32le(salt.length),
    salt,
    u32le(secret.length),
    secret,
    u32le(associatedData.length),
    associatedData,
  ]);

  const H0 = blake2bVariable(h0Input, 64);
  const mPrime = 4 * p * Math.floor(m / (4 * p));
  const q = mPrime / p;
  const segmentLength = q / 4;

  const B = Array.from({ length: mPrime }, () => new BigUint64Array(128));
  const emptyFallbackBlock = new BigUint64Array(128);

  const bufToBlock = (buf: Buffer, block: BigUint64Array): void => {
    for (let i = 0; i < 128; i++) {
      block[i] = buf.readBigUInt64LE(i * 8);
    }
  };

  const blockToBuf = (block: BigUint64Array): Buffer => {
    const buf = Buffer.alloc(1024);
    for (let i = 0; i < 128; i++) {
      buf.writeBigUInt64LE(block[i] ?? 0n, i * 8);
    }
    return buf;
  };

  for (let lane = 0; lane < p; lane++) {
    bufToBlock(
      blake2bLong(Buffer.concat([H0, u32le(0), u32le(lane)]), 1024),
      B[lane * q] ?? emptyFallbackBlock,
    );
    bufToBlock(
      blake2bLong(Buffer.concat([H0, u32le(1), u32le(lane)]), 1024),
      B[lane * q + 1] ?? emptyFallbackBlock,
    );
  }

  const zeroBlock = new BigUint64Array(128);
  const inputBlock = new BigUint64Array(128);
  const addressBlock = new BigUint64Array(128);
  const tmpBlock = new BigUint64Array(128);

  for (let pass = 0; pass < t; pass++) {
    for (let slice = 0; slice < 4; slice++) {
      const dataIndependent = pass === 0 && slice < 2;
      for (let lane = 0; lane < p; lane++) {
        let addrCounter = 0;
        if (dataIndependent) {
          inputBlock.fill(0n);
          inputBlock[0] = BigInt(pass);
          inputBlock[1] = BigInt(lane);
          inputBlock[2] = BigInt(slice);
          inputBlock[3] = BigInt(mPrime);
          inputBlock[4] = BigInt(t);
          inputBlock[5] = BigInt(y);
        }

        const startIdx = pass === 0 && slice === 0 ? 2 : 0;
        for (let idx = startIdx; idx < segmentLength; idx++) {
          const currOffset = slice * segmentLength + idx;
          const prevOffset = currOffset === 0 ? q - 1 : currOffset - 1;

          let j1: number;
          let j2: number;
          if (dataIndependent) {
            if (idx % 128 === 0 || addrCounter === 0) {
              addrCounter += 1;
              inputBlock[6] = BigInt(addrCounter);
              compressG(zeroBlock, inputBlock, tmpBlock, false);
              compressG(zeroBlock, tmpBlock, addressBlock, false);
            }
            const pseudoRand = addressBlock[idx % 128] ?? 0n;
            j1 = Number(pseudoRand & MASK32);
            j2 = Number((pseudoRand >> 32n) & MASK32);
          } else {
            const prevBlock = B[lane * q + prevOffset] ?? emptyFallbackBlock;
            const pseudoRand = prevBlock[0] ?? 0n;
            j1 = Number(pseudoRand & MASK32);
            j2 = Number((pseudoRand >> 32n) & MASK32);
          }

          const refLane = pass === 0 && slice === 0 ? lane : j2 % p;
          let refAreaSize: number;
          if (pass === 0) {
            if (slice === 0) {
              refAreaSize = idx - 1;
            } else if (refLane === lane) {
              refAreaSize = slice * segmentLength + idx - 1;
            } else {
              refAreaSize = slice * segmentLength - (idx === 0 ? 1 : 0);
            }
          } else if (refLane === lane) {
            refAreaSize = q - segmentLength + idx - 1;
          } else {
            refAreaSize = q - segmentLength - (idx === 0 ? 1 : 0);
          }

          const relPos = BigInt(j1);
          const x = (relPos * relPos) >> 32n;
          const yPos = (BigInt(refAreaSize) * x) >> 32n;
          const refPos = Number(BigInt(refAreaSize) - 1n - yPos);
          const startPos = pass === 0 ? 0 : ((slice + 1) % 4) * segmentLength;
          const refIndex = (startPos + refPos) % q;

          compressG(
            B[lane * q + prevOffset] ?? emptyFallbackBlock,
            B[refLane * q + refIndex] ?? emptyFallbackBlock,
            B[lane * q + currOffset] ?? emptyFallbackBlock,
            pass > 0,
          );
        }
      }
    }
  }

  const finalBlock = new BigUint64Array(B[q - 1] ?? emptyFallbackBlock);
  for (let lane = 1; lane < p; lane++) {
    const laneLast = B[lane * q + (q - 1)] ?? emptyFallbackBlock;
    for (let i = 0; i < 128; i++) {
      finalBlock[i] = (finalBlock[i] ?? 0n) ^ (laneLast[i] ?? 0n);
    }
  }

  return blake2bLong(blockToBuf(finalBlock), tagLength);
}

function toBase64NoPad(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '');
}

function fromBase64NoPad(str: string): Buffer {
  const paddedLength = str.length + ((4 - (str.length % 4)) % 4);
  return Buffer.from(str.padEnd(paddedLength, '='), 'base64');
}

export function formatArgon2idPhc(salt: Buffer, tag: Buffer, params: Argon2idParams): string {
  return `$argon2id$v=19$m=${params.memoryKiB},t=${params.passes},p=${params.parallelism}$${toBase64NoPad(salt)}$${toBase64NoPad(tag)}`;
}

/**
 * Hashes a plaintext password using Argon2id (RFC 9106).
 */
export async function hashPassword(
  password: string,
  params: Argon2idParams = DEFAULT_ARGON2ID_PARAMS,
): Promise<string> {
  const salt = crypto.randomBytes(16);
  const tag = computeArgon2idRawTag(Buffer.from(password, 'utf8'), salt, params);
  return formatArgon2idPhc(salt, tag, params);
}

export interface PasswordVerificationResult {
  readonly valid: boolean;
  readonly needsRehash: boolean;
}

/**
 * Verifies a plaintext password against a stored `$argon2id$v=19$...` or development `$scrypt$...` hash
 * using constant-time comparison (`crypto.timingSafeEqual`).
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<PasswordVerificationResult> {
  if (!storedHash || typeof storedHash !== 'string') {
    return { valid: false, needsRehash: false };
  }

  if (storedHash.startsWith('$argon2id$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 6 || parts[1] !== 'argon2id' || parts[2] !== 'v=19') {
      return { valid: false, needsRehash: false };
    }

    const paramSegment = parts[3] ?? '';
    const saltB64 = parts[4] ?? '';
    const tagB64 = parts[5] ?? '';

    const paramMatch = /^m=(\d+),t=(\d+),p=(\d+)$/.exec(paramSegment);
    if (!paramMatch) {
      return { valid: false, needsRehash: false };
    }

    const memoryKiB = Number.parseInt(paramMatch[1] ?? '0', 10);
    const passes = Number.parseInt(paramMatch[2] ?? '0', 10);
    const parallelism = Number.parseInt(paramMatch[3] ?? '0', 10);

    if (
      !Number.isInteger(memoryKiB) ||
      memoryKiB < 8 * parallelism ||
      memoryKiB > 1048576 ||
      passes < 1 ||
      passes > 32 ||
      parallelism < 1 ||
      parallelism > 16
    ) {
      return { valid: false, needsRehash: false };
    }

    try {
      const salt = fromBase64NoPad(saltB64);
      const expectedTag = fromBase64NoPad(tagB64);
      if (salt.length < 8 || expectedTag.length < 16) {
        return { valid: false, needsRehash: false };
      }

      const computedTag = computeArgon2idRawTag(Buffer.from(password, 'utf8'), salt, {
        memoryKiB,
        passes,
        parallelism,
        tagLength: expectedTag.length,
      });

      if (computedTag.length !== expectedTag.length) {
        return { valid: false, needsRehash: false };
      }

      const valid = crypto.timingSafeEqual(computedTag, expectedTag);
      const needsRehash =
        valid &&
        (memoryKiB < DEFAULT_ARGON2ID_PARAMS.memoryKiB || passes < DEFAULT_ARGON2ID_PARAMS.passes);

      return { valid, needsRehash };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  if (storedHash.startsWith('$scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 5 || parts[1] !== 'scrypt') {
      return { valid: false, needsRehash: false };
    }

    const paramSegment = parts[2] ?? '';
    const salt = parts[3] ?? '';
    const expectedHex = parts[4] ?? '';

    const paramMatch = /^n=(\d+),r=(\d+),p=(\d+)$/.exec(paramSegment);
    if (!paramMatch || !salt || !expectedHex) {
      return { valid: false, needsRehash: false };
    }

    try {
      const N = Number.parseInt(paramMatch[1] ?? '0', 10);
      const r = Number.parseInt(paramMatch[2] ?? '0', 10);
      const p = Number.parseInt(paramMatch[3] ?? '0', 10);
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      const computedBuf = crypto.scryptSync(password, salt, expectedBuf.length, { N, r, p });

      if (computedBuf.length !== expectedBuf.length) {
        return { valid: false, needsRehash: false };
      }

      const valid = crypto.timingSafeEqual(computedBuf, expectedBuf);
      return { valid, needsRehash: valid };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  return { valid: false, needsRehash: false };
}

const DUMMY_ARGON2ID_HASH = formatArgon2idPhc(
  Buffer.alloc(16, 0x42),
  computeArgon2idRawTag(
    Buffer.from('devarena-dummy-timing-password', 'utf8'),
    Buffer.alloc(16, 0x42),
    DEFAULT_ARGON2ID_PARAMS,
  ),
  DEFAULT_ARGON2ID_PARAMS,
);

/**
 * Performs a dummy Argon2id verification when a login targets a nonexistent email
 * so timing side channels cannot distinguish missing accounts from wrong passwords.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_ARGON2ID_HASH);
}
